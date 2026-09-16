'use client';

import { useState } from 'react';
import { Pagination } from '../ui/pagination';
import { Input, Label } from '../ui/form';
import { usePagedList } from '../../lib/use-paged-list';

/** Số dòng mỗi trang cho các bảng danh mục (môn học ~450, lớp học phần ~400 dòng). */
export const CATALOG_PAGE_SIZE = 20;

/**
 * Tìm kiếm + cắt trang phía web cho bảng danh mục: API vẫn trả nguyên mảng
 * (các ô chọn trong form cần đủ option) nên chỉ bảng hiển thị mới lật trang.
 * `resetKey` (tab đang mở) đổi → về trang 1.
 */
export function useCatalogPaging<T>(
  items: readonly T[],
  matches: (item: T, needle: string) => boolean,
  resetKey: unknown,
) {
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const filtered = needle ? items.filter((item) => matches(item, needle)) : items;
  const paged = usePagedList(filtered, {
    pageSize: CATALOG_PAGE_SIZE,
    resetKey: `${String(resetKey)}|${needle}`,
  });
  return { search, setSearch, ...paged };
}

interface CatalogSearchProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** Tổng dòng khớp — hiện cạnh ô tìm để biết còn bao nhiêu sau khi lọc. */
  matched: number;
  isLoading: boolean;
}

export function CatalogSearch({
  id,
  label,
  placeholder,
  value,
  onChange,
  matched,
  isLoading,
}: CatalogSearchProps) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="w-full sm:max-w-sm">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <p className="text-sm text-muted tabular-nums" aria-live="polite">
        {isLoading ? 'Đang tải…' : `${matched} dòng${value.trim() ? ' khớp' : ''}`}
      </p>
    </div>
  );
}

interface CatalogPaginationProps {
  label: string;
  page: number;
  totalPages: number;
  total: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
}

export function CatalogPagination(props: CatalogPaginationProps) {
  return <Pagination {...props} limit={CATALOG_PAGE_SIZE} />;
}
