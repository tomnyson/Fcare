import { describe, expect, it, vi } from 'vitest';
import {
  createRecaptchaClient,
  RECAPTCHA_NORMAL_WIDTH,
  RecaptchaUnavailableError,
} from './recaptcha';

function fakeGrecaptcha() {
  return {
    ready: (callback: () => void) => callback(),
    render: vi.fn().mockReturnValue(7),
    reset: vi.fn(),
  };
}

const handlers = { onToken: vi.fn(), onExpired: vi.fn() };

describe('createRecaptchaClient (v2 checkbox)', () => {
  it('không có site key → tắt, không tải script', async () => {
    const loadScript = vi.fn();
    const client = createRecaptchaClient({ siteKey: '', loadScript, getGrecaptcha: () => undefined });
    expect(client.enabled).toBe(false);
    await expect(client.mount({} as HTMLElement, 400, handlers)).resolves.toBeNull();
    expect(loadScript).not.toHaveBeenCalled();
  });

  it('tải script render=explicit tiếng Việt một lần, render ô tick theo site key', async () => {
    const grecaptcha = fakeGrecaptcha();
    const loadScript = vi.fn().mockResolvedValue(undefined);
    const client = createRecaptchaClient({ siteKey: 'k', loadScript, getGrecaptcha: () => grecaptcha });
    const container = {} as HTMLElement;

    await expect(client.mount(container, 384, handlers)).resolves.toBe(7);
    await client.mount(container, 384, handlers);

    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript).toHaveBeenCalledWith(
      'https://www.google.com/recaptcha/api.js?render=explicit&hl=vi',
    );
    const [target, params] = grecaptcha.render.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    expect(target).toBe(container);
    expect(params).toMatchObject({ sitekey: 'k', size: 'normal' });

    (params.callback as (token: string) => void)('tok');
    (params['expired-callback'] as () => void)();
    expect(handlers.onToken).toHaveBeenCalledWith('tok');
    expect(handlers.onExpired).toHaveBeenCalled();
  });

  it('khung hẹp hơn ô tick chuẩn → cỡ compact để không tràn ngang', async () => {
    const grecaptcha = fakeGrecaptcha();
    const client = createRecaptchaClient({
      siteKey: 'k',
      loadScript: vi.fn().mockResolvedValue(undefined),
      getGrecaptcha: () => grecaptcha,
    });
    await client.mount({} as HTMLElement, RECAPTCHA_NORMAL_WIDTH - 1, handlers);
    expect(grecaptcha.render.mock.calls[0][1]).toMatchObject({ size: 'compact' });
  });

  it('script bị chặn → RecaptchaUnavailableError, lần sau thử tải lại', async () => {
    const grecaptcha = fakeGrecaptcha();
    const loadScript = vi
      .fn()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce(undefined);
    const client = createRecaptchaClient({ siteKey: 'k', loadScript, getGrecaptcha: () => grecaptcha });

    await expect(client.mount({} as HTMLElement, 400, handlers)).rejects.toBeInstanceOf(
      RecaptchaUnavailableError,
    );
    await expect(client.mount({} as HTMLElement, 400, handlers)).resolves.toBe(7);
    expect(loadScript).toHaveBeenCalledTimes(2);
  });

  it('script tải xong nhưng không có grecaptcha → RecaptchaUnavailableError', async () => {
    const client = createRecaptchaClient({
      siteKey: 'k',
      loadScript: vi.fn().mockResolvedValue(undefined),
      getGrecaptcha: () => undefined,
    });
    await expect(client.mount({} as HTMLElement, 400, handlers)).rejects.toBeInstanceOf(
      RecaptchaUnavailableError,
    );
  });

  it('reset bỏ tick của đúng widget; chưa tải thì bỏ qua', () => {
    const grecaptcha = fakeGrecaptcha();
    const client = createRecaptchaClient({
      siteKey: 'k',
      loadScript: vi.fn(),
      getGrecaptcha: () => grecaptcha,
    });
    client.reset(7);
    expect(grecaptcha.reset).toHaveBeenCalledWith(7);

    const notLoaded = createRecaptchaClient({ siteKey: 'k', loadScript: vi.fn(), getGrecaptcha: () => undefined });
    expect(() => notLoaded.reset(7)).not.toThrow();
  });

  it('tự động tắt khi chạy trên tên miền localhost / 127.0.0.1', async () => {
    const loadScript = vi.fn();
    const grecaptcha = fakeGrecaptcha();
    const client = createRecaptchaClient({
      siteKey: 'k',
      loadScript,
      getGrecaptcha: () => grecaptcha,
      isLocalhost: () => true,
    });

    expect(client.enabled).toBe(false);
    await expect(client.mount({} as HTMLElement, 400, handlers)).resolves.toBeNull();
    expect(loadScript).not.toHaveBeenCalled();
  });
});
