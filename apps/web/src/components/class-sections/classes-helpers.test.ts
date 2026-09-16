import { describe, expect, it } from 'vitest';
import { formatSlot, formatWeekdays } from './classes-helpers';

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
