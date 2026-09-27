import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  IDLE_PROGRESS,
  failProgress,
  finishProgress,
  progressView,
  startProgress,
  withUploadRatio,
} from '../../lib/import-progress';
import { ImportProgress } from './import-progress';

const T0 = 1_000;

function render(state: Parameters<typeof progressView>[0]): string {
  return renderToStaticMarkup(h(ImportProgress, { view: progressView(state) }));
}

describe('ImportProgress', () => {
  it('idle → không render gì', () => {
    expect(render(IDLE_PROGRESS)).toBe('');
  });

  it('thanh progressbar có aria đầy đủ và số %', () => {
    const html = render(withUploadRatio(startProgress('upload', 'roster', T0), 1, T0));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="30"');
    expect(html).toContain('aria-valuetext="Máy chủ đang đọc và kiểm tra file — 30%"');
    expect(html).toContain('30%');
  });

  it('lấp thanh bằng transform scaleX, không dùng width', () => {
    const html = render(withUploadRatio(startProgress('upload', 'roster', T0), 0.5, T0));
    expect(html).toContain('transform:scaleX(0.15)');
    expect(html).not.toMatch(/style="[^"]*width/);
    expect(html).toContain('motion-reduce:transition-none');
  });

  it('liệt kê bước, bước đã xong có dấu ✓', () => {
    const html = render(withUploadRatio(startProgress('upload', 'roster', T0), 1, T0));
    expect(html).toContain('✓ Gửi file');
    expect(html).toContain('Lọc dữ liệu cá nhân');
  });

  it('tông theo trạng thái: chạy = fpt-blue, xong = success, lỗi = danger', () => {
    expect(render(startProgress('commit', 'roster', T0))).toContain('bg-fpt-blue');
    expect(render(finishProgress(startProgress('commit', 'roster', T0)))).toContain('bg-success');
    expect(render(failProgress(startProgress('commit', 'roster', T0)))).toContain('bg-danger');
  });
});
