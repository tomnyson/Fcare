/**
 * Làm mới phiên đăng nhập (access token 15', refresh token xoay vòng 7 ngày).
 *
 * Vì sao phải "một lượt": refresh token bị THU HỒI ngay khi dùng. Khi access
 * token hết hạn, một trang bắn 5–10 request cùng lúc, tất cả nhận 401 và cùng
 * gửi refresh bằng CÙNG một cookie — lượt đầu thắng, các lượt sau gặp token đã
 * thu hồi → 401 → bị đá về /login giữa chừng. Gom về một promise chung trong
 * tab, và khóa Web Locks giữa các tab, để chỉ một lượt xoay token mỗi lần.
 */

/** Access token sống 15 phút — làm mới trước đó để request không bao giờ gặp 401. */
export const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;

const LOCK_NAME = 'fcare-auth-refresh';

/** `unauthorized` = hết phiên thật (đăng nhập lại); `error` = mạng/máy chủ, thử lại sau. */
export type RefreshResult = 'ok' | 'unauthorized' | 'error';

interface RefreshDeps {
  post: () => Promise<{ ok: boolean; status: number }>;
  locks?: { request: (name: string, run: () => Promise<RefreshResult>) => Promise<unknown> };
}

export function createSessionRefresher({ post, locks }: RefreshDeps): () => Promise<RefreshResult> {
  let inFlight: Promise<RefreshResult> | null = null;

  async function callRefresh(): Promise<RefreshResult> {
    try {
      const response = await post();
      if (response.ok) return 'ok';
      return response.status === 401 || response.status === 403 ? 'unauthorized' : 'error';
    } catch {
      return 'error';
    }
  }

  async function runExclusive(): Promise<RefreshResult> {
    if (!locks) return callRefresh();
    let result: RefreshResult = 'error';
    await locks.request(LOCK_NAME, async () => {
      result = await callRefresh();
      return result;
    });
    return result;
  }

  return function refresh() {
    inFlight ??= runExclusive().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

/** Đã đủ lâu kể từ lần làm mới gần nhất để cần làm mới tiếp. */
export function shouldKeepAlive(lastRefreshAt: number, now: number): boolean {
  return now - lastRefreshAt >= KEEP_ALIVE_INTERVAL_MS;
}
