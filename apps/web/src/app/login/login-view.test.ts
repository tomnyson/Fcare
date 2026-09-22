import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const recaptchaMock = vi.hoisted(() => ({ enabled: false, mount: vi.fn(), reset: vi.fn() }));
vi.mock('../../lib/recaptcha', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/recaptcha')>()),
  recaptcha: recaptchaMock,
}));

const { LoginView } = await import('./login-view');

describe('LoginView', () => {
  it('có cookie phiên → ẩn form, báo đang kiểm tra (không nháy form)', () => {
    const html = renderToStaticMarkup(h(LoginView, { checkSession: true }));
    expect(html).toContain('Đang kiểm tra phiên đăng nhập');
    expect(html).toMatch(/<form[^>]*hidden=""/);
  });

  it('không có cookie → hiện form ngay', () => {
    const html = renderToStaticMarkup(h(LoginView, { checkSession: false }));
    expect(html).not.toContain('Đang kiểm tra phiên đăng nhập');
    expect(html).not.toMatch(/<form[^>]*hidden/);
  });

  it('bật reCAPTCHA → có chỗ cho ô tick "Tôi không phải người máy", nằm trước nút Đăng nhập', () => {
    recaptchaMock.enabled = true;
    const html = renderToStaticMarkup(h(LoginView, { checkSession: false }));
    recaptchaMock.enabled = false;
    const slotAt = html.indexOf('data-recaptcha="true"');
    expect(slotAt).toBeGreaterThan(html.indexOf('id="password"'));
    expect(slotAt).toBeLessThan(html.indexOf('type="submit"'));
    expect(html).toContain('Đang tải xác minh');
  });

  it('tắt reCAPTCHA → không có ô tick', () => {
    const html = renderToStaticMarkup(h(LoginView, { checkSession: false }));
    expect(html).not.toContain('data-recaptcha');
  });
});
