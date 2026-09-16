'use client';

import { useEffect, useState } from 'react';
import { clampPage, pageCount, pageSlice } from './pagination';

interface UsePagedListOptions {
  pageSize: number;
  /** Đổi giá trị này (bộ lọc, từ khoá, học kỳ…) → quay về trang 1. */
  resetKey?: unknown;
}

/**
 * Cắt trang phía web cho danh sách đã tải hết (danh mục < vài nghìn dòng):
 * API vẫn trả nguyên mảng vì các ô chọn (select) cần đủ option, chỉ bảng
 * hiển thị mới lật trang. Trang tự ép về hợp lệ khi mảng ngắn lại.
 */
export function usePagedList<T>(items: readonly T[], { pageSize, resetKey }: UsePagedListOptions) {
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [resetKey]);
  const totalPages = pageCount(items.length, pageSize);
  const safePage = clampPage(page, totalPages);
  return {
    page: safePage,
    totalPages,
    total: items.length,
    pageItems: pageSlice(items, safePage, pageSize),
    setPage,
  };
}
