import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import {
  ListErrorGroupsQuery,
  SendReportDto,
  TestWebhookDto,
  UpdateMonitoringSettingsDto,
} from './dto/monitoring.dto';
import { MonitoringReportService } from './monitoring-report.service';
import { MonitoringSettingsService } from './monitoring-settings.service';

const WEBHOOK_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

/** Giám sát lỗi hệ thống — chỉ ADMIN (`manage all`). */
@ApiTags('admin')
@Controller('admin/monitoring')
@CheckPolicies((ability: AppAbility) => ability.can('manage', 'Monitoring'))
export class MonitoringController {
  constructor(
    private readonly settings: MonitoringSettingsService,
    private readonly report: MonitoringReportService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.getView();
  }

  @Put('settings')
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMonitoringSettingsDto,
  ) {
    return this.settings.update(user.id, dto);
  }

  @Post('test')
  @HttpCode(200)
  @Throttle(WEBHOOK_THROTTLE)
  async sendTest(@CurrentUser() user: AuthUser, @Body() dto: TestWebhookDto) {
    await this.report.sendTest(user.id, dto.webhookUrl);
    return { sent: true };
  }

  @Post('report')
  @HttpCode(200)
  @Throttle(WEBHOOK_THROTTLE)
  sendReport(@CurrentUser() user: AuthUser, @Body() dto: SendReportDto) {
    return this.report.sendWeeklyReport({
      trigger: 'MANUAL',
      actorId: user.id,
      week: dto.week,
    });
  }

  @Get('errors')
  listErrors(@Query() query: ListErrorGroupsQuery) {
    return this.report.listGroups(query);
  }

  @Get('weeks')
  listWeeks() {
    return this.report.listWeeks();
  }

  @Delete('errors')
  @Throttle(WEBHOOK_THROTTLE)
  purge(@CurrentUser() user: AuthUser) {
    return this.report.purgeNow(user.id);
  }
}
