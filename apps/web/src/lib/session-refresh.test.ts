import { describe, expect, it, vi } from 'vitest';
import { createSessionRefresher, shouldKeepAlive, KEEP_ALIVE_INTERVAL_MS } from './session-refresh';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createSessionRefresher', () => {
  it('nhiều request 401 cùng lúc chỉ gọi /auth/refresh MỘT lần', async () => {
    const pending = deferred<{ ok: boolean; status: number }>();
    const post = vi.fn().mockReturnValue(pending.promise);
    const refresh = createSessionRefresher({ post });

    const results = Promise.all([refresh(), refresh(), refresh()]);
    pending.resolve({ ok: true, status: 200 });

    await expect(results).resolves.toEqual(['ok', 'ok', 'ok']);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('xong lượt trước thì lượt sau gọi lại bình thường', async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const refresh = createSessionRefresher({ post });

    await refresh();
    await refresh();

    expect(post).toHaveBeenCalledTimes(2);
  });

  it('401 từ /auth/refresh nghĩa là hết phiên thật', async () => {
    const post = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(createSessionRefresher({ post })()).resolves.toBe('unauthorized');
  });

  it('lỗi mạng/5xx không bị coi là hết phiên — không đá người dùng ra', async () => {
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const serverDown = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    await expect(createSessionRefresher({ post: offline })()).resolves.toBe('error');
    await expect(createSessionRefresher({ post: serverDown })()).resolves.toBe('error');
  });

  it('có Web Locks thì chạy trong khóa chung để các tab không xoay token chồng nhau', async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const request = vi.fn((_name: string, run: () => Promise<unknown>) => run());
    const refresh = createSessionRefresher({ post, locks: { request } });

    await expect(refresh()).resolves.toBe('ok');
    expect(request).toHaveBeenCalledWith('fcare-auth-refresh', expect.any(Function));
  });
});

describe('shouldKeepAlive', () => {
  it('chưa tới hạn thì chưa làm mới', () => {
    expect(shouldKeepAlive(1_000, 1_000 + KEEP_ALIVE_INTERVAL_MS - 1)).toBe(false);
  });

  it('tới hạn (trước khi access token 15 phút hết) thì làm mới', () => {
    expect(shouldKeepAlive(1_000, 1_000 + KEEP_ALIVE_INTERVAL_MS)).toBe(true);
  });

  it('làm mới trước khi access token hết hạn', () => {
    expect(KEEP_ALIVE_INTERVAL_MS).toBeLessThan(15 * 60 * 1000);
  });
});
