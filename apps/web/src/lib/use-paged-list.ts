'use client';

import { useEffect, useState } from 'react';
import { clampPage, pageCount, pageSlice } from './pagination';

export interface UsePagedListOptions {
  /** Số dòng mỗi trang, mặc định là 10 theo thiết kế. */
  pageSize?: number;
  /** Đổi giá trị này (bộ lọc, từ khoá, học kỳ…) → quay về trang 1. */
  resetKey?: unknown;
}

/**
 * Cắt trang phía web cho danh sách đã tải hết (danh mục < vài nghìn dòng):
 * API vẫn trả nguyên mảng vì các ô chọn (select) cần đủ option, chỉ bảng
 * hiển thị mới lật trang. Trang tự ép về hợp lệ khi mảng ngắn lại.
 * Mặc định 10 mục 1 trang, có thể đổi linh hoạt (10, 20, 50, 100).
 */
export function usePagedList<T>(
  items: readonly T[],
  options?: UsePagedListOptions | number,
) {
  const targetPageSize =
    typeof options === 'number'
      ? options
      : (options?.pageSize ?? 10);
  const resetKey = typeof options === 'object' ? options?.resetKey : undefined;

  const [pageSize, setPageSizeState] = useState(targetPageSize);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    setPageSizeState(targetPageSize);
  }, [targetPageSize]);

  const setPageSize = (newSize: number) => {
    setPageSizeState(newSize);
    setPage(1);
  };

  const totalPages = pageCount(items.length, pageSize);
  const safePage = clampPage(page, totalPages);

  return {
    page: safePage,
    pageSize,
    limit: pageSize,
    totalPages,
    total: items.length,
    pageItems: pageSlice(items, safePage, pageSize),
    setPage,
    setPageSize,
  };
}
