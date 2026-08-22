import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationEventsService } from './notification-events.service';

export const ALERT_ESCALATION_QUEUE = 'alert-escalation';
export const DELIVER_NOTIFICATIONS_JOB = 'deliver-notifications';

export interface EscalationJobData {
  alertId: string;
  recipientIds: string[];
  title: string;
  body: string;
}

/**
 * Tạo bản ghi thông báo + phát sự kiện SSE cho người nhận.
 * Idempotent nhờ unique (alertId, recipientId) + skipDuplicates —
 * queue retry hoặc chạy trùng với fallback đồng bộ đều không tạo trùng.
 */
@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: NotificationEventsService,
  ) {}

  async deliver(data: EscalationJobData): Promise<number> {
    if (data.recipientIds.length === 0) {
      return 0;
    }

    const { count } = await this.prisma.notification.createMany({
      data: data.recipientIds.map((recipientId) => ({
        recipientId,
        alertId: data.alertId,
        title: data.title,
        body: data.body,
      })),
      skipDuplicates: true,
    });

    const notifications = await this.prisma.notification.findMany({
      where: { alertId: data.alertId, recipientId: { in: data.recipientIds } },
      select: {
        id: true,
        recipientId: true,
        alertId: true,
        title: true,
        body: true,
        createdAt: true,
      },
    });
    for (const notification of notifications) {
      this.events.emit({
        recipientId: notification.recipientId,
        payload: {
          id: notification.id,
          alertId: notification.alertId,
          title: notification.title,
          body: notification.body,
          createdAt: notification.createdAt,
        },
      });
    }

    this.logger.log(
      `Đã gửi ${count}/${data.recipientIds.length} thông báo cho cảnh báo ${data.alertId}`,
    );
    return count;
  }
}
