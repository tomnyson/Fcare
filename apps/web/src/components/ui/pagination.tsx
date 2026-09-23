'use client';

import {
  pageDisplayLabel,
  paginationWindow,
  shouldShowPagination,
  type PaginationItem,
} from '../../lib/pagination';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  /** Tổng số dòng dữ liệu để hiển thị dạng "Đang hiển thị 1 đến 10 của 249 mục". */
  total?: number;
  /** Số lượng mục trên 1 trang (mặc định 10). */
  limit?: number;
  /** Callback khi đổi số lượng mục trên 1 trang (ví dụ 10, 20, 50, 100). */
  onLimitChange?: (limit: number) => void;
  /** Danh sách lựa chọn số mục mỗi trang. Mặc định: [10, 20, 50, 100]. */
  pageSizeOptions?: number[];
  /** Tên bảng cho trình đọc màn hình. */
  label?: string;
  className?: string;
  /** Có gắn liền vào thẻ card của DataTable hay không. */
  docked?: boolean;
  /**
   * Vị trí thanh phân trang:
   * - 'bottom' (mặc định): ở chân bảng (hiển thị nhãn số dòng + cụm nút)
   * - 'top': ở đầu bảng (hiển thị dropdown chọn số mục/trang + cụm nút)
   * - 'both': hiển thị ở CẢ HAI ĐẦU (trên có chọn số mục, dưới có nhãn số dòng)
   */
  position?: 'top' | 'bottom' | 'both';
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * Dropdown chọn số mục mỗi trang: "Hiển thị [ 10 ⌄ ] mục mỗi trang"
 */
export function PageSizeSelector({
  limit = 10,
  onLimitChange,
  options = DEFAULT_PAGE_SIZE_OPTIONS,
  disabled = false,
}: {
  limit?: number;
  onLimitChange?: (limit: number) => void;
  options?: number[];
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-700">
      <span>Hiển thị</span>
      <select
        value={limit}
        disabled={disabled || !onLimitChange}
        onChange={(e) => onLimitChange?.(Number(e.target.value))}
        aria-label="Số mục mỗi trang"
        className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs sm:text-sm font-medium text-ink shadow-xs focus:border-fpt-blue focus:outline-none focus:ring-1 focus:ring-fpt-blue disabled:bg-gray-100 disabled:cursor-not-allowed cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <span>mục mỗi trang</span>
    </div>
  );
}

/**
 * Cụm nút bấm nối liền: [Trước] [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ] [ ... ] [ 26 ] [ Sau ]
 */
export function PaginationButtons({
  page,
  safeTotalPages,
  pages,
  isLoading,
  onPageChange,
}: {
  page: number;
  safeTotalPages: number;
  pages: PaginationItem[];
  isLoading: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div
      className="inline-flex items-center -space-x-px rounded-md shadow-xs isolate text-sm"
      role="group"
    >
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
        ),
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
  );
}

/**
 * Thanh phân trang chuẩn theo thiết kế:
 * - Hỗ trợ hiển thị ở đầu trên, đầu dưới hoặc cả hai đầu bảng ('both').
 * - Đầu trên: Chọn số mục mỗi trang ("Hiển thị [ 10 ⌄ ] mục mỗi trang") + cụm nút trang.
 * - Đầu dưới: Nhãn số lượng dòng ("Đang hiển thị 1 đến 10 của 249 mục") + cụm nút trang.
 * - Nút trang active màu xanh fpt-blue-900 chữ trắng.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  isLoading = false,
  total,
  limit = 10,
  onLimitChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  label = 'Phân trang',
  className = '',
  docked = false,
  position = 'bottom',
}: PaginationProps) {
  // Không đổi được số mục/trang thì ngưỡng chính là `limit` hiện tại.
  const thresholds = onLimitChange ? pageSizeOptions : [limit];
  if (!shouldShowPagination({ totalPages, total, pageSizeOptions: thresholds })) return null;

  const safeTotalPages = Math.max(1, totalPages);
  const hasRange = typeof total === 'number' && typeof limit === 'number';
  const labelText = hasRange
    ? pageDisplayLabel(page, limit, total)
    : `Trang ${page}/${safeTotalPages}`;
  const pages = paginationWindow(page, safeTotalPages);

  const topBar = (
    <div
      key="pagination-top"
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 text-sm ${
        docked
          ? 'border-b border-border bg-white px-5 py-3 rounded-t-[var(--radius-card)]'
          : 'mb-3 px-1 py-1'
      } ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <PageSizeSelector
          limit={limit}
          onLimitChange={onLimitChange}
          options={pageSizeOptions}
          disabled={isLoading}
        />
        {hasRange ? (
          <span
            className="text-muted tabular-nums text-xs sm:text-sm font-medium"
            aria-live="polite"
          >
            {isLoading ? 'Đang tải dữ liệu…' : `(${labelText})`}
          </span>
        ) : null}
      </div>
      <PaginationButtons
        page={page}
        safeTotalPages={safeTotalPages}
        pages={pages}
        isLoading={isLoading}
        onPageChange={onPageChange}
      />
    </div>
  );

  const bottomBar = (
    <nav
      key="pagination-bottom"
      aria-label={label}
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 text-sm ${
        docked
          ? 'border-t border-border bg-white px-5 py-3.5 rounded-b-[var(--radius-card)]'
          : 'mt-4 px-1 py-1'
      } ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <PageSizeSelector
          limit={limit}
          onLimitChange={onLimitChange}
          options={pageSizeOptions}
          disabled={isLoading}
        />
        <div className="text-muted tabular-nums text-xs sm:text-sm font-medium" aria-live="polite">
          {isLoading ? 'Đang tải dữ liệu…' : labelText}
        </div>
      </div>

      <PaginationButtons
        page={page}
        safeTotalPages={safeTotalPages}
        pages={pages}
        isLoading={isLoading}
        onPageChange={onPageChange}
      />
    </nav>
  );

  if (position === 'top') {
    return topBar;
  }

  if (position === 'both') {
    return (
      <>
        {topBar}
        {bottomBar}
      </>
    );
  }

  return bottomBar;
}
