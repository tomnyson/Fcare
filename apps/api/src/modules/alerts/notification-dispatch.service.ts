import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationEventsService } from './notification-events.service';
import { EmailService } from '../email/email.service';
import { PushService } from '../push/push.service';

export const ALERT_ESCALATION_QUEUE = 'alert-escalation';
const DELIVER_NOTIFICATIONS_JOB = 'deliver-notifications';

/** Enqueue phải fail nhanh khi Redis không phản hồi để còn fallback đồng bộ. */
const ENQUEUE_TIMEOUT_MS = 1_500;

export interface EscalationJobData {
  alertId: string;
  recipientIds: string[];
  title: string;
  body: string;
  /** Link mở thẳng chỗ cần chăm sóc (cảnh báo điểm danh tự động). */
  targetUrl?: string;
  /** Cảnh báo được nâng mức tại chỗ: báo lại cả người đã nhận trước đó. */
  replay?: boolean;
}

export type NotificationSource =
  | { kind: 'alert'; alertId: string; targetUrl?: string }
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
  /** Chỉ nguồn `alert`: làm mới thông báo cũ của cùng cảnh báo rồi báo lại. */
  replay?: boolean;
}

const DELIVERED_SELECT = {
  id: true,
  recipientId: true,
  alertId: true,
  analysisVersionId: true,
  discussionMessageId: true,
  targetUrl: true,
  title: true,
  body: true,
  createdAt: true,
} as const satisfies Prisma.NotificationSelect;

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
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly pushService?: PushService,
  ) {}

  /**
   * Ưu tiên đưa vào queue BullMQ (retry 3 lần, backoff lũy tiến).
   * Redis lỗi/treo → fallback gửi đồng bộ để cảnh báo không bao giờ mất thông
   * báo; unique (alertId, recipientId) đảm bảo không trùng nếu cả hai đường
   * cùng chạy. Dùng chung cho cảnh báo thủ công lẫn cảnh báo điểm danh tự động.
   */
  async enqueueOrDeliver(
    queue: Queue<EscalationJobData>,
    data: EscalationJobData,
  ): Promise<void> {
    try {
      await Promise.race([
        queue.add(DELIVER_NOTIFICATIONS_JOB, data, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Enqueue quá thời gian chờ Redis.')),
            ENQUEUE_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (error) {
      this.logger.warn(
        `Không enqueue được escalation (${error instanceof Error ? error.message : 'lỗi không xác định'}) — chuyển gửi đồng bộ.`,
      );
      await this.deliver(data);
    }
  }

  async deliver(
    data: EscalationJobData | NotificationDeliveryData,
  ): Promise<number> {
    const normalized = this.normalize(data);
    if (normalized.recipientIds.length === 0) {
      return 0;
    }

    const inserted = await this.prisma.notification.createManyAndReturn({
      data: normalized.recipientIds.map((recipientId) =>
        this.buildRow(recipientId, normalized),
      ),
      skipDuplicates: true,
      select: DELIVERED_SELECT,
    });
    const notifications = [
      ...inserted,
      ...(await this.refreshForReplay(normalized, inserted)),
    ];

    const alertLevel =
      notifications.length > 0
        ? await this.alertLevelOf(normalized.source)
        : null;

    for (const notification of notifications) {
      this.events.emit({
        recipientId: notification.recipientId,
        payload: {
          id: notification.id,
          alertId: notification.alertId ?? null,
          alertLevel,
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

    // Email chỉ tới người vừa được tạo/làm mới thông báo — queue retry không
    // gửi trùng thư cho người đã nhận.
    if (this.emailService && notifications.length > 0) {
      this.dispatchEmail({
        ...normalized,
        recipientIds: notifications.map((row) => row.recipientId),
      }).catch((err) =>
        this.logger.warn(
          `Lỗi gửi email thông báo: ${err instanceof Error ? err.message : 'Unknown error'}`,
        ),
      );
    }

    if (
      this.pushService &&
      alertLevel !== null &&
      normalized.source.kind === 'alert'
    ) {
      this.pushService
        .sendAlertPush({
          alertId: normalized.source.alertId,
          alertLevel,
          recipientIds: notifications.map((row) => row.recipientId),
          title: normalized.title,
          body: normalized.body,
          targetUrl: normalized.source.targetUrl ?? null,
        })
        .catch((err) =>
          this.logger.warn(
            `Lỗi push trình duyệt: ${err instanceof Error ? err.message : 'Unknown error'}`,
          ),
        );
    }

    return notifications.length;
  }

  /**
   * Cảnh báo được nâng mức tại chỗ: unique (alertId, recipientId) khiến người
   * đã nhận bị skipDuplicates bỏ qua. Làm mới dòng cũ (chưa đọc, lên đầu danh
   * sách, nội dung mới) để họ cũng được báo lại — docs/plan-lert.md mục 1.
   */
  private async refreshForReplay(
    data: NotificationDeliveryData,
    inserted: Array<{ recipientId: string }>,
  ) {
    if (!data.replay || data.source.kind !== 'alert') return [];
    const insertedIds = new Set(inserted.map((row) => row.recipientId));
    const remaining = data.recipientIds.filter((id) => !insertedIds.has(id));
    if (remaining.length === 0) return [];
    return this.prisma.notification.updateManyAndReturn({
      where: { alertId: data.source.alertId, recipientId: { in: remaining } },
      data: {
        readAt: null,
        createdAt: new Date(),
        title: data.title,
        body: data.body,
      },
      select: DELIVERED_SELECT,
    });
  }

  /**
   * Chỉ thông báo nguồn `alert` mới mang cấp — nguồn khác không phát tiếng/push.
   * Đọc lỗi → null: thông báo trong app vẫn phải tới, chỉ mất tiếng + push.
   */
  private async alertLevelOf(
    source: NotificationSource,
  ): Promise<number | null> {
    if (source.kind !== 'alert') {
      return null;
    }
    try {
      const alert = await this.prisma.alert.findUnique({
        where: { id: source.alertId },
        select: { level: true },
      });
      return alert?.level ?? null;
    } catch (error) {
      this.logger.warn(
        `Không đọc được cấp cảnh báo ${source.alertId}: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
      return null;
    }
  }

  private async dispatchEmail(
    normalized: NotificationDeliveryData,
  ): Promise<void> {
    if (!this.emailService) return;
    if (normalized.source.kind === 'alert') {
      await this.emailService.sendAlertEmail(
        normalized.source.alertId,
        normalized.recipientIds,
      );
    } else if (normalized.source.kind === 'discussion') {
      await this.emailService.sendDiscussionEmail(
        normalized.source.discussionMessageId,
        normalized.recipientIds,
      );
    }
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
      source: {
        kind: 'alert',
        alertId: data.alertId,
        targetUrl: data.targetUrl,
      },
      replay: data.replay,
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
      row.targetUrl = data.source.targetUrl ?? null;
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
