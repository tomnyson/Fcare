'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { bulkDeletionPreviewLines } from '../../lib/alert-actions';
import { apiFetch, ApiError } from '../../lib/api';
import { ALERT_LEVEL_LABELS, ALERT_LEVEL_TONES, ALERT_STATUS_LABELS } from '../../lib/labels';
import {
  checkRestoreGate,
  remainingRestoreAttempts,
  resolveRestoreGate,
} from '../../lib/restore-gate';
import type { AlertBulkDeletionPreview } from '../../lib/types';
import { FormError, Input, Label } from '../ui/form';
import { Modal } from '../ui/modal';
import { PinCodeInput } from '../ui/pin-code-input';

interface DeleteAlertModalProps {
  /** Một hay nhiều cảnh báo — cùng một luồng, cùng một cửa PIN. */
  ids: string[];
  open: boolean;
  onClose: () => void;
  /** Ném lỗi nếu API từ chối — modal hiển thị và giữ hộp thoại mở. */
  onConfirmDelete: (ids: string[]) => Promise<void>;
}

/**
 * Xoá cảnh báo kèm nhận xét + trao đổi của sinh viên — chỉ ADMIN. Cùng cửa
 * xác nhận với phục hồi database: PIN hệ thống 6 số, rơi về từ khoá khi PIN
 * chưa cấu hình. Danh sách sinh viên và "sẽ mất gì" lấy từ API để không đoán
 * mò — id đã chọn ở trang khác vẫn hiện đúng tên.
 */
