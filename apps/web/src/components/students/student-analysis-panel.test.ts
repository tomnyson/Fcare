import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StudentAnalysisPanel } from './student-analysis-panel';

function render(extra: Record<string, unknown> = {}): string {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  return renderToStaticMarkup(
    h(
      QueryClientProvider,
      { client },
      h(StudentAnalysisPanel, {
        studentId: 's1',
        terms: ['FA26'],
        selectedTerm: 'FA26',
        onSelectTerm: () => undefined,
        postSaveTerm: '',
        onDismissPostSave: () => undefined,
        ...extra,
      }),
    ),
  );
}

describe('StudentAnalysisPanel — thẻ đánh giá rủi ro gộp', () => {
  it('tiêu đề chung nêu học kỳ đang chọn', () => {
    expect(render()).toContain('Đánh giá rủi ro — học kỳ FA26');
  });

  it('badge header nằm cạnh bộ chọn học kỳ', () => {
    const html = render({ headerBadge: h('span', { id: 'badge-slot' }) });
    const badge = html.indexOf('badge-slot');
    expect(badge).toBeGreaterThan(-1);
    expect(badge).toBeLessThan(html.indexOf('id="analysisTerm"'));
  });

  it('không còn nút tạo / cập nhật AI — AI chỉ tự chạy sau khi lưu nhận xét', () => {
    const html = render();
    expect(html).not.toContain('Tạo / cập nhật AI');
    expect(html).toContain('Cấp theo DRS do hệ thống tính; AI chỉ đề xuất');
  });

  it('phần DRS đứng trước phần "AI đề xuất"', () => {
    const html = render({ riskSlot: h('div', { id: 'risk-slot' }) });
    const risk = html.indexOf('risk-slot');
    expect(risk).toBeGreaterThan(-1);
    expect(risk).toBeLessThan(html.indexOf('AI đề xuất'));
  });
});
