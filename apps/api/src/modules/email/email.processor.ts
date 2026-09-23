import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EmailService } from './email.service';

export const EMAIL_NOTIFICATION_QUEUE = 'email-notifications';

type EmailJobData =
  | { type: 'alert'; alertId: string; recipientIds: string[] }
  | { type: 'care_log'; careLogId: string; authorStaffId: string }
  | { type: 'discussion'; discussionMessageId: string; recipientIds: string[] };

@Processor(EMAIL_NOTIFICATION_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<{ sent: boolean }> {
    this.logger.debug(
      `Xử lý email job ${job.id} (loại ${job.data.type}, lần thử ${job.attemptsMade + 1})`,
    );
    let sent = false;

    switch (job.data.type) {
      case 'alert':
        sent = await this.emailService.sendAlertEmail(
          job.data.alertId,
          job.data.recipientIds,
        );
        break;
      case 'care_log':
        sent = await this.emailService.sendCareLogEmail(
          job.data.careLogId,
          job.data.authorStaffId,
        );
        break;
      case 'discussion':
        sent = await this.emailService.sendDiscussionEmail(
          job.data.discussionMessageId,
          job.data.recipientIds,
        );
        break;
    }

    return { sent };
  }

  @OnWorkerEvent('error')
  onWorkerError(error: Error): void {
    this.logger.warn(`Worker email gặp lỗi Redis/queue: ${error.message}`);
  }
}
