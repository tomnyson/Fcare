import type { ReactNode } from 'react';
import { Skeleton } from './skeleton';
import { Pagination, type PaginationProps } from './pagination';

export type SortDirection = 'asc' | 'desc';

/** Cột sắp xếp được: `direction = null` là cột đang không được dùng để xếp. */
export interface SortableColumn {
  direction: SortDirection | null;
  onSort: () => void;
}

export type DataTablePaginationProps = Omit<PaginationProps, 'docked'>;

function isPaginationProps(val: unknown): val is DataTablePaginationProps {
  return (
    typeof val === 'object' &&
    val !== null &&
    'page' in val &&
    'totalPages' in val &&
    'onPageChange' in val &&
    typeof (val as { onPageChange: unknown }).onPageChange === 'function'
  );
}

interface DataTableProps {
  headers: string[];
  /** Tiêu đề cột → trạng thái sắp xếp. Cột không có khóa ở đây giữ nguyên chữ thường. */
  sortable?: Readonly<Record<string, SortableColumn>>;
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  /** Lần tải đầu — chưa có dữ liệu nào để hiện. */
  isLoading?: boolean;
  /** Đang tải lại nhưng vẫn còn dữ liệu cũ (đổi trang, đổi bộ lọc). */
  isRefreshing?: boolean;
  /** Số hàng skeleton; đặt bằng cỡ trang để bảng không co lại rồi bung ra. */
  skeletonRows?: number;
  /**
   * Bảng dài và rộng: giới hạn chiều cao theo màn hình, ghim tiêu đề cột, để
   * thanh cuộn ngang luôn nằm trong tầm nhìn thay vì ở đáy trang.
   */
  fitViewport?: boolean;
  /**
   * Cấu hình phân trang (tự động render cả 2 đầu trên và dưới) hoặc ReactNode tùy biến.
   */
  pagination?: DataTablePaginationProps | ReactNode;
  /** Footer tuỳ biến bất kỳ */
  footer?: ReactNode;
  className?: string;
}

// Bề rộng lệch nhau cho các ô skeleton để trông như dữ liệu thật chứ không
// phải lưới xám đều tăm tắp.
const SKELETON_WIDTHS = ['w-20', 'w-32', 'w-16', 'w-24', 'w-28'];

/** Bảng dữ liệu chuẩn của dashboard — cuộn ngang trong khung riêng, không tràn trang. */
export function DataTable({
  headers,
  sortable,
  children,
  emptyMessage,
  isEmpty,
  isLoading,
  isRefreshing,
  skeletonRows = 8,
  fitViewport = false,
  pagination,
  footer,
  className = '',
}: DataTableProps) {
  const isStructuredPagination = isPaginationProps(pagination);
  const position = isStructuredPagination ? (pagination.position ?? 'both') : 'bottom';
  const showTopPagination = isStructuredPagination && (position === 'top' || position === 'both');
  const showBottomPagination = isStructuredPagination && (position === 'bottom' || position === 'both');
  const customBottom = !isStructuredPagination ? (pagination ?? footer) : footer;

  return (
    <div className={`flex flex-col rounded-[var(--radius-card)] border border-border bg-white shadow-[var(--shadow-card)] overflow-hidden ${className}`}>
      {/* 1. Thanh phân trang ở đầu trên bảng */}
      {showTopPagination ? (
        <Pagination {...pagination} position="top" docked />
      ) : null}

      {/* 2. Thân bảng cuộn */}
      <div
        // Chỉ mờ đi khi tải lại — dữ liệu cũ vẫn đứng yên, không nhảy layout.
        className={`data-table-scroll ${
          fitViewport ? 'max-h-[var(--table-fit-height)] overflow-auto' : 'overflow-x-auto'
        } motion-safe:transition-opacity motion-safe:duration-[var(--duration-fast)] ${
          isRefreshing && !isLoading ? 'opacity-60' : 'opacity-100'
        }`}
        aria-busy={isLoading || isRefreshing || undefined}
      >
        <table className="w-full min-w-max text-left text-sm">
        <thead className={fitViewport ? 'sticky top-0 z-10' : undefined}>
          <tr className="border-b border-border bg-fpt-blue-900 text-white">
            {headers.map((header) => {
              const sort = sortable?.[header];
              return (
                <th
                  key={header}
                  scope="col"
                  aria-sort={sort ? ARIA_SORT[sort.direction ?? 'none'] : undefined}
                  className={`whitespace-nowrap text-xs font-bold uppercase tracking-wide ${sort ? 'px-2 py-1.5' : 'px-4 py-3'}`}
                >
                  {sort ? <SortHeaderButton label={header} sort={sort} /> : header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading ? (
            Array.from({ length: skeletonRows }, (_, rowIndex) => (
              <tr key={`skeleton-${rowIndex}`}>
                {headers.map((header, columnIndex) => (
                  <td key={header} className="px-4 py-3">
                    <Skeleton
                      className={`h-4 ${SKELETON_WIDTHS[(rowIndex + columnIndex) % SKELETON_WIDTHS.length]}`}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : isEmpty ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-10 text-center text-muted">
                {emptyMessage ?? 'Chưa có dữ liệu.'}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
      </div>

      {/* 3. Thanh phân trang ở chân bảng */}
      {showBottomPagination ? (
        <Pagination {...pagination} position="bottom" docked />
      ) : customBottom ? (
        <div className="-mt-px">{customBottom}</div>
      ) : null}
    </div>
  );
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending', none: 'none' } as const;

const NEXT_SORT_HINT = {
  none: 'bấm để xếp giảm dần',
  desc: 'đang giảm dần, bấm để xếp tăng dần',
  asc: 'đang tăng dần, bấm để bỏ sắp xếp',
} as const;

function SortHeaderButton({ label, sort }: { label: string; sort: SortableColumn }) {
  const state = sort.direction ?? 'none';
  const active = sort.direction !== null;
  return (
    <button
      type="button"
      onClick={sort.onSort}
      title={`${label}: ${NEXT_SORT_HINT[state]}`}
      className={`group inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 uppercase tracking-wide transition-colors duration-[var(--duration-fast)] hover:bg-white/10 active:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fpt-orange ${
        active ? 'text-fpt-orange' : 'text-white'
      }`}
    >
      {label}
      <SortIcon direction={sort.direction} />
    </button>
  );
}

/** Hai tam giác chồng nhau; chiều đang dùng sáng lên, cột chưa xếp mờ cả hai. */
function SortIcon({ direction }: { direction: SortDirection | null }) {
  const dim = 'opacity-35 group-hover:opacity-70';
  return (
    <svg aria-hidden viewBox="0 0 10 14" className="h-3.5 w-2.5 shrink-0" fill="currentColor">
      <path d="M5 1 9 6H1z" className={direction === 'asc' ? '' : dim} />
      <path d="M5 13 1 8h8z" className={direction === 'desc' ? '' : dim} />
    </svg>
  );
}

export function Td({ className = '', children }: { className?: string; children: ReactNode }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}
