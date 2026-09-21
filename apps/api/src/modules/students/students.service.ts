import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import {
  deptFilter,
  isDeptScoped,
  sectionScope,
  seesWholeDepartment,
  studentScope,
} from '../../common/utils/dept-scope';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BulkAssignMajorDto,
  CreateStudentDto,
  ListStudentsQuery,
  SortDirection,
  UpdateStudentDto,
} from './dto/student.dto';

/** Trần option lớp học phần cho dropdown bộ lọc (xem `filterOptions`). */
const SECTION_OPTIONS_LIMIT = 500;

/**
 * Thay mảng enrollments thô bằng tổng số buổi vắng (cột "Số buổi vắng" ở trang
 * danh sách). `absentSessions = null` khi chưa có dữ liệu điểm danh nào để phân
 * biệt với "0 buổi"; `maxSectionAbsent` là số vắng cao nhất trong một lớp học
 * phần — ngưỡng cảnh báo tự động (2 → L2, ≥ 3 → L3) tính theo từng lớp.
 */
function withAbsenceSummary<
  T extends { enrollments: { absentSessions: number | null }[] },
>(student: T) {
  const { enrollments, ...rest } = student;
  const recorded = enrollments
    .map((enrollment) => enrollment.absentSessions)
    .filter((value): value is number => value !== null);
  return {
    ...rest,
    absentSessions:
      recorded.length > 0
        ? recorded.reduce((sum, value) => sum + value, 0)
        : null,
    maxSectionAbsent: recorded.length > 0 ? Math.max(...recorded) : null,
  };
}

/**
 * Gom theo lớp (A→Z) rồi xếp id theo chỉ số (buổi vắng / cảnh báo mở) trong
 * từng lớp — giảng viên chăm sóc theo lớp nên cần thấy "ai vắng nhiều nhất lớp
 * này". `null` = chưa có dữ liệu → luôn nằm cuối lớp dù tăng hay giảm, để "chưa
 * điểm danh" không lẫn với "0 buổi". Hoà thì theo MSSV cho thứ tự ổn định.
 */
export function rankStudentIds(
  students: readonly { id: string; studentCode: string; classCode: string }[],
  valueOf: (studentId: string) => number | null,
  direction: SortDirection,
): string[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...students]
    .sort((a, b) => {
      const byClass = a.classCode.localeCompare(b.classCode);
      if (byClass !== 0) return byClass;
      const left = valueOf(a.id);
      const right = valueOf(b.id);
      if (left !== right) {
        if (left === null) return 1;
        if (right === null) return -1;
        return (left - right) * sign;
      }
      return a.studentCode.localeCompare(b.studentCode);
    })
    .map((student) => student.id);
}

