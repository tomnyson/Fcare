import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClassSection } from '../../lib/types';
import { EvaluationForm } from './evaluation-form';

const section: ClassSection = {
  id: 'cs1',
  code: 'AI21301-ITA201',
  term: 'FA26',
  subjectId: 'sub',
  lecturerId: 'me',
};

function render() {
  return renderToStaticMarkup(
    h(QueryClientProvider, {
      client: new QueryClient(),
      children: h(EvaluationForm, {
        studentId: 'st1',
        term: 'FA26',
        sections: [section],
        ownEvaluations: [],
        systemAbsences: { cs1: 3 },
        initialSectionId: 'cs1',
        summary: h('p', { 'data-test-summary': true }, 'MSSV'),
        onSaved: () => undefined,
        onCancel: () => undefined,
      }),
    }),
  );
}

describe('EvaluationForm — khối ghim đầu form', () => {
  it('thông tin SV, lớp học phần và số buổi vắng nằm chung khối dính ở đầu', () => {
    const html = render();
    const pinnedAt = html.indexOf('data-evaluation-pinned="true"');
    expect(pinnedAt).toBeGreaterThan(-1);
    const pinnedTag = html.slice(html.lastIndexOf('<', pinnedAt), html.indexOf('>', pinnedAt));
    expect(pinnedTag).toContain('sm:sticky');

    const academicAt = html.indexOf('Khả năng học tập');
    for (const marker of ['data-test-summary', 'id="classSectionId"', 'id="absentSessions"']) {
      const at = html.indexOf(marker);
      expect(at).toBeGreaterThan(pinnedAt);
      expect(at).toBeLessThan(academicAt);
    }
  });

  it('tự điền số buổi vắng từ dữ liệu điểm danh của lớp chọn sẵn', () => {
    expect(render()).toMatch(/id="absentSessions"[^>]*value="3"|value="3"[^>]*id="absentSessions"/);
  });
});
