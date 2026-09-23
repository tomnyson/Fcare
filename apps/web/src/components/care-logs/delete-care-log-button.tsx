'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import {
  CARE_LOG_DELETE_INVALIDATION_KEYS,
  canDeleteCareLog,
  careLogDeletedMessage,
} from '../../lib/care-log-actions';
import { useMe } from '../../lib/hooks';
import { formatDateTime } from '../../lib/labels';
import type { CareLog } from '../../lib/types';
import { FormError } from '../ui/form';
import { Modal } from '../ui/modal';

interface DeleteCareLogButtonProps {
  log: CareLog;
  /** Gọi sau khi xoá xong, kèm thông báo để nơi dùng hiển thị. */
  onDeleted?: (message: string) => void;
}

/** Nút "Xoá" một lượt chăm sóc — chỉ render cho ADMIN, xác nhận trước khi xoá. */
export function DeleteCareLogButton({ log, onDeleted }: DeleteCareLogButtonProps) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; ownerCareReset: boolean }>(`/care-logs/${log.id}`, {
        method: 'DELETE',
      }),
    onSuccess: async (result) => {
      setOpen(false);
      await Promise.all(
        CARE_LOG_DELETE_INVALIDATION_KEYS.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      onDeleted?.(careLogDeletedMessage(result.ownerCareReset));
    },
  });

  if (!canDeleteCareLog(me?.user.roles)) return null;

  const close = () => {
    if (mutation.isPending) return;
    mutation.reset();
    setOpen(false);
  };
  const error =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? 'Không xoá được lượt chăm sóc.'
        : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-sm px-1.5 py-0.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        aria-label={`Xoá lượt chăm sóc lúc ${formatDateTime(log.createdAt)}`}
      >
        Xoá
      </button>
      <Modal title="Xoá lượt chăm sóc" open={open} onClose={close}>
        <div className="space-y-3 text-sm text-ink">
          <p>
            Xoá lượt chăm sóc của <strong>{log.staff?.fullName ?? 'người chăm sóc'}</strong>
            {log.student ? (
              <>
                {' '}
                cho <strong>{log.student.fullName}</strong> ({log.student.studentCode})
              </>
            ) : null}{' '}
            lúc {formatDateTime(log.createdAt)}?
          </p>
          <p className="text-muted">
            Không hoàn tác được. Số lượt chăm sóc trong thống kê sẽ giảm theo; nếu đây là lượt duy
            nhất của giảng viên đứng lớp cho cảnh báo điểm danh, cảnh báo sẽ hiện lại &ldquo;cần chăm
            sóc&rdquo;.
          </p>
          {error ? <FormError>{error}</FormError> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={close} disabled={mutation.isPending}>
              Hủy
            </Button>
            <Button
              variant="danger"
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Đang xoá…' : 'Xoá lượt chăm sóc'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
