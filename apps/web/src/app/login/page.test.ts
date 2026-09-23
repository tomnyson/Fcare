import { describe, expect, it, vi } from 'vitest';

const recaptchaMock = vi.hoisted(() => ({ enabled: true, mount: vi.fn(), reset: vi.fn() }));
vi.mock('../../lib/recaptcha', () => ({ recaptcha: recaptchaMock }));

const headersMock = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));
vi.mock('next/headers', () => headersMock);

const { default: LoginPage } = await import('./page');

function request(host: string, hasCookie = false) {
  headersMock.cookies.mockResolvedValue({ has: () => hasCookie });
  headersMock.headers.mockResolvedValue({
    get: (name: string) => (name.toLowerCase() === 'host' ? host : null),
  });
}

describe('LoginPage (server)', () => {
  it('sau reverse proxy Host là 127.0.0.1 → vẫn bật reCAPTCHA khi có site key', async () => {
    request('127.0.0.1:3000');
    const element = (await LoginPage()) as { props: { recaptchaEnabled: boolean } };
    expect(element.props.recaptchaEnabled).toBe(true);
  });

  it('không có site key → tắt, bất kể host', async () => {
    recaptchaMock.enabled = false;
    request('fcare.fpltaynguyen.vn');
    const element = (await LoginPage()) as { props: { recaptchaEnabled: boolean } };
    expect(element.props.recaptchaEnabled).toBe(false);
    recaptchaMock.enabled = true;
  });

  it('đọc cookie phiên để truyền checkSession', async () => {
    request('localhost:3000', true);
    const element = (await LoginPage()) as { props: { checkSession: boolean } };
    expect(element.props.checkSession).toBe(true);
  });
});
