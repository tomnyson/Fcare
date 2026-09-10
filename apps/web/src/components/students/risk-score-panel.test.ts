import { describe, expect, it } from 'vitest';
import { levelBadge } from './risk-score-panel';

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
});
