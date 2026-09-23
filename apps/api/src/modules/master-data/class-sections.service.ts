import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertStatus, EnrollmentResult, StudentStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { sectionScope, studentScope } from '../../common/utils/dept-scope';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateClassSectionDto,
  ListClassSectionsQuery,
  UpdateClassSectionDto,
} from './dto/class-section.dto';
import { UpdateSectionGradesDto } from './dto/section-grades.dto';
import { AddStudentItemDto } from './dto/add-students-to-section.dto';
import { UpdateSectionStudentDto } from './dto/update-section-student.dto';
import { parseStudentsExcelBuffer } from './section-students-excel';

@Injectable()
export class ClassSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    userOrQuery?: AuthUser | ListClassSectionsQuery,
    maybeQuery?: ListClassSectionsQuery,
  ) {
    const user =
      userOrQuery && 'roles' in userOrQuery ? userOrQuery : undefined;
    const query =
      (user ? maybeQuery : (userOrQuery as ListClassSectionsQuery)) ?? {};

    const scope = user ? sectionScope(user) : {};

    const where = user
      ? {
          AND: [
            scope,
            {
              ...(query.term ? { term: query.term } : {}),
              ...(query.unassigned
                ? { lecturerId: null }
                : query.lecturerId
                  ? { lecturerId: query.lecturerId }
                  : {}),
            },
          ],
        }
      : {
          ...(query.term ? { term: query.term } : {}),
          ...(query.unassigned
            ? { lecturerId: null }
            : query.lecturerId
              ? { lecturerId: query.lecturerId }
              : {}),
        };

    const sections = await this.prisma.classSection.findMany({
      where,
      orderBy: [{ term: 'desc' }, { code: 'asc' }],
      include: {
        subject: true,
        lecturer: { select: { id: true, staffCode: true, fullName: true } },
        _count: { select: { enrollments: true } },
      },
    });

    if (sections.length === 0) {
      return [];
    }

    const sectionIds = sections.map((s) => s.id);
    const enrollmentsWithAlerts = await this.prisma.enrollment.findMany({
      where: {
        classSectionId: { in: sectionIds },
        student: {
          alerts: {
            some: {
              status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
            },
          },
        },
      },
      select: { classSectionId: true },
    });

    const alertCountBySectionId = new Map<string, number>();
    for (const e of enrollmentsWithAlerts) {
      alertCountBySectionId.set(
        e.classSectionId,
        (alertCountBySectionId.get(e.classSectionId) ?? 0) + 1,
      );
    }

    return sections.map((section) => ({
      ...section,
      openAlertCount: alertCountBySectionId.get(section.id) ?? 0,
    }));
  }

  async create(dto: CreateClassSectionDto) {
    try {
      return await this.prisma.classSection.create({ data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          `Mã lớp học phần "${dto.code}" đã tồn tại.`,
        );
      }
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Môn học hoặc giảng viên không tồn tại.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateClassSectionDto) {
    try {
      return await this.prisma.classSection.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy lớp học phần.');
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.classSection.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy lớp học phần.');
      }
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException(
          'Không thể xóa: lớp học phần đang có sinh viên đăng ký.',
        );
      }
      throw error;
    }
  }

  async findGrades(user: AuthUser, id: string) {
    const section = await this.prisma.classSection.findUnique({
      where: { id },
      // select tường minh đúng 4 trường theo hợp đồng — không lộ các trường
      // scalar khác (room, capacity, startDate...) ra ngoài (fix vòng 1, mục 5).
      select: {
        id: true,
        code: true,
        term: true,
        subject: { select: { code: true, name: true } },
        enrollments: {
          // RULE 2: lưới điểm chạm sinh viên nên PHẢI đi qua scope —
          // sinh viên bộ môn mình HOẶC sinh viên lớp mình đang dạy.
          where: { student: studentScope(user) },
          orderBy: { student: { studentCode: 'asc' } },
          select: {
            id: true,
            totalScore: true,
            result: true,
            student: {
              select: { id: true, studentCode: true, fullName: true },
            },
          },
        },
      },
    });
    if (!section) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }

    const { enrollments, ...rest } = section;

    // Tài liệu II.1 (sơ đồ): "ghi cấp độ vào danh sách lớp học để giảng viên
    // theo dõi tại lớp" — gắn độ khẩn CAO NHẤT trong các cảnh báo CHƯA xử lý
    // của sinh viên. Gom bằng một truy vấn groupBy, không lặp N+1 theo dòng.
    const alertLevelByStudentId = await this.findOpenAlertLevels(
      enrollments.map((e) => e.student.id),
    );

    return {
      section: rest,
      rows: enrollments.map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentId: enrollment.student.id,
        studentCode: enrollment.student.studentCode,
        fullName: enrollment.student.fullName,
        totalScore: enrollment.totalScore,
        result: enrollment.result,
        alertLevel: alertLevelByStudentId.get(enrollment.student.id) ?? null,
      })),
    };
  }

  /**
   * Độ khẩn cao nhất trong các cảnh báo chưa xử lý (OPEN/ACKNOWLEDGED) của từng
   * sinh viên. Chỉ trả về số mức — RULE 1: không kèm bất kỳ thông tin cá nhân
   * nào. Danh sách sinh viên đầu vào đã qua `studentScope` ở nơi gọi (RULE 2).
   */
  private async findOpenAlertLevels(
    studentIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (studentIds.length === 0) {
      return new Map();
    }

    const grouped = await this.prisma.alert.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: [...studentIds] },
        status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
      },
      _max: { level: true },
    });

    return new Map(
      grouped.flatMap((row) =>
        row._max.level === null
          ? []
          : [[row.studentId, row._max.level] as const],
      ),
    );
  }

  async updateGrades(
    user: AuthUser,
    id: string,
    dto: UpdateSectionGradesDto,
  ): Promise<{ updated: number }> {
    // Trùng enrollmentId trong cùng payload → dòng sau âm thầm ghi đè dòng
    // trước trong transaction, "updated" đếm sai số bản ghi thực đổi
    // (fix vòng 1, mục 7). Kiểm TRƯỚC khi chạm DB.
    const seen = new Set<string>();
    const duplicated = new Set<string>();
    for (const row of dto.rows) {
      if (seen.has(row.enrollmentId)) {
        duplicated.add(row.enrollmentId);
      }
      seen.add(row.enrollmentId);
    }
    if (duplicated.size > 0) {
      throw new BadRequestException(
        `Có enrollmentId bị lặp trong payload: ${[...duplicated].join(', ')}.`,
      );
    }

    const section = await this.prisma.classSection.findUnique({
      where: { id },
      select: {
        id: true,
        // Cùng scope với findGrades: enrollment ngoài bộ môn không lọt vào tập
        // "owned", nên vòng kiểm tra bên dưới chặn luôn (RULE 2).
        enrollments: {
          where: { student: studentScope(user) },
          select: { id: true, totalScore: true, result: true },
        },
      },
    });
    if (!section) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }

    // Chặn sửa điểm lớp khác bằng cách nhét enrollmentId lạ vào payload.
    const owned = new Map(section.enrollments.map((item) => [item.id, item]));
    const foreign = dto.rows.find((row) => !owned.has(row.enrollmentId));
    if (foreign) {
      throw new NotFoundException(
        'Có bản ghi ghi danh không thuộc lớp học phần này.',
      );
    }

    // Thiếu key totalScore trong payload nghĩa xác định là "xóa điểm"
    // (fix vòng 1, mục 6) — khớp kiểu number | null đã khai trong DTO.
    const normalizedRows = dto.rows.map((row) => ({
      ...row,
      totalScore: row.totalScore ?? null,
    }));

    await this.prisma.$transaction(
      normalizedRows.map((row) =>
        this.prisma.enrollment.update({
          where: { id: row.enrollmentId },
          data: { totalScore: row.totalScore, result: row.result },
        }),
      ),
    );

    // Chỉ ghi vào audit các dòng THỰC SỰ đổi giá trị — đủ để tra "ai sửa từ
    // bao nhiêu sang bao nhiêu" mà không phình log với dòng gửi lại y nguyên
    // (fix vòng 1, mục 4). UUID/mã lớp/điểm số không phải PII theo RULE 1 —
    // TUYỆT ĐỐI không ghi họ tên sinh viên vào đây.
    const changes = normalizedRows.flatMap((row) => {
      const before = owned.get(row.enrollmentId);
      if (
        before &&
        before.totalScore === row.totalScore &&
        before.result === row.result
      ) {
        return [];
      }
      return [
        {
          enrollmentId: row.enrollmentId,
          from: {
            totalScore: before?.totalScore ?? null,
            result: before?.result ?? null,
          },
          to: { totalScore: row.totalScore, result: row.result },
        },
      ];
    });

    await this.audit.log({
      staffId: user.id,
      action: 'SECTION_GRADES_UPDATE',
      entity: 'ClassSection',
      entityId: id,
      metadata: { rowCount: dto.rows.length, changes },
    });

    return { updated: dto.rows.length };
  }

  async addStudentsToSection(
    user: AuthUser,
    sectionId: string,
    rawStudents: AddStudentItemDto[],
  ) {
    if (!rawStudents || rawStudents.length === 0) {
      throw new BadRequestException('Danh sách sinh viên không được rỗng.');
    }

    const section = await this.prisma.classSection.findUnique({
      where: { id: sectionId },
      include: {
        subject: { select: { id: true, departmentId: true, code: true } },
      },
    });

    if (!section) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }

    // Chuẩn hóa và lọc trùng trong payload
    const normalizedMap = new Map<string, string>();
    for (const item of rawStudents) {
      const code = item.studentCode?.trim().toUpperCase();
      const name = item.fullName?.trim();
      if (code && name && !normalizedMap.has(code)) {
        normalizedMap.set(code, name);
      }
    }

    const studentCodes = Array.from(normalizedMap.keys());
    if (studentCodes.length === 0) {
      throw new BadRequestException(
        'Không tìm thấy sinh viên hợp lệ trong danh sách.',
      );
    }

    // Xác định bộ môn mặc định và mã lớp hành chính mặc định
    let defaultDepartmentId = section.subject?.departmentId;
    if (!defaultDepartmentId) {
      const firstDept = await this.prisma.department.findFirst({
        select: { id: true },
      });
      defaultDepartmentId = firstDept?.id ?? '';
    }

    const defaultClassCode = section.code.split('-')[0] || 'CHUA_GAN';

    // Thực hiện trong transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Tìm các sinh viên đã có trong hệ thống
      const existingStudents = await tx.student.findMany({
        where: { studentCode: { in: studentCodes } },
        select: { id: true, studentCode: true, fullName: true },
      });

      const studentMap = new Map<
        string,
        { id: string; studentCode: string; fullName: string; isNew: boolean }
      >();
      for (const s of existingStudents) {
        studentMap.set(s.studentCode, {
          id: s.id,
          studentCode: s.studentCode,
          fullName: s.fullName,
          isNew: false,
        });
      }

      // 2. Tạo sinh viên chưa có
      for (const [code, name] of normalizedMap.entries()) {
        if (!studentMap.has(code)) {
          const created = await tx.student.create({
            data: {
              studentCode: code,
              fullName: name,
              departmentId: defaultDepartmentId,
              classCode: defaultClassCode,
              status: StudentStatus.STUDYING,
            },
            select: { id: true, studentCode: true, fullName: true },
          });
          studentMap.set(code, {
            id: created.id,
            studentCode: created.studentCode,
            fullName: created.fullName,
            isNew: true,
          });
        }
      }

      // 3. Kiểm tra các sinh viên đã ghi danh vào lớp học phần này
      const allStudentIds = Array.from(studentMap.values()).map((s) => s.id);
      const enrolledRecords = await tx.enrollment.findMany({
        where: {
          classSectionId: sectionId,
          studentId: { in: allStudentIds },
        },
        select: { studentId: true },
      });

      const enrolledStudentIds = new Set(
        enrolledRecords.map((e) => e.studentId),
      );

      const added: Array<{
        studentCode: string;
        fullName: string;
        isNewStudent: boolean;
      }> = [];
      const existing: Array<{ studentCode: string; fullName: string }> = [];

      // 4. Tạo Enrollment cho sinh viên chưa có trong lớp
      for (const student of studentMap.values()) {
        if (enrolledStudentIds.has(student.id)) {
          existing.push({
            studentCode: student.studentCode,
            fullName: student.fullName,
          });
        } else {
          await tx.enrollment.create({
            data: {
              studentId: student.id,
              classSectionId: sectionId,
              result: EnrollmentResult.IN_PROGRESS,
            },
          });
          added.push({
            studentCode: student.studentCode,
            fullName: student.fullName,
            isNewStudent: student.isNew,
          });
        }
      }

      return {
        sectionId: section.id,
        sectionCode: section.code,
        addedCount: added.length,
        existingCount: existing.length,
        totalSubmitted: studentCodes.length,
        added,
        existing,
      };
    });

    await this.audit.log({
      staffId: user.id,
      action: 'SECTION_STUDENTS_ADD',
      entity: 'ClassSection',
      entityId: sectionId,
      metadata: {
        sectionCode: section.code,
        addedCount: result.addedCount,
        existingCount: result.existingCount,
        addedStudentCodes: result.added.map((s) => s.studentCode),
      },
    });

    return result;
  }

  async addStudentsFromExcel(
    user: AuthUser,
    sectionId: string,
    buffer: Buffer,
  ) {
    const students = await parseStudentsExcelBuffer(buffer);
    return this.addStudentsToSection(user, sectionId, students);
  }

  async removeStudentFromSection(
    user: AuthUser,
    sectionId: string,
    enrollmentId: string,
  ) {
    const section = await this.prisma.classSection.findUnique({
      where: { id: sectionId },
      select: { id: true, code: true },
    });
    if (!section) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, classSectionId: sectionId },
      include: {
        student: { select: { id: true, studentCode: true, fullName: true } },
      },
    });

    if (!enrollment) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong lớp học phần này.',
      );
    }

    await this.prisma.enrollment.delete({
      where: { id: enrollmentId },
    });

    await this.audit.log({
      staffId: user.id,
      action: 'SECTION_STUDENT_REMOVE',
      entity: 'ClassSection',
      entityId: sectionId,
      metadata: {
        enrollmentId,
        studentId: enrollment.student.id,
        studentCode: enrollment.student.studentCode,
        fullName: enrollment.student.fullName,
        sectionCode: section.code,
      },
    });

    return {
      success: true,
      removed: true,
      studentCode: enrollment.student.studentCode,
      fullName: enrollment.student.fullName,
    };
  }

  async updateStudentInSection(
    user: AuthUser,
    sectionId: string,
    enrollmentId: string,
    dto: UpdateSectionStudentDto,
  ) {
    const section = await this.prisma.classSection.findUnique({
      where: { id: sectionId },
      select: { id: true, code: true },
    });
    if (!section) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, classSectionId: sectionId },
      include: {
        student: { select: { id: true, studentCode: true, fullName: true } },
      },
    });

    if (!enrollment) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong lớp học phần này.',
      );
    }

    let updatedFullName = enrollment.student.fullName;
    if (
      dto.fullName &&
      dto.fullName.trim() &&
      dto.fullName.trim() !== enrollment.student.fullName
    ) {
      updatedFullName = dto.fullName.trim();
      await this.prisma.student.update({
        where: { id: enrollment.student.id },
        data: { fullName: updatedFullName },
      });
    }

    const enrollmentData: {
      totalScore?: number | null;
      result?: EnrollmentResult;
    } = {};
    if (dto.totalScore !== undefined) {
      enrollmentData.totalScore = dto.totalScore;
    }
    if (dto.result !== undefined) {
      enrollmentData.result = dto.result;
    }

    if (Object.keys(enrollmentData).length > 0) {
      await this.prisma.enrollment.update({
        where: { id: enrollmentId },
        data: enrollmentData,
      });
    }

    await this.audit.log({
      staffId: user.id,
      action: 'SECTION_STUDENT_UPDATE',
      entity: 'ClassSection',
      entityId: sectionId,
      metadata: {
        enrollmentId,
        studentId: enrollment.student.id,
        studentCode: enrollment.student.studentCode,
        changes: dto,
      },
    });

    return {
      success: true,
      updated: true,
      studentCode: enrollment.student.studentCode,
      fullName: updatedFullName,
    };
  }
}