export function DeleteAlertModal({ ids, open, onClose, onConfirmDelete }: DeleteAlertModalProps) {
  const gate = resolveRestoreGate();
  const [input, setInput] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setInput('');
      setFailedAttempts(0);
      setError(null);
    }
  }, [open]);

  const preview = useQuery({
    queryKey: ['alerts', 'bulk-deletion-preview', ids.join(',')],
    queryFn: () =>
      apiFetch<AlertBulkDeletionPreview>('/alerts/bulk-deletion-preview', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    enabled: open && ids.length > 0,
    staleTime: 0,
  });

  if (ids.length === 0) return null;

  const remaining = remainingRestoreAttempts(failedAttempts);
  const isLocked = remaining === 0;
  const isComplete =
    gate.kind === 'pin' ? input.length === gate.length : checkRestoreGate(gate, input).ok;
  const previewError =
    preview.error instanceof ApiError
      ? preview.error.message
      : preview.error
        ? 'Không tải được.'
        : null;
  const canSubmit = isComplete && !isSubmitting && !isLocked && preview.isSuccess;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLocked || !preview.isSuccess) return;

    const verdict = checkRestoreGate(gate, input);
    if (!verdict.ok) {
      if (verdict.reason === 'wrong') {
        const left = remainingRestoreAttempts(failedAttempts + 1);
        setFailedAttempts(failedAttempts + 1);
        setInput('');
        setError(
          left > 0
            ? `${verdict.message} Còn ${left} lần thử.`
            : 'Đã nhập sai nhiều lần. Đóng hộp thoại và thử lại sau.',
        );
      } else {
        setError(verdict.message);
      }
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirmDelete(ids);
      setInput('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xoá cảnh báo thất bại.';
      setError(
        /failed to fetch|network/i.test(msg)
          ? 'Mất kết nối tới máy chủ. Tải lại trang để kiểm tra cảnh báo đã bị xoá chưa.'
          : msg,
      );
      setInput('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const many = ids.length > 1;
  const lines = preview.data ? bulkDeletionPreviewLines(preview.data) : [];
  const items = preview.data?.items ?? [];

  return (
    <Modal
      title={many ? `Xoá ${ids.length} cảnh báo sinh viên` : 'Xoá cảnh báo sinh viên'}
      open={open}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-md border border-danger/30 bg-danger/5 p-4 text-xs text-danger">
          <p className="font-bold">
            KHÔNG THỂ HOÀN TÁC: dữ liệu của {many ? 'các sinh viên' : 'sinh viên'} sẽ bị xoá vĩnh
            viễn.
          </p>
          <p className="mt-1">
            Không chỉ cảnh báo — toàn bộ nhận xét giảng viên và luồng trao đổi về{' '}
            {many ? 'từng sinh viên trong danh sách' : 'sinh viên này'} cũng bị xoá. Điểm rủi ro
            (DRS) sẽ tính lại từ đầu.
          </p>
        </div>

        {/* Danh sách lấy từ API: chọn ở trang khác vẫn thấy đúng tên, không cần bảng còn giữ dòng. */}
        <ul
          className="max-h-48 space-y-1.5 overflow-y-auto rounded-[var(--radius-card)] border border-border bg-surface p-3 text-xs"
          aria-label="Cảnh báo sẽ bị xoá"
        >
          {preview.isPending
            ? Array.from({ length: Math.min(ids.length, 3) }, (_, i) => (
                <li key={i} className="text-muted">
                  Đang tải…
                </li>
              ))
            : items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-semibold text-ink">{item.student.fullName}</span>
                  <span className="font-mono text-muted">{item.student.studentCode}</span>
                  <Badge tone={ALERT_LEVEL_TONES[item.level] ?? 'info'}>
                    Mức {item.level}
                    {ALERT_LEVEL_LABELS[item.level] ? ` — ${ALERT_LEVEL_LABELS[item.level]}` : ''}
                  </Badge>
                  <span className="text-muted">{ALERT_STATUS_LABELS[item.status]}</span>
                </li>
              ))}
        </ul>

        <div className="text-xs">
          <p className="font-semibold text-ink">Sẽ mất những gì:</p>
          {preview.isPending ? (
            <p className="mt-2 text-muted">Đang kiểm tra dữ liệu liên quan…</p>
          ) : previewError ? (
            <FormError>{previewError}</FormError>
          ) : (
            <ul className="mt-2 space-y-1">
              {lines.map((line) => (
                <li
                  key={line.kind}
                  className={line.destructive ? 'text-danger' : 'text-muted'}
                  data-kind={line.kind}
                >
                  {line.destructive ? '✕ ' : '↷ '}
                  {line.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        {(preview.data?.autoAttendance ?? 0) > 0 ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-ink">
            {many
              ? `${preview.data?.autoAttendance} cảnh báo trong danh sách là cảnh báo điểm danh tự động.`
              : 'Đây là cảnh báo điểm danh tự động.'}{' '}
            Nếu số buổi vắng của sinh viên vẫn đủ ngưỡng, hệ thống sẽ{' '}
            <strong>phát lại cảnh báo</strong> ở lần rà soát điểm danh kế tiếp.
          </p>
        ) : null}

        {gate.kind === 'pin' ? (
          <div>
            <Label htmlFor="delete-alert-pin-0" className="text-center">
              Nhập <span className="font-bold text-danger">mã PIN hệ thống</span> ({gate.length} chữ
              số) để xác nhận xoá:
            </Label>
            <div className="mt-3">
              <PinCodeInput
                id="delete-alert-pin"
                value={input}
                length={gate.length}
                onChange={(next) => {
                  setInput(next);
                  if (error) setError(null);
                }}
                disabled={isSubmitting || isLocked}
                invalid={Boolean(error) && !isSubmitting}
                autoFocus
              />
            </div>
          </div>
        ) : (
          <div>
            <Label htmlFor="delete-alert-confirmation">
              Để xác nhận, nhập{' '}
              <span className="font-mono font-bold text-danger">{gate.keyword}</span>:
            </Label>
            <Input
              id="delete-alert-confirmation"
              placeholder={`Nhập ${gate.keyword}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isSubmitting || isLocked}
              className="font-mono uppercase tracking-wider"
            />
          </div>
        )}

        {error && <FormError>{error}</FormError>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button variant="danger" type="submit" disabled={!canSubmit}>
            {isSubmitting
              ? 'Đang xoá…'
              : many
                ? `Xoá vĩnh viễn ${ids.length} cảnh báo`
                : 'Xoá vĩnh viễn'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
