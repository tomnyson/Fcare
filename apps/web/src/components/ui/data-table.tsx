import type { ReactNode } from 'react';

interface DataTableProps {
  headers: string[];
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
}

/** Bảng dữ liệu chuẩn của dashboard — cuộn ngang trong khung riêng, không tràn trang. */
export function DataTable({ headers, children, emptyMessage, isEmpty }: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-white shadow-[var(--shadow-card)]">
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
          {isEmpty ? (
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
