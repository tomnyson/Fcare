import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { TermsService } from '../master-data/terms.service';
import { AttendanceReviewService } from './attendance-review.service';
import { PendingAttendanceAlertsService } from './pending-attendance-alerts.service';
import {
  PendingAttendanceAlertsQuery,
  ReviewAttendanceDto,
} from './dto/attendance-alerts.dto';

@ApiTags('attendance-alerts')
@Controller('attendance-alerts')
export class AttendanceAlertsController {
  constructor(
    private readonly reviewService: AttendanceReviewService,
    private readonly pendingService: PendingAttendanceAlertsService,
    private readonly termsService: TermsService,
  ) {}

  /** Bước 3 — danh sách cảnh báo điểm danh cần chăm sóc (hiện liên tục ở GV đứng lớp). */
  @Get('pending')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Alert'))
  async pending(
    @CurrentUser() user: AuthUser,
    @Query() query: PendingAttendanceAlertsQuery,
  ) {
    const term = query.term ?? (await this.resolveCurrentTerm());
    return this.pendingService.list(user, term, query.scope ?? 'owned');
  }

  /** Bước 2 — rà soát tay (Đào tạo/ADMIN) khi cần chạy lại ngoài luồng import. */
  @Post('review')
  @CheckPolicies((ability: AppAbility) =>
    ability.can('review', 'AttendanceAlert'),
  )
  async review(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewAttendanceDto,
  ) {
    const term = dto.term ?? (await this.resolveCurrentTerm());
    const result = await this.reviewService.reviewTerm(term, {
      actorId: user.id,
    });
    return { term, ...result };
  }

  private async resolveCurrentTerm(): Promise<string> {
    const current = await this.termsService.getCurrentTerm();
    if (!current) {
      throw new BadRequestException(
        'Chưa cấu hình học kỳ hiện tại — hãy truyền `term` hoặc thiết lập học kỳ trong Dữ liệu chủ.',
      );
    }
    return current.code;
  }
}
