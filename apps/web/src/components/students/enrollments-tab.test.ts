import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Enrollment } from '../../lib/types';
import { EnrollmentsTab } from './enrollments-tab';

function enrollment(id: string, lecturerId: string): Enrollment {
  return {
    id,
    studentId: 'st1',
    classSectionId: `cs-${id}`,
    attendanceRate: 80,
    absentSessions: 2,
    midtermScore: null,
    finalScore: null,
    totalScore: null,
    isExamBanned: false,
    result: 'IN_PROGRESS',
    classSection: {
      id: `cs-${id}`,
      code: `SE${id}`,
      term: 'FA26',
      subjectId: 'sub',
      lecturerId,
    },
  } as Enrollment;
}

function render(canEvaluate?: (e: Enrollment) => boolean) {
  const client = new QueryClient();
  client.setQueryData(['enrollments', 'st1'], [enrollment('1', 'me'), enrollment('2', 'other')]);
  return renderToStaticMarkup(
    h(QueryClientProvider, {
      client,
      children: h(EnrollmentsTab, {
        studentId: 'st1',
        onEvaluate: () => undefined,
        canEvaluate,
      }),
    }),
  );
}

describe('EnrollmentsTab — nút Nhận xét', () => {
  it('là nút mở form tại chỗ, không còn là liên kết chỉ đổi URL', () => {
    const html = render(() => true);
    expect(html).not.toContain('tab=evaluations');
    expect(html.match(/<button[^>]*data-evaluate-section="cs-1"/)).toBeTruthy();
    expect(html.match(/<button[^>]*data-evaluate-section="cs-2"/)).toBeTruthy();
  });

  it('dòng người dùng không được nhận xét hiện gạch ngang thay vì nút', () => {
    const html = render((e) => e.classSection?.lecturerId === 'me');
    expect(html).toContain('data-evaluate-section="cs-1"');
    expect(html).not.toContain('data-evaluate-section="cs-2"');
  });
});
