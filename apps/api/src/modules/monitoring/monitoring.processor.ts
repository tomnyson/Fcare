import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MonitoringReportService } from './monitoring-report.service';
import { MonitoringSettingsService } from './monitoring-settings.service';
import {
  MONITORING_QUEUE,
  PURGE_ERRORS_JOB,
  WEEKLY_REPORT_JOB,
} from './monitoring.queue';

/** AuditLog giữ 7 ngày — không cần cấu hình riêng. */
const AUDIT_RETENTION_DAYS = 7;

@Processor(MONITORING_QUEUE)
export class MonitoringProcessor extends WorkerHost {
  private readonly logger = new Logger(MonitoringProcessor.name);

  constructor(
    private readonly report: MonitoringReportService,
    private readonly settings: MonitoringSettingsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === WEEKLY_REPORT_JOB) {
      const result = await this.report.sendWeeklyReport({
        trigger: 'SCHEDULED',
      });
      this.logger.log(
        result.sent
          ? `Đã gửi báo cáo lỗi tuần ${result.weekStart}`
          : `Bỏ qua báo cáo lỗi tuần: ${result.reason}`,
      );
      return;
    }
    if (job.name === PURGE_ERRORS_JOB) {
      const { retentionDays } = await this.settings.getEffectiveConfig();
      const deleted = await this.report.purgeExpired(retentionDays);
      if (deleted > 0) {
        this.logger.log(`Đã dọn ${deleted} nhóm lỗi quá ${retentionDays} ngày`);
      }
      const auditDeleted =
        await this.report.purgeExpiredAuditLogs(AUDIT_RETENTION_DAYS);
      if (auditDeleted > 0) {
        this.logger.log(
          `Đã dọn ${auditDeleted} audit log quá ${AUDIT_RETENTION_DAYS} ngày`,
        );
      }
    }
  }
}
