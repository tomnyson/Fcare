'use client';

import type { alertRowActions } from '../../lib/alert-actions';

/** Cột THAO TÁC: quyền đã tính sẵn ở `alertRowActions` — ở đây chỉ vẽ nút. */
export function AlertRowActionsCell({
  actions,
  onAcknowledge,
  onResolve,
  onDelete,
}: {
  actions: ReturnType<typeof alertRowActions>;
  onAcknowledge: () => void;
  onResolve: () => void;
  onDelete: () => void;
}) {
  if (!actions.canAcknowledge && !actions.canResolve && !actions.canDelete) {
    return <span className="text-xs text-muted">—</span>;
  }
  return (
    <div className="flex gap-3">
      {actions.canAcknowledge ? (
        <button
          type="button"
          onClick={onAcknowledge}
          className="text-xs font-semibold text-fpt-blue hover:underline"
        >
          Tiếp nhận
        </button>
      ) : null}
      {actions.canResolve ? (
        <button
          type="button"
          onClick={onResolve}
          className="text-xs font-semibold text-success hover:underline"
        >
          Xử lý
        </button>
      ) : null}
      {actions.canDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="text-xs font-semibold text-danger hover:underline"
        >
          Xoá
        </button>
      ) : null}
    </div>
  );
}
