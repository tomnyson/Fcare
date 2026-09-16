import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { BACKUP_QUEUE, SCHEDULED_BACKUP_JOB } from './backup.queue';
import { BackupService } from './backup.service';
import { BackupScheduleConfig } from './backup.types';

@Injectable()
export class BackupSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BackupSchedulerService.name);

  constructor(
    @InjectQueue(BACKUP_QUEUE) private readonly backupQueue: Queue,
    private readonly backupService: BackupService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const config = this.backupService.getScheduleConfig();
      await this.syncSchedule(config);
    } catch (err) {
      this.logger.error(
        `Không thể đồng bộ lịch sao lưu định kỳ khi khởi động: ${err}`,
      );
    }
  }

  /**
   * Đồng bộ hoá lịch lặp lại của BullMQ với cấu hình hiện tại
   */
  async syncSchedule(config: BackupScheduleConfig): Promise<void> {
    try {
      // 1. Lấy danh sách repeatable jobs hiện tại và xoá job scheduled-backup cũ
      const repeatableJobs = await this.backupQueue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.name === SCHEDULED_BACKUP_JOB) {
          await this.backupQueue.removeRepeatableByKey(job.key);
          this.logger.log(
            `Đã xoá lịch sao lưu cũ: ${job.pattern || job.every}`,
          );
        }
      }

      // 2. Nếu tính năng được bật, đăng ký lịch mới
      if (config.enabled) {
        await this.backupQueue.add(
          SCHEDULED_BACKUP_JOB,
          {},
          {
            repeat: {
              pattern: config.cronExpression,
            },
            jobId: 'fcare-daily-backup',
            removeOnComplete: 10,
            removeOnFail: 20,
          },
        );
        this.logger.log(
          `Đã kích hoạt lịch sao lưu định kỳ: Cron "${config.cronExpression}" (Lưu trữ tối đa ${config.retentionCount} bản)`,
        );
      } else {
        this.logger.log('Lịch sao lưu tự động định kỳ hiện đang TẮT.');
      }
    } catch (err) {
      this.logger.error(`Lỗi khi đồng bộ lịch sao lưu: ${err}`);
      throw err;
    }
  }
}
