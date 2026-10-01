import { describe, expect, it } from 'vitest';
import { canGoBack } from './back-button';

describe('canGoBack', () => {
  it('tab mở thẳng (chỉ 1 mục lịch sử) → không lùi được, phải dùng đích dự phòng', () => {
    expect(canGoBack(1)).toBe(false);
  });

  it('đã điều hướng trong tab → lùi được', () => {
    expect(canGoBack(3)).toBe(true);
  });
});
