import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Pagination } from './pagination';

const noop = () => undefined;

describe('Pagination Component', () => {
  it('hiển thị nhãn "Đang hiển thị 1 đến 10 của 249 mục" và các nút 1 2 3 4 5 ... 25', () => {
    const html = renderToStaticMarkup(
      h(Pagination, {
        page: 1,
        totalPages: 25,
        total: 249,
        limit: 10,
        onPageChange: noop,
      }),
    );

    expect(html).toContain('Đang hiển thị 1 đến 10 của 249 mục');
    expect(html).toContain('Trước');
    expect(html).toContain('Sau');
    expect(html).toContain('>1<');
    expect(html).toContain('>2<');
    expect(html).toContain('>3<');
    expect(html).toContain('>4<');
    expect(html).toContain('>5<');
    expect(html).toContain('…');
    expect(html).toContain('>25<');

    // Nút trước bị disabled khi ở trang 1
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Trước<\/button>/);
  });

  it('trang hiện tại có aria-current="page" và màu nền active', () => {
    const html = renderToStaticMarkup(
      h(Pagination, {
        page: 3,
        totalPages: 10,
        total: 100,
        limit: 10,
        onPageChange: noop,
      }),
    );

    expect(html).toContain('aria-current="page"');
    expect(html).toContain('bg-fpt-blue-900');
    expect(html).toContain('Đang hiển thị 21 đến 30 của 100 mục');
  });

  it('ở cuối danh sách: nút Sau bị disabled', () => {
    const html = renderToStaticMarkup(
      h(Pagination, {
        page: 25,
        totalPages: 25,
        total: 249,
        limit: 10,
        onPageChange: noop,
      }),
    );

    expect(html).toContain('Đang hiển thị 241 đến 249 của 249 mục');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Sau<\/button>/);
  });

  it('isLoading → hiện text "Đang tải dữ liệu…"', () => {
    const html = renderToStaticMarkup(
      h(Pagination, {
        page: 1,
        totalPages: 5,
        total: 50,
        limit: 10,
        isLoading: true,
        onPageChange: noop,
      }),
    );

    expect(html).toContain('Đang tải dữ liệu…');
  });

  it('ẩn thanh phân trang khi chỉ có 1 trang và không có mục nào', () => {
    const html = renderToStaticMarkup(
      h(Pagination, {
        page: 1,
        totalPages: 1,
        total: 0,
        limit: 10,
        onPageChange: noop,
      }),
    );

    expect(html).toBe('');
  });
});
