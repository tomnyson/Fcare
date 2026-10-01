import type { PinProofPurpose } from '@fcare/shared-types';
import { apiFetch } from './api';

export { APP_LOCK_EVENT, pinActionForCode, type PinCodeAction } from './pin-codes';

/** Mốc thao tác gần nhất — chia sẻ giữa các tab qua sự kiện `storage`. */
export const LAST_ACTIVITY_KEY = 'fcare:last-activity';

/** Ghi mốc thao tác tối đa mỗi 15 giây — rê chuột liên tục không làm nghẽn localStorage. */
export const ACTIVITY_THROTTLE_MS = 15_000;

const MINUTE_MS = 60_000;

/**
 * Nhịp hỏi lại `/auth/me` để phiên đang mở nhận mốc khoá admin vừa đổi.
 * `useMe` có staleTime 5 phút và không tự refetch — thiếu nhịp này thì tab mở
 * trước khi admin đổi 15 → 3 phút vẫn đếm 15 phút tới khi tải lại trang.
 */
export const IDLE_SETTING_SYNC_MS = 60_000;

export function msUntilIdleLock(lastActivityAt: number, now: number, idleMinutes: number): number {
  return Math.max(0, lastActivityAt + idleMinutes * MINUTE_MS - now);
}

export function isIdleExpired(lastActivityAt: number, now: number, idleMinutes: number): boolean {
  return msUntilIdleLock(lastActivityAt, now, idleMinutes) === 0;
}

export function shouldRecordActivity(lastRecordedAt: number, now: number): boolean {
  return now - lastRecordedAt >= ACTIVITY_THROTTLE_MS;
}

export function parseStoredActivity(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Nhập lại PIN cho thao tác phá huỷ — server kiểm và trả bằng chứng sống 2 phút. */
export async function requestPinProof(pin: string, purpose: PinProofPurpose): Promise<string> {
  const result = await apiFetch<{ unlocked: true; proof?: string }>('/auth/pin/verify', {
    method: 'POST',
    body: JSON.stringify({ pin, purpose }),
  });
  if (!result.proof) throw new Error('Máy chủ không cấp bằng chứng xác thực PIN.');
  return result.proof;
}

export function pinProofHeaders(proof: string): Record<string, string> {
  return { 'X-Pin-Proof': proof };
}
