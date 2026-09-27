import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AuthUser, Enrollment } from '../../lib/types';
import { EvaluationsTab } from './evaluations-tab';

const user: AuthUser = {
  id: 'gv1',
  staffCode: 'GV1',
  fullName: 'Giảng viên',
  roles: ['LECTURER'],
  departmentId: 'd1',
  consented: true,
  mustChangePassword: false,
};

function render(): string {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  client.setQueryData(['evaluations', 's1'], []);
  client.setQueryData<Enrollment[]>(
    ['enrollments', 's1'],
    [
      {
        id: 'e1',
        studentId: 's1',
        classSectionId: 'cs1',
        classSection: { id: 'cs1', code: 'SE1', term: 'SU26', subjectId: 'sub', lecturerId: 'gv1' },
      } as unknown as Enrollment,
    ],
  );
  return renderToStaticMarkup(
    h(
      QueryClientProvider,
      { client },
      h(EvaluationsTab, { studentId: 's1', user, initialTerm: 'SU26' }),
    ),
  );
}

describe('EvaluationsTab', () => {
  it('chỉ còn danh sách nhận xét — ẩn thẻ "Đánh giá rủi ro — học kỳ …"', () => {
    const html = render();
    expect(html).toContain('Nhận xét của giảng viên');
    expect(html).not.toContain('Đánh giá rủi ro');
    expect(html).not.toContain('id="analysisTerm"');
    expect(html).not.toContain('AI đề xuất');
  });
});
