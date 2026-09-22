'use client';

import { Fragment, useState } from 'react';
import {
  groupLocation,
  LEVEL_LABEL,
  SOURCE_LABEL,
  type ErrorGroupView,
  type SystemErrorLevel,
} from '../../lib/system-monitoring';
import { Skeleton } from '../ui/skeleton';

const LEVEL_PILL: Record<SystemErrorLevel, string> = {
  ERROR: 'bg-fpt-orange-50 text-fpt-orange-600',
  FATAL: 'bg-danger/10 text-danger',
};

const HEADERS = ['Mức', 'Nơi xảy ra', 'Thông điệp', 'Số lần', 'Lần cuối', ''];

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LevelPill({ level }: { level: SystemErrorLevel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${LEVEL_PILL[level]}`}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}

function StackPanel({ group }: { group: ErrorGroupView }) {
  return (
    <div className="space-y-3 bg-fpt-blue-900/[0.03] px-4 py-4">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <div className="flex gap-1.5">
          <dt>Nguồn</dt>
          <dd className="font-semibold text-ink">{SOURCE_LABEL[group.source]}</dd>
        </div>
        {group.context ? (
          <div className="flex gap-1.5">
            <dt>Context</dt>
            <dd className="font-semibold break-all text-ink">{group.context}</dd>
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <dt>Lần đầu trong tuần</dt>
          <dd className="font-semibold text-ink tabular-nums">
            {formatDateTime(group.firstSeenAt)}
          </dd>
        </div>
      </dl>
      <p className="text-sm break-words text-ink">{group.message}</p>
      {group.stack ? (
        <pre className="max-h-80 overflow-auto rounded-md bg-fpt-blue-900 p-4 font-mono text-xs leading-relaxed whitespace-pre text-white/90">
          {group.stack}
        </pre>
      ) : (
        <p className="text-xs text-muted italic">Lỗi này không kèm stack trace.</p>
      )}
    </div>
  );
}

interface ErrorGroupsTableProps {
  groups: ErrorGroupView[];
  isLoading: boolean;
  isRefreshing: boolean;
  skeletonRows: number;
  /** Có bộ lọc đang bật → gợi ý bỏ lọc thay vì chúc mừng "không có lỗi". */
  filtered: boolean;
  onClearFilters: () => void;
}

export function ErrorGroupsTable({
  groups,
  isLoading,
  isRefreshing,
  skeletonRows,
  filtered,
  onClearFilters,
}: ErrorGroupsTableProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!isLoading && groups.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-border bg-white px-6 py-12 text-center">
        <p className="text-4xl" aria-hidden="true">
          {filtered ? '🔍' : '✅'}
        </p>
        <p className="mt-3 font-display text-base font-semibold text-fpt-blue-900">
          {filtered ? 'Không có nhóm lỗi nào khớp bộ lọc.' : 'Chưa ghi nhận lỗi nào.'}
        </p>
        <p className="mt-1 text-sm text-muted">
          {filtered
            ? 'Thử chọn tuần khác hoặc bỏ lọc mức độ.'
            : 'Lỗi 5xx, job hàng đợi thất bại và sự cố tiến trình sẽ hiện ở đây.'}
        </p>
        {filtered ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-4 rounded-md px-4 py-2 text-sm font-semibold text-fpt-blue underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange"
          >
            Bỏ lọc
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`overflow-x-auto rounded-[var(--radius-card)] border border-border bg-white shadow-[var(--shadow-card)] motion-safe:transition-opacity motion-safe:duration-[var(--duration-fast)] ${
        isRefreshing && !isLoading ? 'opacity-60' : 'opacity-100'
      }`}
      aria-busy={isLoading || isRefreshing || undefined}
    >
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead>
          <tr className="bg-fpt-blue-900 text-white">
            {HEADERS.map((header, index) => (
              <th
                key={header || `col-${index}`}
                scope="col"
                className={`px-4 py-3 text-xs font-bold tracking-wide whitespace-nowrap uppercase ${
                  header === 'Số lần' ? 'text-right' : ''
                }`}
              >
                {header || <span className="sr-only">Chi tiết</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading
            ? Array.from({ length: skeletonRows }, (_, row) => (
                <tr key={`skeleton-${row}`}>
                  {HEADERS.map((header, col) => (
                    <td key={`${header}-${col}`} className="px-4 py-3.5">
                      <Skeleton className={`h-4 ${col === 2 ? 'w-64' : 'w-16'}`} />
                    </td>
                  ))}
                </tr>
              ))
            : groups.map((group) => {
                const open = openId === group.id;
                const panelId = `error-group-${group.id}`;
                return (
                  <Fragment key={group.id}>
                    <tr
                      className={`transition-colors duration-[var(--duration-fast)] hover:bg-fpt-orange-50/40 ${
                        open ? 'bg-fpt-orange-50/40' : ''
                      }`}
                    >
                      <td className="px-4 py-3 align-top">
                        <LevelPill level={group.level} />
                      </td>
                      <td className="max-w-[16rem] px-4 py-3 align-top">
                        <p className="truncate font-medium text-ink" title={groupLocation(group)}>
                          {groupLocation(group)}
                        </p>
                        <p className="text-xs text-muted">
                          {SOURCE_LABEL[group.source]}
                          {group.statusCode ? ` · ${group.statusCode}` : ''}
                        </p>
                      </td>
                      <td className="max-w-[24rem] px-4 py-3 align-top">
                        <p className="line-clamp-2 break-words text-ink">{group.message}</p>
                      </td>
                      <td className="px-4 py-3 text-right align-top font-display text-base font-bold text-fpt-blue-900 tabular-nums">
                        {group.count.toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap text-muted tabular-nums">
                        {formatDateTime(group.lastSeenAt)}
                      </td>
                      <td className="px-2 py-2 text-right align-top">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={panelId}
                          onClick={() => setOpenId(open ? null : group.id)}
                          className="min-h-11 rounded-md px-3 text-xs font-semibold whitespace-nowrap text-fpt-blue transition-colors duration-[var(--duration-fast)] hover:bg-fpt-blue/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange active:bg-fpt-blue/15"
                        >
                          {open ? 'Ẩn stack' : 'Xem stack'}
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr id={panelId}>
                        <td colSpan={HEADERS.length} className="p-0">
                          <StackPanel group={group} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
