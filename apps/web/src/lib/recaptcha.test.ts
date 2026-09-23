import { describe, expect, it, vi } from 'vitest';
import {
  createRecaptchaClient,
  RECAPTCHA_NORMAL_WIDTH,
  RecaptchaUnavailableError,
  whenLaidOut,
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

  it('bật/tắt CHỈ theo site key — không có ngoại lệ theo tên miền (localhost hay proxy nội bộ)', () => {
    // Từng tự tắt khi hostname là localhost: sau nginx, Next thấy Host=127.0.0.1
    // nên production cũng mất ô tick trong khi API vẫn đòi token.
    const on = createRecaptchaClient({ siteKey: 'k', loadScript: vi.fn(), getGrecaptcha: () => undefined });
    const off = createRecaptchaClient({ siteKey: '', loadScript: vi.fn(), getGrecaptcha: () => undefined });
    expect(on.enabled).toBe(true);
    expect(off.enabled).toBe(false);
  });
});

describe('whenLaidOut — chỉ đo bề rộng khi phần tử đã hiện', () => {
  type Callback = () => void;
  function fakeResizeObserver() {
    const instances: { cb: Callback; observed: unknown[]; disconnect: ReturnType<typeof vi.fn> }[] =
      [];
    class RO {
      observed: unknown[] = [];
      disconnect = vi.fn();
      constructor(public cb: Callback) {
        instances.push(this);
      }
      observe(el: unknown) {
        this.observed.push(el);
      }
    }
    return { RO: RO as unknown as typeof ResizeObserver, instances };
  }

  it('đã hiện (clientWidth > 0) → gọi ngay, không cần observer', () => {
    const { RO, instances } = fakeResizeObserver();
    const onWidth = vi.fn();
    whenLaidOut({ clientWidth: 384 } as HTMLElement, onWidth, RO);
    expect(onWidth).toHaveBeenCalledWith(384);
    expect(instances).toHaveLength(0);
  });

  it('đang ẩn (clientWidth = 0, form hidden lúc kiểm tra phiên) → đợi tới khi hiện rồi mới đo', () => {
    const { RO, instances } = fakeResizeObserver();
    const el = { clientWidth: 0 } as { clientWidth: number };
    const onWidth = vi.fn();
    whenLaidOut(el as HTMLElement, onWidth, RO);
    expect(onWidth).not.toHaveBeenCalled();
    expect(instances[0]?.observed).toEqual([el]);

    instances[0]!.cb(); // vẫn 0 → chưa đo
    expect(onWidth).not.toHaveBeenCalled();

    el.clientWidth = 384;
    instances[0]!.cb();
    expect(onWidth).toHaveBeenCalledTimes(1);
    expect(onWidth).toHaveBeenCalledWith(384);
    expect(instances[0]!.disconnect).toHaveBeenCalled();
  });

  it('huỷ trước khi hiện → ngắt observer, không gọi lại', () => {
    const { RO, instances } = fakeResizeObserver();
    const onWidth = vi.fn();
    const stop = whenLaidOut({ clientWidth: 0 } as HTMLElement, onWidth, RO);
    stop();
    expect(instances[0]!.disconnect).toHaveBeenCalled();
  });

  it('trình duyệt không có ResizeObserver → coi như đủ chỗ cho ô tick chuẩn', () => {
    const onWidth = vi.fn();
    whenLaidOut({ clientWidth: 0 } as HTMLElement, onWidth, undefined);
    expect(onWidth).toHaveBeenCalledWith(RECAPTCHA_NORMAL_WIDTH);
  });
});
