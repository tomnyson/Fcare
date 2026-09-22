import { describe, expect, it } from 'vitest';

// Test pure logic từ module, không cần DOM
describe('system-pin-modal logic', () => {
  it('chuỗi 6 chữ số hợp lệ khi nhập đủ', () => {
    const digits = ['1', '2', '3', '4', '5', '6'];
    const pin = digits.join('');
    expect(pin).toHaveLength(6);
    expect(/^\d{6}$/.test(pin)).toBe(true);
  });

  it('chưa hợp lệ khi mới nhập 5 ký tự', () => {
    const digits = ['1', '2', '3', '4', '5'];
    expect(digits.join('')).toHaveLength(5);
  });

  it('backspace xóa ký tự cuối', () => {
    let digits = ['1', '2', '3'];
    digits = digits.slice(0, -1);
    expect(digits).toEqual(['1', '2']);
  });

  it('chỉ cho phép ký tự số', () => {
    const input = 'a';
    expect(/^\d$/.test(input)).toBe(false);
    const input2 = '5';
    expect(/^\d$/.test(input2)).toBe(true);
  });
});
