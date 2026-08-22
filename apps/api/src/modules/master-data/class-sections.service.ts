import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { deptFilter } from '../../common/utils/dept-scope';
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
      include: {
        subject: { select: { code: true, name: true } },
        enrollments: {
          // RULE 2: lưới điểm chạm sinh viên nên PHẢI đi qua deptFilter —
          // giảng viên/TBM chỉ thấy sinh viên bộ môn mình.
          where: { student: deptFilter(user) },
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
    return {
      section: rest,
      rows: enrollments.map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentId: enrollment.student.id,
        studentCode: enrollment.student.studentCode,
        fullName: enrollment.student.fullName,
        totalScore: enrollment.totalScore,
        result: enrollment.result,
      })),
    };
  }

  async updateGrades(
    user: AuthUser,
    id: string,
    dto: UpdateSectionGradesDto,
  ): Promise<{ updated: number }> {
    const section = await this.prisma.classSection.findUnique({
      where: { id },
      select: {
        id: true,
        // Cùng scope với findGrades: enrollment ngoài bộ môn không lọt vào tập
        // "owned", nên vòng kiểm tra bên dưới chặn luôn (RULE 2).
        enrollments: {
          where: { student: deptFilter(user) },
          select: { id: true },
        },
      },
    });
    if (!section) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }

    // Chặn sửa điểm lớp khác bằng cách nhét enrollmentId lạ vào payload.
    const owned = new Set(section.enrollments.map((item) => item.id));
    const foreign = dto.rows.find((row) => !owned.has(row.enrollmentId));
    if (foreign) {
      throw new NotFoundException(
        'Có bản ghi ghi danh không thuộc lớp học phần này.',
      );
    }

    await this.prisma.$transaction(
      dto.rows.map((row) =>
        this.prisma.enrollment.update({
          where: { id: row.enrollmentId },
          data: { totalScore: row.totalScore, result: row.result },
        }),
      ),
    );

    await this.audit.log({
      staffId: user.id,
      action: 'SECTION_GRADES_UPDATE',
      entity: 'ClassSection',
      entityId: id,
      metadata: { rowCount: dto.rows.length },
    });

    return { updated: dto.rows.length };
  }
}
