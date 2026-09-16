import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BACKUP_QUEUE, SCHEDULED_BACKUP_JOB } from './backup.queue';
import { BackupService } from './backup.service';

@Processor(BACKUP_QUEUE)
export class BackupProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupProcessor.name);

  constructor(private readonly backupService: BackupService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Bắt đầu xử lý BullMQ job: ${job.name} (id: ${job.id})`);

    if (job.name === SCHEDULED_BACKUP_JOB) {
      try {
        const result = await this.backupService.createBackup({
          type: 'SCHEDULED',
          comment: 'Sao lưu định kỳ tự động hệ thống',
        });
        this.logger.log(`Sao lưu định kỳ tự động hoàn tất: ${result.filename}`);

        const config = this.backupService.getScheduleConfig();
        const prunedCount = await this.backupService.pruneOldBackups(
          config.retentionCount,
        );
        if (prunedCount > 0) {
          this.logger.log(`Đã dọn dẹp ${prunedCount} bản sao lưu định kỳ cũ.`);
        }
      } catch (err) {
        this.logger.error(`Lỗi khi thực hiện sao lưu định kỳ: ${err}`);
        throw err;
      }
    }
  }
}
