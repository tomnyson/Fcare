import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../../common/types/auth-user';
import { isStudentInScope, sectionScope } from '../../common/utils/dept-scope';
import { detectPii } from '../../common/utils/pii-text';
import { PrismaService } from '../../prisma/prisma.service';
import type { EvaluationNoteDraftDto } from './dto/evaluation-note-draft.dto';
import {
  buildNoteDraftPrompt,
  NOTE_DRAFT_COOLDOWN_MS,
  NOTE_DRAFT_MAX_LENGTH,
  NoteDraftCooldown,
} from './evaluation-note-draft';
import { EvaluationNoteDrafter } from './evaluation-note-drafter';

export interface EvaluationNoteDraftResult {
  note: string;
  /** Web khoá nút "Tạo lại" đúng khoảng này. */
  cooldownSeconds: number;
}

/** Cùng cách đọc cờ AI_ANALYSIS_ENABLED với StudentAnalysesService. */
function isEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

@Injectable()
export class EvaluationNoteDraftService {
  private readonly cooldown = new NoteDraftCooldown();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly drafter: EvaluationNoteDrafter,
  ) {}

  async draft(
    user: AuthUser,
    studentId: string,
    dto: EvaluationNoteDraftDto,
  ): Promise<EvaluationNoteDraftResult> {
    if (!isEnabled(this.config.get<string>('AI_ANALYSIS_ENABLED', 'false'))) {
      throw new NotFoundException({
        message: 'Tính năng AI hiện chưa được bật.',
        code: 'AI_ANALYSIS_DISABLED',
      });
    }
    if (!(await isStudentInScope(this.prisma, user, studentId))) {
      throw new NotFoundException('Không tìm thấy sinh viên.');
    }
    const sectionCount = await this.prisma.classSection.count({
      where: {
        id: dto.classSectionId,
        ...sectionScope(user),
        enrollments: { some: { studentId } },
      },
    });
    if (sectionCount === 0) {
      throw new ForbiddenException(
        'Bạn chỉ nhờ AI viết nhận xét cho sinh viên thuộc lớp học phần của mình.',
      );
    }

    // Ghi mốc TRƯỚC khi gọi AI: bấm dồn trong lúc AI đang chạy cũng bị chặn.
    const waitSeconds = this.cooldown.take(user.id);
    if (waitSeconds > 0) {
      throw new HttpException(
        {
          message: `Vui lòng đợi ${waitSeconds} giây trước khi tạo lại nhận xét.`,
          code: 'AI_NOTE_COOLDOWN',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const text = (await this.drafter.draft(buildNoteDraftPrompt(dto)))
      .slice(0, NOTE_DRAFT_MAX_LENGTH)
      .trim();
    if (!text) {
      throw new ServiceUnavailableException({
        message: 'AI chưa trả được nhận xét. Vui lòng thử lại sau.',
        code: 'AI_NOTE_EMPTY',
      });
    }
    if (detectPii(text)) {
      throw new BadRequestException({
        message:
          'Nhận xét AI chứa thông tin cá nhân nên đã bị chặn. Vui lòng tạo lại hoặc tự viết.',
        code: 'AI_NOTE_PII',
      });
    }
    return { note: text, cooldownSeconds: NOTE_DRAFT_COOLDOWN_MS / 1000 };
  }
}
