import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import { deptFilter, isDeptScoped } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateEvaluationDto,
  ListEvaluationsQuery,
  UpdateEvaluationDto,
} from './dto/evaluation.dto';

@Injectable()
export class EvaluationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser, query: ListEvaluationsQuery) {
    return this.prisma.evaluation.findMany({
      where: {
        studentId: query.studentId,
        term: query.term,
        student: deptFilter(user),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        lecturer: { select: { id: true, staffCode: true, fullName: true } },
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

  async create(user: AuthUser, dto: CreateEvaluationDto) {
    // Giảng viên chỉ được đánh giá sinh viên thuộc bộ môn của mình.
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, ...deptFilter(user) },
    });
    if (!student) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong phạm vi quản lý của bạn.',
      );
    }

    return this.prisma.evaluation.create({
      data: { ...dto, lecturerId: user.id },
      include: {
        lecturer: { select: { id: true, staffCode: true, fullName: true } },
      },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateEvaluationDto) {
    const evaluation = await this.requireInScope(user, id);
    if (evaluation.lecturerId !== user.id && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Chỉ người tạo đánh giá hoặc admin được chỉnh sửa.',
      );
    }
    return this.prisma.evaluation.update({ where: { id }, data: dto });
  }

  async remove(user: AuthUser, id: string) {
    const evaluation = await this.requireInScope(user, id);
    if (evaluation.lecturerId !== user.id && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Chỉ người tạo đánh giá hoặc admin được xóa.',
      );
    }
    await this.prisma.evaluation.delete({ where: { id } });
    return { deleted: true };
  }

  private async requireInScope(user: AuthUser, id: string) {
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id },
      include: { student: true },
    });
    if (!evaluation) {
      throw new NotFoundException('Không tìm thấy đánh giá.');
    }
    if (
      isDeptScoped(user) &&
      evaluation.student.departmentId !== user.departmentId
    ) {
      throw new NotFoundException('Không tìm thấy đánh giá.');
    }
    return evaluation;
  }
}
