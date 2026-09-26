import { describe, expect, it } from 'vitest';
import { levelBadge } from '../components/students/risk-score-panel';
import { ALERT_LEVEL_TONES } from './labels';

describe('Màu mức cảnh báo (docs/plan-lert.md mục 5)', () => {
  it('1 xanh dương · 2 vàng · 3 cam · 4 đỏ — mỗi mức một màu riêng', () => {
    expect(ALERT_LEVEL_TONES).toEqual({ 1: 'info', 2: 'warning', 3: 'orange', 4: 'danger' });
  });

  it('bảng điểm rủi ro dùng cùng thang màu với badge cảnh báo', () => {
    expect(levelBadge(1).className).toContain('fpt-blue');
    expect(levelBadge(2).className).toContain('warning');
    expect(levelBadge(3).className).toContain('fpt-orange');
    expect(levelBadge(4).className).toContain('danger');
  });
});
