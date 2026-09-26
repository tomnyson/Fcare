import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccessDenied, PageNotFound, UnexpectedError } from './error-screen';

describe('trang lỗi theo giao diện FCare', () => {
  it('404: mã, tiêu đề display, đường về trang chủ và dashboard', () => {
    const html = renderToStaticMarkup(h(PageNotFound));
    expect(html).toContain('404');
    expect(html).toContain('Không tìm thấy trang');
    expect(html).toContain('href="/dashboard"');
    expect(html).toMatch(/<h1[^>]*>/);
  });

  it('403: nói rõ thiếu quyền và việc người dùng làm được', () => {
    const html = renderToStaticMarkup(h(AccessDenied));
    expect(html).toContain('403');
    expect(html).toContain('Bạn không có quyền truy cập trang này');
    expect(html).toContain('quản trị viên');
    expect(html).toContain('href="/dashboard"');
  });

  it('lỗi bất ngờ trong khung dashboard: tiếng Việt, có nút thử lại', () => {
    const html = renderToStaticMarkup(h(UnexpectedError, { onRetry: () => {} }));
    expect(html).toContain('Đã xảy ra lỗi');
    expect(html).toContain('Thử lại');
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toMatch(/Application error|client-side exception/);
    expect(html).not.toContain('FPT Education');
  });

  it('lỗi bất ngờ toàn trang: có khung thương hiệu', () => {
    const html = renderToStaticMarkup(h(UnexpectedError, { onRetry: () => {}, fullPage: true }));
    expect(html).toContain('Đã xảy ra lỗi');
    expect(html).toContain('FPT Education');
  });
});
