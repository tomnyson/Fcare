import { IDLE_LOCK_MINUTES_OPTIONS } from '@fcare/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVITY_THROTTLE_MS,
  IDLE_SETTING_SYNC_MS,
  isIdleExpired,
  msUntilIdleLock,
  parseStoredActivity,
  pinActionForCode,
  pinProofHeaders,
  requestPinProof,
  shouldRecordActivity,
} from './pin-lock';

const MINUTE = 60_000;

describe('pinActionForCode — mã lỗi PIN từ API', () => {
  it('chưa tạo PIN → sang trang tạo PIN', () => {
    expect(pinActionForCode('PIN_SETUP_REQUIRED')).toEqual({ kind: 'redirect', href: '/setup-pin' });
  });

  it('sai quá số lần → đăng nhập lại bằng mật khẩu', () => {
    expect(pinActionForCode('PIN_ATTEMPTS_EXCEEDED')).toEqual({ kind: 'redirect', href: '/login' });
  });

  it('phiên bị khoá → hiện màn khoá, không đổi trang (giữ dữ liệu đang soạn)', () => {
    expect(pinActionForCode('APP_LOCKED')).toEqual({ kind: 'lock' });
  });

  it('mã khác → không làm gì', () => {
    expect(pinActionForCode('PIN_INCORRECT')).toBeNull();
    expect(pinActionForCode(undefined)).toBeNull();
  });
});

describe('isIdleExpired / msUntilIdleLock', () => {
  it('chưa đủ thời gian → chưa khoá', () => {
    expect(isIdleExpired(0, 15 * MINUTE - 1, 15)).toBe(false);
    expect(msUntilIdleLock(0, 10 * MINUTE, 15)).toBe(5 * MINUTE);
  });

  it('đủ thời gian → khoá, thời gian còn lại không âm', () => {
    expect(isIdleExpired(0, 15 * MINUTE, 15)).toBe(true);
    expect(msUntilIdleLock(0, 20 * MINUTE, 15)).toBe(0);
  });
});

describe('shouldRecordActivity — không ghi localStorage mỗi lần rê chuột', () => {
  it('ghi lại khi đã qua ngưỡng throttle', () => {
    expect(shouldRecordActivity(1_000, 1_000 + ACTIVITY_THROTTLE_MS - 1)).toBe(false);
    expect(shouldRecordActivity(1_000, 1_000 + ACTIVITY_THROTTLE_MS)).toBe(true);
  });
});

describe('parseStoredActivity — dữ liệu localStorage không tin được', () => {
  it('đọc số hợp lệ', () => {
    expect(parseStoredActivity('1700000000000')).toBe(1_700_000_000_000);
  });

  it('rác / rỗng / âm → null', () => {
    expect(parseStoredActivity(null)).toBeNull();
    expect(parseStoredActivity('abc')).toBeNull();
    expect(parseStoredActivity('-5')).toBeNull();
  });
});

describe('requestPinProof — PIN được kiểm ở server', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gửi PIN + mục đích, trả về bằng chứng để gắn header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { unlocked: true, proof: 'p-1' }, error: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestPinProof('246813', 'BACKUP_RESTORE')).resolves.toBe('p-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/pin\/verify$/);
    expect(JSON.parse(init.body as string)).toEqual({ pin: '246813', purpose: 'BACKUP_RESTORE' });
    expect(pinProofHeaders('p-1')).toEqual({ 'X-Pin-Proof': 'p-1' });
  });

  it('sai PIN → ném lỗi kèm câu tiếng Việt từ API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            data: null,
            error: 'Mã PIN không đúng. Còn 4 lần thử.',
            code: 'PIN_INCORRECT',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    await expect(requestPinProof('000111', 'ALERT_DELETE')).rejects.toMatchObject({
      code: 'PIN_INCORRECT',
      message: 'Mã PIN không đúng. Còn 4 lần thử.',
    });
  });
});

describe('IDLE_SETTING_SYNC_MS — phiên đang mở nhận mốc khoá mới', () => {
  it('đủ ngắn để mốc nhỏ nhất (3 phút) có hiệu lực trước lần khoá đầu tiên', () => {
    const shortest = Math.min(...IDLE_LOCK_MINUTES_OPTIONS) * MINUTE;
    expect(IDLE_SETTING_SYNC_MS).toBeLessThanOrEqual(shortest / 3);
  });

  it('không dày hơn nhịp ghi thao tác — tránh dội /auth/me', () => {
    expect(IDLE_SETTING_SYNC_MS).toBeGreaterThanOrEqual(ACTIVITY_THROTTLE_MS);
  });
});
