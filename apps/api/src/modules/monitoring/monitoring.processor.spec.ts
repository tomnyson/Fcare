/* eslint-disable @typescript-eslint/unbound-method */
import type { Job } from 'bullmq';
import type { MonitoringReportService } from './monitoring-report.service';
import type { MonitoringSettingsService } from './monitoring-settings.service';
import { MonitoringProcessor } from './monitoring.processor';
import { PURGE_ERRORS_JOB, WEEKLY_REPORT_JOB } from './monitoring.queue';

function build() {
  const report = {
    sendWeeklyReport: jest.fn().mockResolvedValue({ sent: true }),
    purgeExpired: jest.fn().mockResolvedValue(3),
    purgeExpiredAuditLogs: jest.fn().mockResolvedValue(0),
  } as unknown as MonitoringReportService;
  const settings = {
    getEffectiveConfig: jest.fn().mockResolvedValue({ retentionDays: 45 }),
  } as unknown as MonitoringSettingsService;
  return { report, processor: new MonitoringProcessor(report, settings) };
}

describe('MonitoringProcessor', () => {
  it('job báo cáo tuần → gửi báo cáo lịch tự động', async () => {
    const { report, processor } = build();
    await processor.process({ name: WEEKLY_REPORT_JOB } as Job);
    expect(report.sendWeeklyReport).toHaveBeenCalledWith({
      trigger: 'SCHEDULED',
    });
  });

  it('job dọn → xoá theo số ngày lưu trong cấu hình', async () => {
    const { report, processor } = build();
    await processor.process({ name: PURGE_ERRORS_JOB } as Job);
    expect(report.purgeExpired).toHaveBeenCalledWith(45);
  });
});
