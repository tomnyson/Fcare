'use client';

import { pageDisplayLabel, paginationWindow } from '../../lib/pagination';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  /** Tổng số dòng dữ liệu để hiển thị dạng "Đang hiển thị 1 đến 10 của 249 mục". */
  total?: number;
  /** Số lượng mục trên 1 trang (mặc định 10). */
  limit?: number;
  /** Tên bảng cho trình đọc màn hình. */
  label?: string;
  className?: string;
  /** Có gắn liền dưới đáy thẻ card của DataTable hay không. */
  docked?: boolean;
}

/**
 * Thanh phân trang chuẩn theo thiết kế:
 * - Bên trái: Nhãn đếm "Đang hiển thị 1 đến 10 của 249 mục" (hoặc "Không có mục nào").
 * - Bên phải: Cụm nút bấm nối liền (segmented button group) [Trước] [ 1 ] [ 2 ] ... [ Sau ].
 * - Nút trang active màu xanh fpt-blue-900 chữ trắng.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  isLoading = false,
  total,
  limit = 10,
  label = 'Phân trang',
  className = '',
  docked = false,
}: PaginationProps) {
  // Ẩn hẳn khi danh sách rỗng hoàn toàn hoặc 0 mục
  if (totalPages <= 1 && (!total || total <= 0)) return null;

  const safeTotalPages = Math.max(1, totalPages);
  const hasRange = typeof total === 'number' && typeof limit === 'number';
  const labelText = hasRange ? pageDisplayLabel(page, limit, total) : `Trang ${page}/${safeTotalPages}`;
  const pages = paginationWindow(page, safeTotalPages);

  return (
    <nav
      aria-label={label}
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 text-sm ${
        docked
          ? 'border-t border-border bg-white px-5 py-3.5 rounded-b-[var(--radius-card)]'
          : 'mt-4 px-1 py-1'
      } ${className}`}
    >
      <div className="text-muted tabular-nums text-xs sm:text-sm font-medium" aria-live="polite">
        {isLoading ? 'Đang tải dữ liệu…' : labelText}
      </div>

      <div className="inline-flex items-center -space-x-px rounded-md shadow-xs isolate text-sm" role="group">
        {/* Nút Trước */}
        <button
          type="button"
          disabled={isLoading || page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="relative inline-flex items-center px-3 py-1.5 rounded-l-md border border-gray-300 bg-white text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-fpt-blue disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
        >
          Trước
        </button>

        {/* Danh sách các nút số trang và dấu ... */}
        {pages.map((p, idx) =>
          p === 'ellipsis' ? (
            <span
              key={`ellipsis-${idx}`}
              className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 bg-white text-xs sm:text-sm text-gray-400 select-none"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              disabled={isLoading}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`relative inline-flex items-center px-3.5 py-1.5 border text-xs sm:text-sm font-medium transition-colors focus:z-10 focus:outline-none focus:ring-1 focus:ring-fpt-blue ${
                p === page
                  ? 'z-10 bg-fpt-blue-900 border-fpt-blue-900 text-white font-semibold'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-fpt-blue'
              }`}
            >
              {p}
            </button>
          )
        )}

        {/* Nút Sau */}
        <button
          type="button"
          disabled={isLoading || page >= safeTotalPages}
          onClick={() => onPageChange(page + 1)}
          className="relative inline-flex items-center px-3 py-1.5 rounded-r-md border border-gray-300 bg-white text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-fpt-blue disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
        >
          Sau
        </button>
      </div>
    </nav>
  );
}
