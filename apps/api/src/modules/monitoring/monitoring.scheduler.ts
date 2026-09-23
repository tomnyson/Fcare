import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  MONITORING_QUEUE,
  MONITORING_TIMEZONE,
  PURGE_CRON,
  PURGE_ERRORS_JOB,
  WEEKLY_REPORT_CRON,
  WEEKLY_REPORT_JOB,
} from './monitoring.queue';

const SCHEDULES = [
  {
    name: WEEKLY_REPORT_JOB,
    pattern: WEEKLY_REPORT_CRON,
    jobId: 'fcare-weekly-error-report',
  },
  {
    name: PURGE_ERRORS_JOB,
    pattern: PURGE_CRON,
    jobId: 'fcare-purge-error-groups',
  },
] as const;

/**
 * Đăng ký lịch lặp của BullMQ. Lịch luôn chạy; bật/tắt báo cáo được kiểm tra
 * lúc job chạy (đọc cấu hình DB) để đổi cấu hình không cần đồng bộ lại lịch.
 */
@Injectable()
export class MonitoringScheduler implements OnModuleInit {
  private readonly logger = new Logger(MonitoringScheduler.name);

  constructor(@InjectQueue(MONITORING_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      const names = new Set<string>(SCHEDULES.map((s) => s.name));
      for (const job of await this.queue.getRepeatableJobs()) {
        if (names.has(job.name))
          await this.queue.removeRepeatableByKey(job.key);
      }
      for (const schedule of SCHEDULES) {
        await this.queue.add(
          schedule.name,
          {},
          {
            repeat: { pattern: schedule.pattern, tz: MONITORING_TIMEZONE },
            jobId: schedule.jobId,
            attempts: 3,
            backoff: { type: 'exponential', delay: 60_000 },
            removeOnComplete: 10,
            removeOnFail: 20,
          },
        );
      }
    } catch (error) {
      this.logger.error(
        `Không đăng ký được lịch giám sát lỗi: ${(error as Error).message}`,
      );
    }
  }
}
