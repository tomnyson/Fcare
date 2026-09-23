import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

export const WATCHED_QUEUES = Symbol('WATCHED_QUEUES');
export const QUEUE_EVENTS_FACTORY = Symbol('QUEUE_EVENTS_FACTORY');

/** Phần tối thiểu của `bullmq.QueueEvents` mà monitor dùng — dễ giả lập khi test. */
export interface QueueEventsLike {
  on(
    event: 'failed',
    listener: (payload: { jobId: string; failedReason: string }) => void,
  ): unknown;
  close(): Promise<void>;
}

export type QueueEventsFactory = (queueName: string) => QueueEventsLike;

/**
 * Theo dõi job BullMQ thất bại HẲN (hết lượt thử lại) trên mọi hàng đợi và ghi
 * `logger.error` với context `Queue:<tên>` — hook pino sẽ gom vào giám sát lỗi.
 * `QueueEvents` đọc stream sự kiện của Redis nên bắt được cả job chạy ở
 * worker khác, không cần sửa từng processor.
 */
@Injectable()
export class QueueFailureMonitor implements OnModuleInit, OnModuleDestroy {
  private events: QueueEventsLike[] = [];

  constructor(
    @Inject(WATCHED_QUEUES) private readonly queueNames: readonly string[],
    @Inject(QUEUE_EVENTS_FACTORY) private readonly factory: QueueEventsFactory,
  ) {}

  onModuleInit(): void {
    this.events = this.queueNames.map((name) => {
      const logger = new Logger(`Queue:${name}`);
      const events = this.factory(name);
      events.on('failed', ({ jobId, failedReason }) => {
        logger.error(
          `Job ${jobId} thất bại sau khi hết lượt thử: ${failedReason}`,
        );
      });
      return events;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(this.events.map((events) => events.close()));
    this.events = [];
  }
}
