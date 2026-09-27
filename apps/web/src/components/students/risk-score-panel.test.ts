import type { RiskScoreBreakdown as RiskScoreData } from '@fcare/shared-types';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DrsLevelBadge,
  RiskScoreBreakdown,
  levelBadge,
  shouldExpandBreakdown,
} from './risk-score-panel';

describe('levelBadge', () => {
  it('gắn nhãn tiếng Việt đúng cho từng cấp', () => {
    expect(levelBadge(1).label).toBe('Cấp 1 — Thấp');
    expect(levelBadge(2).label).toBe('Cấp 2 — Trung bình');
    expect(levelBadge(3).label).toBe('Cấp 3 — Cao');
    expect(levelBadge(4).label).toBe('Cấp 4 — Khẩn cấp');
  });

  it('dùng token màu, không hardcode mã màu', () => {
    expect(levelBadge(4).className).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it('thêm hiệu ứng nhấp nháy animate-pulse cho các mức độ nguy hiểm (Cấp 3 và 4)', () => {
    expect(levelBadge(1).className).not.toContain('animate-pulse');
    expect(levelBadge(2).className).not.toContain('animate-pulse');
    expect(levelBadge(3).className).toContain('animate-pulse');
    expect(levelBadge(4).className).toContain('animate-pulse');
  });
});

const BASE: RiskScoreData = {
  components: { RL: 2, RA: 2, RC: 3, RH: 1, RP: 1 },
  drs: 9,
  drsLevel: 3,
  dataForcedLevel: 1,
  evaluationCount: 3,
  medianAcademic: 5,
  medianAttitude: 6,
  triggeredCriteria: [],
  reasons: [],
};

function renderBreakdown(props: Parameters<typeof RiskScoreBreakdown>[0]): string {
  return renderToStaticMarkup(h(RiskScoreBreakdown, props));
}

describe('shouldExpandBreakdown', () => {
  it('thu gọn khi không có ép cấp do dữ liệu', () => {
    expect(shouldExpandBreakdown(BASE)).toBe(false);
  });

  it('mở sẵn khi dữ liệu ép cấp cao hơn cấp DRS', () => {
    expect(shouldExpandBreakdown({ ...BASE, drsLevel: 2, dataForcedLevel: 3 })).toBe(true);
  });
});

describe('RiskScoreBreakdown', () => {
  it('hiện tổng DRS luôn thấy được ngoài phần chi tiết thu gọn', () => {
    const html = renderBreakdown({ data: BASE, isLoading: false });
    const summaryEnd = html.indexOf('</summary>');
    expect(summaryEnd).toBeGreaterThan(-1);
    expect(html.slice(0, summaryEnd)).toContain('data-testid="drs-total"');
    expect(html).toContain('trên 3 nhận xét');
  });

  it('đủ 5 thành phần trong bảng chi tiết, mặc định thu gọn', () => {
    const html = renderBreakdown({ data: BASE, isLoading: false });
    for (const symbol of ['R_L', 'R_A', 'R_C', 'R_H', 'R_P']) {
      expect(html).toContain(symbol);
    }
    expect(html).toMatch(/<details(?![^>]*open)/);
  });

  it('mở sẵn chi tiết và nêu lý do khi dữ liệu ép cấp', () => {
    const html = renderBreakdown({
      data: { ...BASE, drsLevel: 2, dataForcedLevel: 3 },
      isLoading: false,
    });
    expect(html).toMatch(/<details[^>]*open/);
    expect(html).toContain('Dữ liệu ép lên');
  });

  it('báo chưa có nhận xét khi evaluationCount = 0', () => {
    const html = renderBreakdown({ data: { ...BASE, evaluationCount: 0 }, isLoading: false });
    expect(html).toContain('Chưa có giảng viên nào nhận xét');
    expect(html).not.toContain('drs-total');
  });

  it('hiện trạng thái đang tính khi loading', () => {
    expect(renderBreakdown({ data: undefined, isLoading: true })).toContain('Đang tính điểm rủi ro');
  });
});

describe('DrsLevelBadge', () => {
  it('ghi rõ nguồn "Theo DRS" cạnh badge cấp', () => {
    const html = renderToStaticMarkup(h(DrsLevelBadge, { data: BASE }));
    expect(html).toContain('Theo DRS');
    expect(html).toContain('data-testid="drs-level"');
    expect(html).toContain('Cấp 3 — Cao');
  });

  it('không hiện gì khi chưa có nhận xét', () => {
    expect(renderToStaticMarkup(h(DrsLevelBadge, { data: { ...BASE, evaluationCount: 0 } }))).toBe('');
    expect(renderToStaticMarkup(h(DrsLevelBadge, { data: undefined }))).toBe('');
  });
});
