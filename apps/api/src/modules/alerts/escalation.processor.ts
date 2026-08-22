import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  ALERT_ESCALATION_QUEUE,
  NotificationDispatchService,
  type EscalationJobData,
} from './notification-dispatch.service';

/** Worker BullMQ: gửi thông báo cảnh báo bất đồng bộ, retry 3 lần (exponential backoff). */
@Processor(ALERT_ESCALATION_QUEUE)
export class EscalationProcessor extends WorkerHost {
  private readonly logger = new Logger(EscalationProcessor.name);

  constructor(private readonly dispatch: NotificationDispatchService) {
    super();
  }

  async process(job: Job<EscalationJobData>): Promise<{ delivered: number }> {
    this.logger.debug(
      `Xử lý job ${job.id} — cảnh báo ${job.data.alertId} (lần thử ${job.attemptsMade + 1})`,
    );
    const delivered = await this.dispatch.deliver(job.data);
    return { delivered };
  }

  /** Redis rớt/đóng kết nối chỉ log cảnh báo — không được crash tiến trình API. */
  @OnWorkerEvent('error')
  onWorkerError(error: Error): void {
    this.logger.warn(`Worker escalation gặp lỗi Redis/queue: ${error.message}`);
  }
}
