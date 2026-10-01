import { describe, expect, it } from 'vitest';
import {
  MAX_REVEAL_STAGGER,
  revealCutoff,
  revealIndexStyle,
  shouldDeferReveal,
} from './reveal';

describe('shouldDeferReveal — chỉ ẩn trước những gì chưa cuộn tới', () => {
  it('phần tử đã nằm trong màn hình lúc tải → để nguyên, không nháy ẩn-hiện', () => {
    expect(shouldDeferReveal(120, 800)).toBe(false);
  });

  it('phần tử ở dưới nếp gấp → ẩn chờ cuộn tới', () => {
    expect(shouldDeferReveal(1200, 800)).toBe(true);
  });

  it('mép trên sát đáy màn hình (trong 10% cuối) vẫn coi là chưa thấy', () => {
    expect(shouldDeferReveal(760, 800)).toBe(true);
  });

  it('đã cuộn qua (mép trên âm) → không ẩn', () => {
    expect(shouldDeferReveal(-400, 800)).toBe(false);
  });
});

describe('revealIndexStyle — so le có giới hạn', () => {
  it('đưa thứ tự vào biến CSS --reveal-index', () => {
    expect(revealIndexStyle(2)).toEqual({ '--reveal-index': 2 });
  });

  it('danh sách dài không bắt người xem chờ: chặn ở MAX_REVEAL_STAGGER', () => {
    expect(revealIndexStyle(40)).toEqual({ '--reveal-index': MAX_REVEAL_STAGGER });
  });

  it('chỉ số âm/không hợp lệ → 0', () => {
    expect(revealIndexStyle(-1)).toEqual({ '--reveal-index': 0 });
    expect(revealIndexStyle(Number.NaN)).toEqual({ '--reveal-index': 0 });
  });
});

describe('revealCutoff — không để phần phía trên kẹt ẩn khi nhảy cóc', () => {
  it('phần tử thứ i hiện → mọi phần tử đứng trước cũng hiện', () => {
    expect(revealCutoff(-1, [3])).toBe(3);
  });

  it('giữ mốc cao nhất đã đạt, không lùi lại', () => {
    expect(revealCutoff(5, [2])).toBe(5);
    expect(revealCutoff(1, [0, 4, 2])).toBe(4);
  });

  it('không có phần tử nào vừa hiện → giữ nguyên', () => {
    expect(revealCutoff(-1, [])).toBe(-1);
  });
});
