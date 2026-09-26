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

describe('EvaluationForm — nút phát cảnh báo khi lưu', () => {
  it('có công tắc "Phát cảnh báo" kèm mức hệ thống đề xuất, mặc định tắt', () => {
    const html = render();
    const at = html.indexOf('data-raise-alert-toggle');
    expect(at).toBeGreaterThan(-1);
    const tag = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at));
    expect(tag).toContain('type="checkbox"');
    expect(tag).not.toMatch(/\schecked=""/);
    expect(html).toContain('Phát cảnh báo');
    // 3 buổi vắng → hệ thống đề xuất một mức cụ thể, hiển thị ngay cạnh công tắc
    expect(html).toMatch(/Phát cảnh báo khi lưu[\s\S]*?Đề xuất mức [1-4]/);
  });

  it('nổi bật: khối nền cam có viền nhấn, biểu tượng chuông và công tắc dạng switch', () => {
    const html = render();
    const at = html.indexOf('data-raise-alert-callout');
    expect(at).toBeGreaterThan(-1);
    const callout = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at));
    expect(callout).toContain('border-l-4');
    expect(callout).toContain('bg-fpt-orange-50');
    expect(html).toContain('data-raise-alert-bell');

    const toggleAt = html.indexOf('data-raise-alert-toggle');
    const toggle = html.slice(html.lastIndexOf('<', toggleAt), html.indexOf('>', toggleAt));
    expect(toggle).toContain('role="switch"');
    expect(toggle).toContain('aria-checked="false"');
    // Trạng thái tắt nói rõ hậu quả để người dùng không bỏ qua
    expect(html).toContain('Đang tắt');
  });

  it('nút lưu nằm sau công tắc phát cảnh báo', () => {
    const html = render();
    expect(html.indexOf('data-raise-alert-toggle')).toBeLessThan(html.indexOf('Lưu nhận xét'));
  });
});
