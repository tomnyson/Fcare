import { createHash } from 'node:crypto';
import type { SystemErrorSource } from '@prisma/client';

/** Việt Nam không có giờ mùa hè — lệch UTC cố định +7. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

/** Thứ Hai 00:00 giờ VN của tuần chứa `date`, trả về dạng Date UTC. */
export function weekStartOf(date: Date): Date {
  const local = new Date(date.getTime() + VN_OFFSET_MS);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const localMidnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  return new Date(localMidnight - daysSinceMonday * DAY_MS - VN_OFFSET_MS);
}

export function previousWeekStart(date: Date): Date {
  return new Date(weekStartOf(date).getTime() - WEEK_MS);
}

/** `YYYY-MM-DD` (ngày giờ VN) → đầu tuần chứa ngày đó; sai định dạng → null. */
export function parseWeekParam(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const probe = new Date(utc);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  // Nửa ngày giờ VN để chắc chắn nằm trong đúng ngày đó.
  return weekStartOf(new Date(utc - VN_OFFSET_MS + DAY_MS / 2));
}

/** Ngày đầu tuần theo giờ VN, dạng `YYYY-MM-DD` — dùng cho URL và nhãn. */
export function formatWeekParam(weekStart: Date): string {
  return new Date(weekStart.getTime() + VN_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** Bỏ phần thay đổi theo từng lần (uuid, số, hex) để lỗi cùng loại gộp một nhóm. */
export function normalizeForFingerprint(message: string): string {
  return message
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '#',
    )
    .replace(/\b[0-9a-f]{8,}\b/gi, '#')
    .replace(/\d+/g, '#');
}

export function errorFingerprint(input: {
  source: SystemErrorSource;
  context: string | null;
  route: string | null;
  message: string;
}): string {
  return createHash('sha1')
    .update(
      [
        input.source,
        input.context ?? '',
        input.route ?? '',
        normalizeForFingerprint(input.message),
      ].join('|'),
    )
    .digest('hex');
}
