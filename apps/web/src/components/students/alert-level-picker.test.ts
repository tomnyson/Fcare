import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AlertLevelPicker } from './alert-level-picker';

function render(value: number, suggestedLevel: number) {
  return renderToStaticMarkup(
    h(AlertLevelPicker, { value, suggestedLevel, onChange: () => undefined }),
  );
}

function radioTag(html: string, level: number): string {
  const at = html.indexOf(`value="${level}"`);
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at));
}

describe('AlertLevelPicker — giảng viên chọn mức cảnh báo', () => {
  it('cho chọn đủ 4 mức, nhóm radio có nhãn', () => {
    const html = render(2, 2);
    expect(html).toContain('role="radiogroup"');
    for (const level of [1, 2, 3, 4]) {
      expect(radioTag(html, level)).toContain('type="radio"');
    }
    expect(html).toContain('Thấp');
    expect(html).toContain('Khẩn cấp');
  });

  it('mức đang chọn được đánh dấu checked, mức đề xuất có nhãn "Đề xuất"', () => {
    const html = render(4, 2);
    expect(radioTag(html, 4)).toMatch(/\schecked=""/);
    expect(radioTag(html, 2)).not.toMatch(/\schecked=""/);
    expect(html).toMatch(/Mức 2[\s\S]*?Đề xuất/);
  });

  it('chọn khác đề xuất thì nói rõ và nhắc hệ thống vẫn có thể tự nâng theo DRS', () => {
    const html = render(1, 3);
    expect(html).toContain('Bạn chọn mức 1, hệ thống đề xuất mức 3');
    expect(html).toContain('tự nâng');
  });

  it('chọn đúng đề xuất thì không hiện câu chênh lệch', () => {
    expect(render(3, 3)).not.toContain('Bạn chọn mức');
  });

  it('mỗi ô luôn mang nền màu của cấp cảnh báo, kể cả khi chưa chọn', () => {
    const html = render(1, 1);
    const optionHtml = (level: number) => {
      const at = html.indexOf(`value="${level}"`);
      return html.slice(at, html.indexOf('</label>', at));
    };
    expect(optionHtml(1)).toContain('bg-fpt-blue/10');
    expect(optionHtml(2)).toContain('bg-warning/10');
    expect(optionHtml(3)).toContain('bg-fpt-orange-50');
    expect(optionHtml(4)).toContain('bg-danger/10');
  });

  it('mức 4 nhắc lý do phải đủ 40 ký tự', () => {
    expect(render(4, 2)).toContain('40 ký tự');
  });
});
