import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoadingSpinner } from './loading-spinner';

describe('LoadingSpinner', () => {
  it('render SVG với role="status" và nhãn accessibility', () => {
    const html = renderToStaticMarkup(h(LoadingSpinner, { label: 'Đang tải dữ liệu…' }));
    expect(html).toContain('role="status"');
    expect(html).toContain('Đang tải dữ liệu…');
    expect(html).toContain('<svg');
  });

  it('áp dụng class kích thước và màu sắc tương ứng', () => {
    const htmlOrange = renderToStaticMarkup(h(LoadingSpinner, { size: 'lg', tone: 'orange' }));
    expect(htmlOrange).toContain('h-8 w-8');
    expect(htmlOrange).toContain('text-fpt-orange');

    const htmlSmall = renderToStaticMarkup(h(LoadingSpinner, { size: 'sm', tone: 'blue' }));
    expect(htmlSmall).toContain('h-4 w-4');
    expect(htmlSmall).toContain('text-fpt-blue');
  });

  it('chứa class xoay chuyển động animate-spin', () => {
    const html = renderToStaticMarkup(h(LoadingSpinner, {}));
    expect(html).toContain('animate-spin');
  });
});
