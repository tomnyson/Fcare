import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { studentScope } from '../../common/utils/dept-scope';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateClassSectionDto,
  ListClassSectionsQuery,
  UpdateClassSectionDto,
} from './dto/class-section.dto';
import { UpdateSectionGradesDto } from './dto/section-grades.dto';

@Injectable()
export class ClassSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(query: ListClassSectionsQuery) {
    return this.prisma.classSection.findMany({
      where: {
        term: query.term,
        // unassigned thắng lecturerId: hai bộ lọc loại trừ nhau về nghĩa.
        lecturerId: query.unassigned ? null : query.lecturerId,
      },
      orderBy: [{ term: 'desc' }, { code: 'asc' }],
      include: {
        subject: true,
        lecturer: { select: { id: true, staffCode: true, fullName: true } },
        _count: { select: { enrollments: true } },
      },
    });
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
}
