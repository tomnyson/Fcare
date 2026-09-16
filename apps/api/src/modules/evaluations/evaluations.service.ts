import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import {
  isStudentInScope,
  sectionScope,
  studentScope,
} from '../../common/utils/dept-scope';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentAnalysesService } from '../student-analyses/student-analyses.service';
import {
  CreateEvaluationDto,
  ListEvaluationsQuery,
  UpdateEvaluationDto,
} from './dto/evaluation.dto';

@Injectable()
export class EvaluationsService {
  private readonly logger = new Logger(EvaluationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyses: StudentAnalysesService,
  ) {}

  list(user: AuthUser, query: ListEvaluationsQuery) {
    return this.prisma.evaluation.findMany({
      where: {
        studentId: query.studentId,
        term: query.term,
        ...(query.classSectionId
          ? { classSectionId: query.classSectionId }
          : {}),
        student: studentScope(user),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        criteria: { select: { criterion: true } },
        classSection: {
          select: {
            id: true,
            code: true,
            term: true,
            subject: { select: { code: true, name: true } },
          },
        },
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
      where: { id: dto.studentId, ...studentScope(user) },
    });
    if (!student) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong phạm vi quản lý của bạn.',
      );
    }

    // Giảng viên chỉ nhận xét được lớp học phần mình đứng lớp.
    const section = await this.prisma.classSection.findFirst({
      where: { id: dto.classSectionId, ...sectionScope(user) },
      select: { id: true, term: true },
    });
    if (!section) {
      throw new NotFoundException(
        'Không tìm thấy lớp học phần trong phạm vi giảng dạy của bạn.',
      );
    }
    if (section.term !== dto.term) {
      throw new BadRequestException(
        'Học kỳ không khớp với học kỳ của lớp học phần.',
      );
    }

    const created = await this.createRow(user.id, dto);
    await this.autoAnalyze(user, created);
    return created;
  }

  /**
   * Mỗi giảng viên chỉ có một nhận xét cho một sinh viên ở một lớp học phần
   * (@@unique). Trùng thì báo rõ để người dùng đi sửa bản cũ, đừng trả lỗi 500.
   */
  private async createRow(lecturerId: string, dto: CreateEvaluationDto) {
    const { criteria, ...rest } = dto;
    try {
      return await this.prisma.evaluation.create({
        data: {
          ...rest,
          lecturerId,
          criteria: {
            create: (criteria ?? []).map((criterion) => ({ criterion })),
          },
        },
        include: {
          criteria: { select: { criterion: true } },
          lecturer: { select: { id: true, staffCode: true, fullName: true } },
        },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException({
          message:
            'Bạn đã nhận xét sinh viên này ở lớp học phần đã chọn. Hãy chọn lại lớp đó để sửa bản nhận xét cũ.',
          code: 'EVALUATION_ALREADY_EXISTS',
        });
      }
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateEvaluationDto) {
    const evaluation = await this.requireInScope(user, id);
    if (evaluation.lecturerId !== user.id && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Chỉ người tạo đánh giá hoặc admin được chỉnh sửa.',
      );
    }
    // Danh sách tiêu chí được ghi đè trọn gói: gửi lên gì thì còn đúng cái đó.
    const { criteria, ...rest } = dto;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (criteria) {
        await tx.evaluationCriterionMark.deleteMany({
          where: { evaluationId: id },
        });
      }
      return tx.evaluation.update({
        where: { id },
        data: {
          ...rest,
          ...(criteria
            ? {
                criteria: {
                  create: criteria.map((criterion) => ({ criterion })),
                },
              }
            : {}),
        },
        include: { criteria: { select: { criterion: true } } },
      });
    });
    await this.autoAnalyze(user, updated);
    return updated;
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

  /**
   * Nhận xét lưu xong là hệ thống tự chạy phân tích AI, sinh xong thì hỏi lại
   * giảng viên có gửi cảnh báo hay không (không tự gửi). Lỗi phân tích không
   * được làm hỏng lượt nhận xét đã ghi.
   */
  private async autoAnalyze(
    user: AuthUser,
    evaluation: {
      id: string;
      studentId: string;
      term: string;
      updatedAt: Date;
    },
  ) {
    try {
      await this.analyses.requestAutoAnalysis({
        user,
        studentId: evaluation.studentId,
        term: evaluation.term,
        evaluationId: evaluation.id,
        revision: evaluation.updatedAt,
      });
    } catch (error) {
      this.logger.warn(
        `Không chạy được phân tích tự động cho nhận xét ${evaluation.id}: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
    }
  }

  private async requireInScope(user: AuthUser, id: string) {
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id },
      include: { student: true },
    });
    if (!evaluation) {
      throw new NotFoundException('Không tìm thấy đánh giá.');
    }
    if (!(await isStudentInScope(this.prisma, user, evaluation.studentId))) {
      throw new NotFoundException('Không tìm thấy đánh giá.');
    }
    return evaluation;
  }
}
