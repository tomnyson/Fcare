import type { ConfigService } from '@nestjs/config';

/** Tên biến .env: bật lên thì hệ thống chặn mọi email và Web Push gửi ra ngoài. */
export const EXTERNAL_NOTIFICATIONS_DISABLED_ENV =
  'NOTIFICATIONS_EXTERNAL_DISABLED';

const TRUTHY = new Set(['true', '1', 'yes', 'on']);

/**
 * Chặn kênh gửi ra ngoài (email + push) — dùng khi chạy thử/staging để không
 * làm phiền cán bộ thật. Chuông trong app vẫn hoạt động bình thường.
 */
export function isExternalNotificationsDisabled(
  config: ConfigService,
): boolean {
  const raw = config.get<string>(EXTERNAL_NOTIFICATIONS_DISABLED_ENV);
  return TRUTHY.has((raw ?? '').trim().toLowerCase());
}
