import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export const ONESIGNAL_NOTIFICATIONS_URL =
  'https://api.onesignal.com/notifications';
/** Chỉ cảnh báo Cao (3) và Khẩn cấp (4) mới push lên trình duyệt. */
const PUSH_MIN_ALERT_LEVEL = 3;
const PUSH_TIMEOUT_MS = 5_000;
/** Giới hạn external_id của OneSignal cho một request. */
const MAX_EXTERNAL_IDS_PER_REQUEST = 20_000;

export interface AlertPushData {
  alertId: string;
  alertLevel: number;
  /** Chỉ những người VỪA được tạo thông báo — retry không push lại. */
  recipientIds: string[];
  title: string;
  body: string;
  targetUrl: string | null;
}

/**
 * Khoá chống gửi trùng phía OneSignal: cùng cảnh báo + cùng tập người nhận
 * luôn ra cùng một chuỗi dạng UUID (OneSignal bỏ request trùng trong 30 ngày).
 */
export function pushIdempotencyKey(
  alertId: string,
  recipientIds: string[],
): string {
  const hex = createHash('sha256')
    .update([alertId, ...[...recipientIds].sort()].join('|'))
    .digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

/**
 * Web Push qua OneSignal — kênh phụ cho cảnh báo cấp 3–4 khi cán bộ đã đóng
 * tab. Chuông trong app + SSE vẫn là kênh chính, nên mọi lỗi ở đây chỉ ghi log
 * và KHÔNG ném ra luồng gửi cảnh báo. Định danh duy nhất gửi đi là staff.id.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly appId: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly webBaseUrl: string;
  private warnedMissingConfig = false;

  constructor(config: ConfigService) {
    this.appId = config.get<string>('ONESIGNAL_APP_ID') || undefined;
    this.apiKey = config.get<string>('ONESIGNAL_REST_API_KEY') || undefined;
    const base =
      config.get<string>('WEB_BASE_URL') ??
      config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
    this.webBaseUrl = base.replace(/\/+$/, '');
  }

  async sendAlertPush(data: AlertPushData): Promise<void> {
    if (
      data.alertLevel < PUSH_MIN_ALERT_LEVEL ||
      data.recipientIds.length === 0
    ) {
      return;
    }
    if (!this.appId || !this.apiKey) {
      if (!this.warnedMissingConfig) {
        this.warnedMissingConfig = true;
        this.logger.warn(
          'Chưa cấu hình ONESIGNAL_APP_ID/ONESIGNAL_REST_API_KEY — bỏ qua push trình duyệt.',
        );
      }
      return;
    }
    for (const batch of chunk(
      data.recipientIds,
      MAX_EXTERNAL_IDS_PER_REQUEST,
    )) {
      await this.post(data, batch);
    }
  }

  private async post(
    data: AlertPushData,
    recipientIds: string[],
  ): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);
    try {
      const response = await fetch(ONESIGNAL_NOTIFICATIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${this.apiKey}`,
        },
        body: JSON.stringify({
          app_id: this.appId,
          target_channel: 'push',
          include_aliases: { external_id: recipientIds },
          headings: { en: data.title, vi: data.title },
          contents: { en: data.body, vi: data.body },
          web_url: `${this.webBaseUrl}${data.targetUrl ?? '/alerts'}`,
          idempotency_key: pushIdempotencyKey(data.alertId, recipientIds),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(
          `OneSignal trả HTTP ${response.status} khi push cảnh báo ${data.alertId}.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Không push được cảnh báo ${data.alertId}: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
