import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Chưa có jsdom/testing-library (LOW-F đã park) nên canh ở mức mã nguồn, cùng
// cách với topbar-accessibility.test.ts.
const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');
const sidebar = read('sidebar.tsx');
const mobileNav = read('mobile-nav.tsx');
const topbar = read('topbar.tsx');
const skeleton = read('shell-skeleton.tsx');
const globals = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');

describe('sidebar — thu gọn thành thanh icon chỉ khi nằm trong rail', () => {
  it('định nghĩa variant compact gắn với [data-nav="rail"] dưới lg', () => {
    expect(globals).toMatch(/@custom-variant compact/);
    expect(globals).toMatch(/width < 64rem/);
    expect(globals).toMatch(/data-nav='rail'/);
  });

  it('không còn max-lg: — nếu còn, menu trượt trên điện thoại sẽ mất chữ', () => {
    expect(sidebar).not.toContain('max-lg:');
    expect(sidebar).toContain('compact:');
  });

  it('sidebar cố định ẩn dưới md và đánh dấu là rail', () => {
    expect(sidebar).toContain('data-nav="rail"');
    expect(sidebar).toContain('max-md:hidden');
  });

  it('id panel nhóm dùng useId — rail và menu trượt cùng render không trùng id', () => {
    expect(sidebar).toContain('useId()');
    expect(sidebar).not.toMatch(/nav-group-\$\{/);
  });
});

describe('mobile-nav — menu trượt trên điện thoại', () => {
  it('là <dialog> modal có nhãn', () => {
    expect(mobileNav).toContain('<dialog');
    expect(mobileNav).toContain('showModal()');
    expect(mobileNav).toMatch(/aria-label="Menu điều hướng"/);
  });

  it('nút mở có nhãn, aria-expanded, aria-controls và chỉ hiện dưới md', () => {
    const start = mobileNav.indexOf('aria-label="Mở menu"');
    expect(start).toBeGreaterThan(-1);
    const button = mobileNav.slice(mobileNav.lastIndexOf('<button', start), mobileNav.indexOf('>', start));
    expect(button).toContain('aria-expanded=');
    expect(button).toContain('aria-controls=');
    expect(button).toContain('md:hidden');
  });

  it('có nút đóng và đóng khi đổi trang', () => {
    expect(mobileNav).toContain('aria-label="Đóng menu"');
    expect(mobileNav).toContain('usePathname()');
  });

  it('tôn trọng giảm chuyển động và không dùng title=', () => {
    expect(mobileNav).toContain('motion-reduce:transition-none');
    expect(mobileNav).not.toMatch(/\stitle=/);
  });

  it('topbar gắn nút mở menu', () => {
    expect(topbar).toContain('<MobileNav');
  });

  it('khóa cuộn trang phía sau khi menu mở', () => {
    expect(globals).toMatch(/html:has\(dialog\[data-mobile-nav\]\[open\]\)/);
  });
});

describe('shell-skeleton khớp layout mobile', () => {
  it('ẩn khung sidebar dưới md và có ô chờ cho nút menu', () => {
    expect(skeleton).toContain('max-md:hidden');
    expect(skeleton).toMatch(/md:hidden/);
  });
});
