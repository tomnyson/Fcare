import type { ReactNode } from 'react';
import { Skeleton } from './skeleton';

interface DataTableProps {
  headers: string[];
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  /** Lần tải đầu — chưa có dữ liệu nào để hiện. */
  isLoading?: boolean;
  /** Đang tải lại nhưng vẫn còn dữ liệu cũ (đổi trang, đổi bộ lọc). */
  isRefreshing?: boolean;
  /** Số hàng skeleton; đặt bằng cỡ trang để bảng không co lại rồi bung ra. */
  skeletonRows?: number;
}

// Bề rộng lệch nhau cho các ô skeleton để trông như dữ liệu thật chứ không
// phải lưới xám đều tăm tắp.
const SKELETON_WIDTHS = ['w-20', 'w-32', 'w-16', 'w-24', 'w-28'];

/** Bảng dữ liệu chuẩn của dashboard — cuộn ngang trong khung riêng, không tràn trang. */
export function DataTable({
  headers,
  children,
  emptyMessage,
  isEmpty,
  isLoading,
  isRefreshing,
  skeletonRows = 8,
}: DataTableProps) {
  return (
    <div
      // Chỉ mờ đi khi tải lại — dữ liệu cũ vẫn đứng yên, không nhảy layout.
      className={`overflow-x-auto rounded-[var(--radius-card)] border border-border bg-white shadow-[var(--shadow-card)] motion-safe:transition-opacity motion-safe:duration-[var(--duration-fast)] ${
        isRefreshing && !isLoading ? 'opacity-60' : 'opacity-100'
      }`}
      aria-busy={isLoading || isRefreshing || undefined}
    >
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-fpt-blue-900 text-white">
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wide">
                {header}
              </th>
            ))}
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
  );
}

export function Td({ className = '', children }: { className?: string; children: ReactNode }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}
