import { describe, expect, it } from 'vitest';
import { clampPage, pageCount, pageRangeLabel, pageSlice, parsePageParam } from './pagination';

describe('pageCount', () => {
  it('làm tròn lên và tối thiểu 1 trang khi rỗng', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
    expect(pageCount(2851, 50)).toBe(58);
  });

  it('limit không hợp lệ → 1 trang thay vì Infinity', () => {
    expect(pageCount(100, 0)).toBe(1);
  });
});

describe('clampPage', () => {
  it('ép về khoảng [1, totalPages]', () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(3, 5)).toBe(3);
    expect(clampPage(Number.NaN, 5)).toBe(1);
    expect(clampPage(2.7, 5)).toBe(2);
  });
});

describe('parsePageParam', () => {
  it('đọc số nguyên dương, còn lại về 1', () => {
    expect(parsePageParam('3')).toBe(3);
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam('abc')).toBe(1);
    expect(parsePageParam('0')).toBe(1);
    expect(parsePageParam('-2')).toBe(1);
    expect(parsePageParam('1.5')).toBe(1);
  });
});

describe('pageSlice', () => {
  const items = Array.from({ length: 45 }, (_, i) => i + 1);

  it('cắt đúng trang và trang cuối ngắn hơn', () => {
    expect(pageSlice(items, 1, 20)).toEqual(items.slice(0, 20));
    expect(pageSlice(items, 3, 20)).toEqual([41, 42, 43, 44, 45]);
  });

  it('trang vượt quá tổng → về trang cuối, không trả mảng rỗng', () => {
    expect(pageSlice(items, 9, 20)).toEqual([41, 42, 43, 44, 45]);
  });

  it('mảng rỗng → trang rỗng', () => {
    expect(pageSlice([], 1, 20)).toEqual([]);
  });
});

describe('pageRangeLabel', () => {
  it('hiện khoảng dòng đang xem', () => {
    expect(pageRangeLabel(1, 50, 2851)).toBe('1–50 / 2851');
    expect(pageRangeLabel(58, 50, 2851)).toBe('2851–2851 / 2851');
    expect(pageRangeLabel(1, 20, 7)).toBe('1–7 / 7');
    expect(pageRangeLabel(1, 20, 0)).toBe('0 / 0');
  });
});
