import { describe, expect, it } from 'vitest';
import { resolveViewMode } from './classes-view-mode';

describe('resolveViewMode', () => {
  it('ưu tiên giá trị hợp lệ từ query param', () => {
    expect(resolveViewMode('list', 'card')).toBe('list');
    expect(resolveViewMode('card', 'list')).toBe('card');
  });

  it('dùng giá trị từ storage nếu query param rỗng hoặc không hợp lệ', () => {
    expect(resolveViewMode(null, 'list')).toBe('list');
    expect(resolveViewMode('', 'list')).toBe('list');
    expect(resolveViewMode('invalid', 'list')).toBe('list');
    expect(resolveViewMode(null, 'card')).toBe('card');
  });

  it('mặc định là card nếu cả query param và storage đều không có', () => {
    expect(resolveViewMode(null, null)).toBe('card');
    expect(resolveViewMode(undefined, undefined)).toBe('card');
    expect(resolveViewMode('invalid', 'invalid')).toBe('card');
  });
});
