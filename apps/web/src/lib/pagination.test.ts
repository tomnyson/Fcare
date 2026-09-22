import { describe, expect, it } from 'vitest';
import {
  clampPage,
  pageCount,
  pageDisplayLabel,
  pageRangeLabel,
  pageSlice,
  paginationWindow,
  parsePageParam,
} from './pagination';

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

describe('pageDisplayLabel', () => {
  it('định dạng đúng mẫu: Đang hiển thị X đến Y của Z mục', () => {
    expect(pageDisplayLabel(1, 10, 249)).toBe('Đang hiển thị 1 đến 10 của 249 mục');
    expect(pageDisplayLabel(2, 10, 249)).toBe('Đang hiển thị 11 đến 20 của 249 mục');
    expect(pageDisplayLabel(25, 10, 249)).toBe('Đang hiển thị 241 đến 249 của 249 mục');
  });

  it('xử lý danh sách rỗng', () => {
    expect(pageDisplayLabel(1, 10, 0)).toBe('Không có mục nào');
  });
});

describe('paginationWindow', () => {
  it('tổng số trang <= 7 → hiện đầy đủ các trang', () => {
    expect(paginationWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(paginationWindow(1, 1)).toEqual([1]);
  });

  it('đang ở đầu danh sách (page <= 4, total = 25) → hiện 1 2 3 4 5 ... 25 đúng ảnh mẫu', () => {
    expect(paginationWindow(1, 25)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 25]);
    expect(paginationWindow(4, 25)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 25]);
  });

  it('đang ở cuối danh sách (page >= total - 3) → hiện 1 ... 21 22 23 24 25', () => {
    expect(paginationWindow(22, 25)).toEqual([1, 'ellipsis', 21, 22, 23, 24, 25]);
    expect(paginationWindow(23, 25)).toEqual([1, 'ellipsis', 21, 22, 23, 24, 25]);
    expect(paginationWindow(25, 25)).toEqual([1, 'ellipsis', 21, 22, 23, 24, 25]);
  });

  it('đang ở giữa danh sách → hiện 1 ... 9 10 11 ... 25', () => {
    expect(paginationWindow(10, 25)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 25]);
  });
});
