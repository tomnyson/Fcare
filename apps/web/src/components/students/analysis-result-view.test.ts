import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StudentAnalysisOutput } from '../../lib/types';
import { AnalysisResultView } from './analysis-result-view';

const output: StudentAnalysisOutput = {
  riskLevel: 'HIGH',
  summary: 'Sinh viên vắng nhiều và chưa nộp bài.',
  strengths: ['Tham gia nhóm tốt'],
  trends: [],
  riskFactors: [{ finding: 'Vắng 3 buổi', evidence: 'Điểm danh ITA201' }],
  recommendations: ['Gặp riêng sinh viên trong tuần'],
  notificationSummary: 'Tóm tắt gửi đi',
  dataLimitations: ['Chưa có điểm giữa kỳ'],
  suggestedLevel: 3,
  forcedEscalation: null,
};

describe('AnalysisResultView — chỉ hiển thị kết quả AI đề xuất', () => {
  it('hiện tóm tắt, yếu tố rủi ro kèm bằng chứng, khuyến nghị và giới hạn dữ liệu', () => {
    const html = renderToStaticMarkup(h(AnalysisResultView, { output }));
    for (const text of [
      'Sinh viên vắng nhiều và chưa nộp bài.',
      'Vắng 3 buổi',
      'Điểm danh ITA201',
      'Gặp riêng sinh viên trong tuần',
      'Chưa có điểm giữa kỳ',
      'Tham gia nhóm tốt',
    ]) {
      expect(html).toContain(text);
    }
  });

  it('chỉ đọc — không có ô nhập hay nút lưu bản nháp', () => {
    const html = renderToStaticMarkup(h(AnalysisResultView, { output }));
    expect(html).not.toMatch(/<(textarea|input|button)\b/);
    expect(html).not.toContain('Lưu bản nháp');
  });

  it('mục rỗng thì ẩn tiêu đề mục', () => {
    const html = renderToStaticMarkup(h(AnalysisResultView, { output }));
    expect(html).not.toContain('Xu hướng');
  });
});
