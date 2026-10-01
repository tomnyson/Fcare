import { describe, expect, it } from 'vitest';
import { blockOptionLabel, formatSlot, formatWeekdays, viewedTermBlock } from './classes-helpers';

describe('formatWeekdays', () => {
  it('định dạng mã thứ số thành chuỗi hiển thị có dấu', () => {
    expect(formatWeekdays('246')).toBe('Thứ 2, Thứ 4, Thứ 6');
    expect(formatWeekdays('357')).toBe('Thứ 3, Thứ 5, Thứ 7');
    expect(formatWeekdays('23456')).toBe('Thứ 2, Thứ 3, Thứ 4, Thứ 5, Thứ 6');
  });

  it('xử lý chuỗi rỗng hoặc undefined', () => {
    expect(formatWeekdays(null)).toBe('Chưa xếp thứ');
    expect(formatWeekdays(undefined)).toBe('Chưa xếp thứ');
    expect(formatWeekdays('')).toBe('Chưa xếp thứ');
  });

  it('giữ nguyên chuỗi nếu không phải chỉ gồm chữ số 2-7', () => {
    expect(formatWeekdays('T2-T4-T6')).toBe('T2-T4-T6');
  });
});

describe('formatSlot', () => {
  it('định dạng ca học kèm ca sáng/chiều', () => {
    expect(formatSlot('S1', 'AM')).toBe('Ca S1 (AM)');
    expect(formatSlot('S4', 'PM')).toBe('Ca S4 (PM)');
  });

  it('chỉ có ca học mà không có trainingTime', () => {
    expect(formatSlot('S2', null)).toBe('Ca S2');
  });

  it('chỉ có trainingTime mà không có slot', () => {
    expect(formatSlot(null, 'EV')).toBe('(EV)');
  });

  it('trả về Chưa xếp ca khi cả hai đều null/undefined', () => {
    expect(formatSlot(null, null)).toBe('Chưa xếp ca');
    expect(formatSlot(undefined, undefined)).toBe('Chưa xếp ca');
  });
});

describe('blockOptionLabel', () => {
  it('đánh dấu block hiện tại trong dropdown', () => {
    expect(blockOptionLabel(1, 1)).toBe('Block 1 — Block hiện tại');
    expect(blockOptionLabel(2, 1)).toBe('Block 2');
    expect(blockOptionLabel(2, null)).toBe('Block 2');
  });
});

describe('viewedTermBlock', () => {
  const term = {
    code: 'FA26',
    startDate: '2026-09-01T00:00:00Z',
    endDate: '2026-12-31T00:00:00Z',
    currentBlockOverride: null,
  };
  it('đang xem kỳ hiện tại → tính block theo ngày', () => {
    expect(viewedTermBlock(term, 'FA26', new Date('2026-09-10T00:00:00Z'))).toBe(1);
    expect(viewedTermBlock(term, 'FA26', new Date('2026-12-10T00:00:00Z'))).toBe(2);
  });
  it('ADMIN ghi đè → dùng block ghi đè', () => {
    expect(
      viewedTermBlock(
        { ...term, currentBlockOverride: 2 },
        'FA26',
        new Date('2026-09-10T00:00:00Z'),
      ),
    ).toBe(2);
  });
  it('xem kỳ khác hoặc chưa có kỳ → null', () => {
    expect(viewedTermBlock(term, 'SU26')).toBeNull();
    expect(viewedTermBlock(undefined, 'FA26')).toBeNull();
  });
});
