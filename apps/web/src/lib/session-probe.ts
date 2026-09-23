import type { RefreshResult } from './session-refresh';

interface SessionProbeDeps {
  me: () => Promise<{ ok: boolean; status: number }>;
  refresh: () => Promise<RefreshResult>;
}

/**
 * Hỏi API xem phiên còn sống không — dùng ở trang /login để người đã đăng nhập
 * không phải đăng nhập lại. KHÔNG dùng `apiFetch`: nó tự đá về /login khi hết
 * phiên, ở chính trang /login sẽ thành vòng lặp tải lại. Mọi lỗi = "chưa đăng nhập".
 */
export function createSessionProbe({ me, refresh }: SessionProbeDeps): () => Promise<boolean> {
  return async () => {
    try {
      const first = await me();
      if (first.ok) return true;
      if (first.status !== 401) return false;
      if ((await refresh()) !== 'ok') return false;
      return (await me()).ok;
    } catch {
      return false;
    }
  };
}
