import { describe, expect, it, vi } from 'vitest';
import { createSessionProbe } from './session-probe';

const res = (status: number) => ({ ok: status >= 200 && status < 300, status });

describe('createSessionProbe — trang đăng nhập hỏi "phiên còn sống không?"', () => {
  it('access token còn hạn → còn phiên, không cần refresh', async () => {
    const refresh = vi.fn();
    const probe = createSessionProbe({ me: async () => res(200), refresh });
    await expect(probe()).resolves.toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('access hết hạn nhưng refresh được → còn phiên', async () => {
    const me = vi.fn().mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(200));
    const probe = createSessionProbe({ me, refresh: async () => 'ok' });
    await expect(probe()).resolves.toBe(true);
    expect(me).toHaveBeenCalledTimes(2);
  });

  it('refresh token cũ/thu hồi → hết phiên, hiện form (không redirect vòng)', async () => {
    const probe = createSessionProbe({
      me: async () => res(401),
      refresh: async () => 'unauthorized',
    });
    await expect(probe()).resolves.toBe(false);
  });

  it('lỗi mạng hoặc máy chủ → coi như chưa đăng nhập', async () => {
    const down = createSessionProbe({
      me: async () => {
        throw new Error('offline');
      },
      refresh: async () => 'ok',
    });
    await expect(down()).resolves.toBe(false);
    const flaky = createSessionProbe({ me: async () => res(401), refresh: async () => 'error' });
    await expect(flaky()).resolves.toBe(false);
    const server = createSessionProbe({ me: async () => res(500), refresh: async () => 'ok' });
    await expect(server()).resolves.toBe(false);
  });
});