/** `{ classCode: majorId[] }` — lớp chỉ có SV chưa gán ngành vẫn có khóa (mảng rỗng). */
function groupMajorsByClass(
  rows: readonly { classCode: string; majorId: string | null }[],
): Record<string, string[]> {
  return rows.reduce<Record<string, string[]>>(
    (acc, { classCode, majorId }) => {
      const current = acc[classCode] ?? [];
      return {
        ...acc,
        [classCode]: majorId ? [...current, majorId] : current,
      };
    },
    {},
  );
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: ListStudentsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Kỳ, giảng viên và lớp học phần đều nằm phía ClassSection, nối qua
    // Enrollment. Dùng CHUNG điều kiện cho bộ lọc và cho cột "Số buổi vắng" để
    // số vắng hiển thị đúng phạm vi đang lọc (vd. chỉ kỳ FA26).
    const hasEnrollmentFilter = Boolean(
      query.term || query.lecturerId || query.sectionId,
    );
    const enrollmentWhere: Prisma.EnrollmentWhereInput = {
      ...(query.sectionId ? { classSectionId: query.sectionId } : {}),
      classSection: {
        ...(query.term ? { term: query.term } : {}),
        ...(query.lecturerId ? { lecturerId: query.lecturerId } : {}),
      },
    };

    const where: Prisma.StudentWhereInput = {
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      // missingMajor thắng majorId: hai bộ lọc loại trừ nhau về nghĩa
      // (cùng quy ước với `unassigned` trong class-sections.service.ts).
      ...(query.missingMajor
        ? { majorId: null }
        : query.majorId
          ? { majorId: query.majorId }
          : {}),
      // Scope đặt SAU filter query để luôn thắng với người dùng bị giới hạn.
      ...studentScope(user),
      ...(query.classCode ? { classCode: query.classCode } : {}),
      // Gộp vào CÙNG một `some` để "kỳ SU25 + thầy A" nghĩa là học phần kỳ
      // SU25 do thầy A dạy, chứ không phải hai lần đăng ký rời nhau.
      ...(hasEnrollmentFilter
        ? { enrollments: { some: enrollmentWhere } }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { studentCode: { contains: query.search, mode: 'insensitive' } },
              { fullName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const include = {
      major: { select: { id: true, code: true, name: true } },
      department: { select: { id: true, code: true, name: true } },
      _count: {
        select: { alerts: { where: { status: { not: 'RESOLVED' as const } } } },
      },
      enrollments: {
        where: enrollmentWhere,
        select: { absentSessions: true },
      },
    } satisfies Prisma.StudentInclude;

    if (query.sortBy) {
      return this.listSortedByMetric(where, enrollmentWhere, include, {
        ...query,
        page,
        limit,
      });
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        orderBy: { studentCode: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include,
      }),
      this.prisma.student.count({ where }),
    ]);

    return {
      items: items.map(withAbsenceSummary),
      meta: { total, page, limit },
    };
  }

  /**
   * Sắp xếp theo số liệu gộp (tổng buổi vắng, số cảnh báo mở) — Prisma không
   * `orderBy` được theo tổng có điều kiện, nên xếp hạng id trong phạm vi rồi mới
   * nạp chi tiết đúng một trang. `where` đã chứa `studentScope` nên cả tập id lẫn
   * số liệu gộp đều không vượt phạm vi người dùng (RULE 2).
   */
  private async listSortedByMetric(
    where: Prisma.StudentWhereInput,
    enrollmentWhere: Prisma.EnrollmentWhereInput,
    include: Prisma.StudentInclude & {
      enrollments: {
        where: Prisma.EnrollmentWhereInput;
        select: { absentSessions: true };
      };
    },
    query: ListStudentsQuery & { page: number; limit: number },
  ) {
    const { page, limit } = query;
    const [students, metric] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: { id: true, studentCode: true, classCode: true },
      }),
      this.sortMetric(where, enrollmentWhere, query.sortBy!),
    ]);

    const rankedIds = rankStudentIds(
      students,
      (id) => metric.values.get(id) ?? metric.missing,
      query.sortDir ?? 'desc',
    );
    const pageIds = rankedIds.slice((page - 1) * limit, page * limit);
    const rows = await this.prisma.student.findMany({
      where: { id: { in: pageIds } },
      include,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = pageIds
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => row !== undefined);

    return {
      items: items.map(withAbsenceSummary),
      meta: { total: rankedIds.length, page, limit },
    };
  }

  /** studentId → chỉ số dùng để xếp; `missing` là giá trị cho SV không có dòng nào. */
  private async sortMetric(
    where: Prisma.StudentWhereInput,
    enrollmentWhere: Prisma.EnrollmentWhereInput,
    sortBy: NonNullable<ListStudentsQuery['sortBy']>,
  ): Promise<{ values: Map<string, number | null>; missing: number | null }> {
    if (sortBy === 'openAlerts') {
      const rows = await this.prisma.alert.groupBy({
        by: ['studentId'],
        where: { status: { not: 'RESOLVED' }, student: where },
        _count: { _all: true },
      });
      // Không có cảnh báo mở là 0 thật, không phải "chưa có dữ liệu".
      return {
        values: new Map(rows.map((row) => [row.studentId, row._count._all])),
        missing: 0,
      };
    }
    // Cùng điều kiện kỳ/lớp HP với cột "Số buổi vắng" để thứ tự khớp số hiển thị.
    const rows = await this.prisma.enrollment.groupBy({
      by: ['studentId'],
      where: { ...enrollmentWhere, student: where },
      _sum: { absentSessions: true },
    });
    return {
      values: new Map(
        rows.map((row) => [row.studentId, row._sum.absentSessions]),
      ),
      missing: null,
    };
  }

  /**
   * Nguồn cấp option cho bộ lọc trang danh sách sinh viên. Tất cả đều giới hạn
   * theo bộ môn (RULE 2): người dùng bị scope không được biết bộ môn khác có
   * lớp, ngành hay giảng viên nào.
   */
  async filterOptions(user: AuthUser) {
    const scope = studentScope(user);
    const sections = sectionScope(user);
    // Ngành hiện trong bộ lọc = ngành của sinh viên trong phạm vi. Trưởng bộ môn
    // thấy thêm mọi ngành của bộ môn mình (kể cả ngành chưa có sinh viên nào);
    // giảng viên thuần thì KHÔNG được biết bộ môn có những ngành nào khác.
    const majorWhere: Prisma.MajorWhereInput = isDeptScoped(user)
      ? {
          OR: [
            { students: { some: scope } },
            ...(seesWholeDepartment(user) ? [deptFilter(user)] : []),
          ],
        }
      : {};

    // Bộ môn chỉ để gọi tên chip "Bộ môn" khi mở từ thẻ bộ môn ở Tổng quan —
    // người bị scope chỉ thấy bộ môn có sinh viên trong phạm vi mình.
    const departmentWhere: Prisma.DepartmentWhereInput = {
      isActive: true,
      ...(isDeptScoped(user) ? { students: { some: scope } } : {}),
    };

    const [
      classMajorRows,
      majors,
      termRows,
      lecturers,
      sectionRows,
      departments,
    ] = await Promise.all([
      // Cặp (lớp, ngành) thay vì chỉ lớp: web dùng để thu ô Ngành về đúng
      // ngành của lớp đang chọn, cùng một truy vấn nên vẫn nằm trong scope.
      this.prisma.student.groupBy({
        by: ['classCode', 'majorId'],
        where: scope,
        orderBy: { classCode: 'asc' },
      }),
      this.prisma.major.findMany({
        where: majorWhere,
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.classSection.groupBy({
        by: ['term'],
        where: sections,
        orderBy: { term: 'desc' },
      }),
      this.prisma.staff.findMany({
        where: { classSections: { some: sections } },
        // RULE 1: chỉ mã nhân viên và họ tên, tuyệt đối không thêm trường liên hệ.
        select: { id: true, staffCode: true, fullName: true },
        orderBy: { fullName: 'asc' },
      }),
      // Lớp học phần trong tầm nhìn, để lọc thẳng "sinh viên lớp này". Trần
      // SECTION_OPTIONS_LIMIT chặn dropdown phình với vai trò toàn trường —
      // người dùng chọn học kỳ trước rồi mới chọn lớp.
      this.prisma.classSection.findMany({
        where: sections,
        select: {
          id: true,
          code: true,
          term: true,
          subject: { select: { code: true, name: true } },
        },
        orderBy: [{ term: 'desc' }, { code: 'asc' }],
        take: SECTION_OPTIONS_LIMIT,
      }),
      this.prisma.department.findMany({
        where: departmentWhere,
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      terms: termRows.map((row) => row.term),
      classCodes: [...new Set(classMajorRows.map((row) => row.classCode))],
      classMajors: groupMajorsByClass(classMajorRows),
      majors,
      lecturers,
      sections: sectionRows,
      departments,
    };
  }

  async findOne(user: AuthUser, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, ...studentScope(user) },
      include: {
        major: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, code: true, name: true } },
        _count: {
          select: {
            enrollments: true,
            evaluations: true,
            careLogs: true,
            alerts: true,
          },
        },
      },
    });
    if (!student) {
      // Không phân biệt "không tồn tại" và "ngoài phạm vi bộ môn" để tránh dò dữ liệu.
      throw new NotFoundException('Không tìm thấy sinh viên.');
    }
    return student;
  }

  async create(user: AuthUser, dto: CreateStudentDto) {
    const major = await this.prisma.major.findUnique({
      where: { id: dto.majorId },
    });
    if (!major) {
      throw new NotFoundException('Ngành học không tồn tại.');
    }
    this.assertDeptAllowed(user, major.departmentId);

    try {
      return await this.prisma.student.create({
        data: {
          studentCode: dto.studentCode,
          fullName: dto.fullName,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
          majorId: dto.majorId,
          departmentId: major.departmentId,
          cohort: dto.cohort,
          classCode: dto.classCode,
          status: dto.status,
        },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`MSSV "${dto.studentCode}" đã tồn tại.`);
      }
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateStudentDto) {
    await this.findOne(user, id); // kiểm tra tồn tại + phạm vi bộ môn

    let departmentId: string | undefined;
    if (dto.majorId) {
      const major = await this.prisma.major.findUnique({
        where: { id: dto.majorId },
      });
      if (!major) {
        throw new NotFoundException('Ngành học không tồn tại.');
      }
      this.assertDeptAllowed(user, major.departmentId);
      departmentId = major.departmentId;
    }

    return this.prisma.student.update({
      where: { id },
      data: {
        studentCode: dto.studentCode,
        fullName: dto.fullName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        majorId: dto.majorId,
        departmentId,
        cohort: dto.cohort,
        classCode: dto.classCode,
        status: dto.status,
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    const analysisCount = await this.prisma.studentTermAnalysis.count({
      where: { studentId: id },
    });
    if (analysisCount > 0) {
      throw new ConflictException(
        'Không thể xóa sinh viên đã có lịch sử phân tích AI. Hãy chuyển trạng thái sinh viên thay vì xóa.',
      );
    }
    await this.prisma.student.delete({ where: { id } });
    return { deleted: true };
  }

  /** Người dùng bị scope chỉ được thao tác trong bộ môn của mình. */
  private assertDeptAllowed(user: AuthUser, departmentId: string): void {
    if (isDeptScoped(user) && user.departmentId !== departmentId) {
      throw new ForbiddenException(
        'Bạn chỉ được thao tác trên sinh viên thuộc bộ môn của mình.',
      );
    }
  }

  async bulkAssignMajor(
    user: AuthUser,
    dto: BulkAssignMajorDto,
  ): Promise<{ updated: number }> {
    // Nạp Major TRƯỚC khi update — cùng cơ chế với create()/update() — để
    // biết ngành thuộc bộ môn nào và chặn người dùng bị scope gán ngành của
    // bộ môn khác (fix vòng 1, mục 1).
    const major = await this.prisma.major.findUnique({
      where: { id: dto.majorId },
    });
    if (!major) {
      throw new NotFoundException('Ngành học không tồn tại.');
    }
    this.assertDeptAllowed(user, major.departmentId);

    let result: { count: number };
    try {
      result = await this.prisma.student.updateMany({
        // deptFilter nằm trong where: sinh viên ngoài bộ môn không bị đụng tới,
        // và người gọi cũng không biết được id đó có tồn tại hay không (RULE 2).
        where: { id: { in: dto.studentIds }, ...deptFilter(user) },
        // departmentId phải đồng bộ theo major — RULE 2 (deptFilter) chỉ soi
        // departmentId, ghi lệch sẽ làm sinh viên rơi ra ngoài phạm vi bộ môn
        // thực tế của ngành mới (fix vòng 1, mục 2).
        data: { majorId: dto.majorId, departmentId: major.departmentId },
      });
    } catch (error) {
      // Nhánh phòng thủ: chỉ còn xảy ra khi major bị xóa xen giữa lần
      // findUnique ở trên và updateMany này.
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Ngành học không tồn tại.');
      }
      throw error;
    }

    if (result.count === 0) {
      throw new NotFoundException(
        'Không có sinh viên nào trong phạm vi truy cập của bạn khớp danh sách đã chọn.',
      );
    }

    await this.audit.log({
      staffId: user.id,
      action: 'STUDENT_BULK_ASSIGN_MAJOR',
      entity: 'Student',
      metadata: {
        majorId: dto.majorId,
        studentIds: dto.studentIds,
        updated: result.count,
      },
    });

    return { updated: result.count };
  }
}
