import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import { deptFilter, isDeptScoped } from '../../common/utils/dept-scope';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateEnrollmentDto,
  ListEnrollmentsQuery,
  UpdateEnrollmentDto,
} from './dto/enrollment.dto';

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser, query: ListEnrollmentsQuery) {
    return this.prisma.enrollment.findMany({
      where: {
        studentId: query.studentId,
        classSectionId: query.classSectionId,
        student: deptFilter(user),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        classSection: {
          include: {
            subject: {
              select: { id: true, code: true, name: true, credits: true },
            },
            lecturer: { select: { id: true, staffCode: true, fullName: true } },
          },
        },
        student: {
          select: {
            id: true,
            studentCode: true,
            fullName: true,
            classCode: true,
          },
        },
      },
    });
  }

  async create(user: AuthUser, dto: CreateEnrollmentDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, ...deptFilter(user) },
    });
    if (!student) {
      throw new NotFoundException('Không tìm thấy sinh viên.');
    }

    try {
      return await this.prisma.enrollment.create({
        data: { studentId: dto.studentId, classSectionId: dto.classSectionId },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException('Sinh viên đã đăng ký lớp học phần này.');
      }
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Lớp học phần không tồn tại.');
      }
      throw error;
    }
  }

  async updateGrades(user: AuthUser, id: string, dto: UpdateEnrollmentDto) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
      include: { classSection: true, student: true },
    });
    if (!enrollment) {
      throw new NotFoundException('Không tìm thấy bản ghi học phần.');
    }
    this.assertCanUpdateGrades(
      user,
      enrollment.classSection.lecturerId,
      enrollment.student.departmentId,
    );

    return this.prisma.enrollment.update({ where: { id }, data: dto });
  }

  async remove(user: AuthUser, id: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
      include: { student: true },
    });
    if (!enrollment) {
      throw new NotFoundException('Không tìm thấy bản ghi học phần.');
    }
    if (
      isDeptScoped(user) &&
      enrollment.student.departmentId !== user.departmentId
    ) {
      throw new ForbiddenException('Sinh viên không thuộc bộ môn của bạn.');
    }
    await this.prisma.enrollment.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Chỉ giảng viên phụ trách lớp học phần, trưởng bộ môn của sinh viên,
   * cán bộ đào tạo hoặc admin được cập nhật điểm.
   */
  private assertCanUpdateGrades(
    user: AuthUser,
    lecturerId: string,
    studentDepartmentId: string,
  ): void {
    if (
      user.roles.includes('ADMIN') ||
      user.roles.includes('TRAINING_OFFICER')
    ) {
      return;
    }
    if (user.id === lecturerId) {
      return;
    }
    if (
      user.roles.includes('HEAD_OF_DEPT') &&
      user.departmentId === studentDepartmentId
    ) {
      return;
    }
    throw new ForbiddenException(
      'Bạn không có quyền cập nhật điểm cho lớp học phần này.',
    );
  }
}
