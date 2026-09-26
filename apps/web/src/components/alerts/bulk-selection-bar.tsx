'use client';

import { Button } from '@fcare/ui-kit';
import { ALERT_BULK_DELETE_MAX } from '../../lib/alert-actions';

/**
 * Thanh chọn nhiều nằm ngay trên bảng: ô "chọn cả trang" thay cho checkbox ở
 * tiêu đề cột (DataTable chỉ nhận tiêu đề chữ), đếm đã chọn qua các trang và
 * nút xoá đỏ chỉ sáng khi có lựa chọn.
 */
export function BulkSelectionBar({
  selectedCount,
  pageCount,
  pageAllSelected,
  pageSomeSelected,
  onTogglePage,
  onClear,
  onDeleteSelected,
}: {
  selectedCount: number;
  pageCount: number;
  pageAllSelected: boolean;
  pageSomeSelected: boolean;
  onTogglePage: () => void;
  onClear: () => void;
  onDeleteSelected: () => void;
}) {
  const hasSelection = selectedCount > 0;
  return (
    <div
      role="toolbar"
      aria-label="Chọn nhiều cảnh báo"
      className={`mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-card)] border px-4 py-2.5 text-sm transition-colors ${
        hasSelection ? 'border-danger/40 bg-danger/5' : 'border-border bg-white'
      }`}
    >
      <label className="flex items-center gap-2 font-semibold text-ink">
        <input
          type="checkbox"
          checked={pageAllSelected}
          ref={(el) => {
            if (el) el.indeterminate = pageSomeSelected && !pageAllSelected;
          }}
          disabled={pageCount === 0}
          onChange={onTogglePage}
          className="size-4 accent-danger"
        />
        Chọn cả trang
        <span className="font-normal text-muted">({pageCount})</span>
      </label>

      <span
        className={hasSelection ? 'font-semibold text-danger' : 'text-muted'}
        aria-live="polite"
      >
        {hasSelection
          ? `Đã chọn ${selectedCount}${selectedCount >= ALERT_BULK_DELETE_MAX ? ` (tối đa ${ALERT_BULK_DELETE_MAX} một lượt)` : ''}`
          : 'Chưa chọn cảnh báo nào'}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {hasSelection ? (
          <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={onClear}>
            Bỏ chọn
          </Button>
        ) : null}
        <Button
          type="button"
          variant="danger"
          className="h-8 px-3 text-xs"
          disabled={!hasSelection}
          onClick={onDeleteSelected}
        >
          Xoá đã chọn{hasSelection ? ` (${selectedCount})` : ''}
        </Button>
      </div>
    </div>
  );
}
