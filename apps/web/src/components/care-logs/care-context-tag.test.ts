import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CareContextTag } from './care-context-tag';

describe('CareContextTag — bối cảnh lượt chăm sóc', () => {
  it('hiện học kỳ, mã lớp và môn học', () => {
    const html = renderToStaticMarkup(
      h(CareContextTag, {
        section: { code: 'SA21301', term: 'FA26', subject: { code: 'SE101', name: 'Ứng dụng phần mềm' } },
      }),
    );
    expect(html).toContain('Học kỳ FA26');
    expect(html).toContain('SA21301');
    expect(html).toContain('Ứng dụng phần mềm');
    expect(html).toContain('SE101');
  });

  it('nhật ký cũ gắn cảnh báo → dùng mã lớp của cảnh báo', () => {
    const html = renderToStaticMarkup(h(CareContextTag, { section: null, fallbackCode: 'SA21301' }));
    expect(html).toContain('Lớp SA21301 (theo cảnh báo)');
  });

  it('nhật ký cũ không có lớp → nói rõ là chưa gắn lớp', () => {
    const html = renderToStaticMarkup(h(CareContextTag, { section: null }));
    expect(html).toContain('Chưa gắn lớp học phần');
  });
});
