import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Modal } from './modal';

const noop = () => undefined;

function openingTag(html: string, marker: string): string {
  const at = html.indexOf(marker);
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
}

describe('Modal', () => {
  it('mặc định cả hộp thoại cuộn như cũ — các modal khác không đổi', () => {
    const html = renderToStaticMarkup(
      h(Modal, { title: 'T', open: true, onClose: noop, children: h('p', null, 'x') }),
    );
    const dialog = openingTag(html, 'role="dialog"');
    expect(dialog).toContain('overflow-y-auto');
    expect(dialog).toContain('max-w-lg');
    expect(html).not.toContain('data-modal-body');
  });

  it('scrollBody: tiêu đề + nút đóng cố định, chỉ phần thân cuộn', () => {
    const html = renderToStaticMarkup(
      h(Modal, {
        title: 'T',
        open: true,
        onClose: noop,
        size: 'xl',
        scrollBody: true,
        children: h('p', null, 'nội dung'),
      }),
    );
    const dialog = openingTag(html, 'role="dialog"');
    expect(dialog).toContain('max-w-5xl');
    expect(dialog).not.toContain('overflow-y-auto');
    const body = openingTag(html, 'data-modal-body="true"');
    expect(body).toContain('overflow-y-auto');
    // Nút đóng nằm trước (ngoài) vùng cuộn, nội dung nằm trong.
    expect(html.indexOf('aria-label="Đóng"')).toBeLessThan(html.indexOf('data-modal-body'));
    expect(html.indexOf('nội dung')).toBeGreaterThan(html.indexOf('data-modal-body'));
  });
});
