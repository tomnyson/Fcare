'use client';

import { Button } from '@fcare/ui-kit';
import { pageRangeLabel } from '../../lib/pagination';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  /** Có `total` + `limit` thì hiện thêm "1–20 / 143" để biết còn bao nhiêu. */
  total?: number;
  limit?: number;
  /** Tên bảng cho trình đọc màn hình khi trang có nhiều bảng phân trang. */
  label?: string;
  className?: string;
}

/**
 * Thanh phân trang dùng chung — cùng markup với trang Sinh viên để mọi bảng
 * lật trang giống nhau. Ẩn hẳn khi chỉ có 1 trang và không có gì để đếm.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  isLoading = false,
  total,
  limit,
  label = 'Phân trang',
  className = '',
}: PaginationProps) {
  const range =
    typeof total === 'number' && typeof limit === 'number'
      ? pageRangeLabel(page, limit, total)
      : null;
  if (totalPages <= 1 && !range) return null;

  return (
    <nav
      aria-label={label}
      className={`mt-4 flex flex-wrap items-center justify-between gap-3 text-sm ${className}`}
    >
      <p className="text-muted tabular-nums" aria-live="polite">
        {isLoading ? 'Đang tải…' : `Trang ${page}/${totalPages}`}
        {range && !isLoading ? <span className="ml-2 text-xs">({range})</span> : null}
      </p>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          type="button"
          disabled={isLoading || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ← Trước
        </Button>
        <Button
          variant="ghost"
          type="button"
          disabled={isLoading || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Sau →
        </Button>
      </div>
    </nav>
  );
}
