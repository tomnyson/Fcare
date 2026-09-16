import { attendanceLevelFor } from '@fcare/shared-types';
import { decideAction } from './attendance-review.decision';

describe('attendanceLevelFor — ngưỡng vắng → cấp cảnh báo', () => {
  it.each([
    [null, null],
    [undefined, null],
    [0, null],
    [1, null],
    [2, 2],
    [3, 3],
    [7, 3],
    [Number.NaN, null],
  ])('vắng %p buổi → cấp %p', (absent, expected) => {
    expect(attendanceLevelFor(absent as number | null)).toBe(expected);
  });
});

describe('decideAction — quyết định trên cảnh báo đang mở', () => {
  it('chưa đủ ngưỡng và chưa có cảnh báo → bỏ qua', () => {
    expect(decideAction(1, null)).toEqual({ type: 'skip' });
  });

  it('đủ ngưỡng, chưa có cảnh báo → tạo mới đúng cấp', () => {
    expect(decideAction(2, null)).toEqual({ type: 'create', level: 2 });
    expect(decideAction(3, null)).toEqual({ type: 'create', level: 3 });
  });

  it('import lại cùng số buổi → không đổi, không thông báo lại', () => {
    expect(decideAction(2, { level: 2, absentSessions: 2 })).toEqual({
      type: 'unchanged',
    });
  });

  it('vắng thêm nhưng vẫn cùng cấp → chỉ cập nhật số buổi, không thông báo', () => {
    expect(decideAction(4, { level: 3, absentSessions: 3 })).toEqual({
      type: 'refresh',
      level: 3,
    });
  });

  it('vượt lên cấp cao hơn → nâng cấp (thông báo lại)', () => {
    expect(decideAction(3, { level: 2, absentSessions: 2 })).toEqual({
      type: 'upgrade',
      level: 3,
    });
  });

  it('số buổi giảm (sửa dữ liệu) → không hạ cấp tự động', () => {
    expect(decideAction(1, { level: 3, absentSessions: 3 })).toEqual({
      type: 'unchanged',
    });
    expect(decideAction(2, { level: 3, absentSessions: 3 })).toEqual({
      type: 'unchanged',
    });
  });

  it('cảnh báo thủ công cấp 4 đã có vẫn không bị hạ', () => {
    expect(decideAction(3, { level: 4, absentSessions: null })).toEqual({
      type: 'refresh',
      level: 4,
    });
  });
});
