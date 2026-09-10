import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

export type NotificationSource =
  | { kind: 'alert'; alertId: string }
  | {
      kind: 'analysis';
      analysisVersionId: string;
      /** Cảnh báo sinh cùng bản phân tích — thông báo mang cả hai con trỏ. */
      alertId?: string;
      targetUrl: string;
    }
  | {
      kind: 'discussion';
      discussionMessageId: string;
      targetUrl: string;
    };

export interface NotificationDeliveryData {
  recipientIds: string[];
  title: string;
  body: string;
  source: NotificationSource;
}

/**
 * Tạo bản ghi thông báo + phát sự kiện SSE cho người nhận.
 * Idempotent nhờ unique source-key theo người nhận + skipDuplicates —
 * queue retry hoặc chạy trùng với fallback đồng bộ đều không tạo trùng.
 */
@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: NotificationEventsService,
  ) {}

  async deliver(
    data: EscalationJobData | NotificationDeliveryData,
  ): Promise<number> {
    const normalized = this.normalize(data);
    if (normalized.recipientIds.length === 0) {
      return 0;
    }

    const notifications = await this.prisma.notification.createManyAndReturn({
      data: normalized.recipientIds.map((recipientId) =>
        this.buildRow(recipientId, normalized),
      ),
      skipDuplicates: true,
      select: {
        id: true,
        recipientId: true,
        alertId: true,
        analysisVersionId: true,
        discussionMessageId: true,
        targetUrl: true,
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
          alertId: notification.alertId ?? null,
          analysisVersionId: notification.analysisVersionId ?? null,
          discussionMessageId: notification.discussionMessageId ?? null,
          targetUrl: notification.targetUrl ?? null,
          title: notification.title,
          body: notification.body,
          createdAt: notification.createdAt,
        },
      });
    }

    this.logger.log(this.describeDelivery(normalized, notifications.length));
    return notifications.length;
  }

  private normalize(
    data: EscalationJobData | NotificationDeliveryData,
  ): NotificationDeliveryData {
    if ('source' in data) {
      return data;
    }
    return {
      recipientIds: data.recipientIds,
      title: data.title,
      body: data.body,
      source: { kind: 'alert', alertId: data.alertId },
    };
  }

  private buildRow(
    recipientId: string,
    data: NotificationDeliveryData,
  ): Prisma.NotificationCreateManyInput {
    const row: Prisma.NotificationCreateManyInput = {
      recipientId,
      title: data.title,
      body: data.body,
      alertId: null,
    };
    if (data.source.kind === 'alert') {
      row.alertId = data.source.alertId;
      return row;
    }
    if (data.source.kind === 'discussion') {
      row.discussionMessageId = data.source.discussionMessageId;
      row.targetUrl = data.source.targetUrl;
      return row;
    }
    row.analysisVersionId = data.source.analysisVersionId;
    row.alertId = data.source.alertId ?? null;
    row.targetUrl = data.source.targetUrl;
    return row;
  }

  private describeDelivery(
    data: NotificationDeliveryData,
    delivered: number,
  ): string {
    if (data.source.kind === 'alert') {
      return `Đã gửi ${delivered}/${data.recipientIds.length} thông báo cho cảnh báo ${data.source.alertId}`;
    }
    if (data.source.kind === 'discussion') {
      return `Đã gửi ${delivered}/${data.recipientIds.length} thông báo cho tin trao đổi ${data.source.discussionMessageId}`;
    }
    return `Đã gửi ${delivered}/${data.recipientIds.length} thông báo cho bản phân tích ${data.source.analysisVersionId}`;
  }
}
