import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClassSection } from '../../lib/types';
import { TermSectionList } from './term-sections-card';

const section = (id: string, lecturer: { id: string; fullName: string } | null): ClassSection => ({
  id,
  code: `SA21301-${id}`,
  term: 'FA26',
  subjectId: `sub-${id}`,
  lecturerId: lecturer?.id ?? null,
  subject: { id: `sub-${id}`, code: id, name: `Môn ${id}` } as ClassSection['subject'],
  lecturer: lecturer ? { ...lecturer, staffCode: lecturer.id.toUpperCase() } : undefined,
});

describe('TermSectionList — lớp học phần trên thẻ hồ sơ', () => {
  it('hiện học kỳ, mã lớp, môn và giảng viên từng lớp', () => {
    const html = renderToStaticMarkup(
      h(TermSectionList, {
        group: { term: 'FA26', sections: [section('SOA2042', { id: 'gv-son', fullName: 'Lê Hồng Sơn' })] },
        meId: 'admin',
      }),
    );
    expect(html).toContain('Học kỳ FA26');
    expect(html).toContain('SA21301-SOA2042');
    expect(html).toContain('Môn SOA2042');
    expect(html).toContain('Lê Hồng Sơn');
    expect(html).not.toContain('bạn dạy');
  });

  it('đánh dấu lớp người xem đang dạy', () => {
    const html = renderToStaticMarkup(
      h(TermSectionList, {
        group: { term: 'FA26', sections: [section('SOA2042', { id: 'gv-son', fullName: 'Lê Hồng Sơn' })] },
        meId: 'gv-son',
      }),
    );
    expect(html).toContain('Bạn dạy');
  });

  it('lớp chưa phân công giảng viên', () => {
    const html = renderToStaticMarkup(
      h(TermSectionList, { group: { term: 'FA26', sections: [section('VIE108', null)] }, meId: 'admin' }),
    );
    expect(html).toContain('Chưa phân công GV');
  });
});
