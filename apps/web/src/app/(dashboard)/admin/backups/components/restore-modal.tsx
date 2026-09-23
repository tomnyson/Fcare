'use client';

import { Button } from '@fcare/ui-kit';
import { useEffect, useState, type FormEvent } from 'react';
import { FormError, Input, Label } from '../../../../../components/ui/form';
import { Modal } from '../../../../../components/ui/modal';
import { PinCodeInput } from '../../../../../components/ui/pin-code-input';
import {
  checkRestoreGate,
  RESTORE_CONFIRMATION_KEYWORD,
  remainingRestoreAttempts,
  resolveRestoreGate,
} from '../../../../../lib/restore-gate';
import type { BackupMetadata } from '../../../../../lib/types';
import { formatBytes, formatDate } from './backup-stats';

interface RestoreModalProps {
  backup: BackupMetadata | null;
  open: boolean;
  onClose: () => void;
  onConfirmRestore: (id: string, confirmation: string) => Promise<void>;
}

export function RestoreModal({ backup, open, onClose, onConfirmRestore }: RestoreModalProps) {
  const gate = resolveRestoreGate();
  const [input, setInput] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mỗi lần mở lại modal là một phiên xác thực mới.
  useEffect(() => {
    if (open) {
      setInput('');
      setFailedAttempts(0);
      setError(null);
    }
  }, [open]);

  if (!backup) return null;

  const remaining = remainingRestoreAttempts(failedAttempts);
  const isLocked = remaining === 0;
  const isComplete =
    gate.kind === 'pin' ? input.length === gate.length : checkRestoreGate(gate, input).ok;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

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
      // API vẫn nhận từ khóa; PIN chỉ là chốt chặn phía người dùng.
      await onConfirmRestore(backup.id, RESTORE_CONFIRMATION_KEYWORD);
      setInput('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Phục hồi database thất bại';
      // "Failed to fetch" = mất kết nối tới API giữa chừng (API tắt/khởi động lại),
      // không phải API từ chối. Diễn giải cho người dùng thay vì in lỗi thô.
      setError(
        /failed to fetch|network/i.test(msg)
          ? 'Mất kết nối tới máy chủ trong lúc phục hồi. Kiểm tra trạng thái API và Nhật ký hành động trước khi thử lại.'
          : msg,
      );
      setInput('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Xác nhận Phục hồi Cơ sở Dữ liệu" open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Hộp cảnh báo màu đỏ */}
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <div className="flex items-start gap-2">
            <span className="text-base font-bold">⚠️</span>
            <div className="space-y-1">
              <p className="font-bold text-red-900">
                CẢNH BÁO NGUY HIỂM: TOÀN BỘ DỮ LIỆU HIỆN TẠI SẼ BỊ THAY THẾ!
              </p>
              <p>
                Dữ liệu sinh viên, tài khoản, đánh giá, điểm danh và các thiết lập hiện tại sẽ được
                hoàn nguyên về đúng trạng thái tại thời điểm bản sao lưu này được tạo.
              </p>
            </div>
          </div>
        </div>

        {/* Thông tin bản backup sẽ phục hồi */}
        <div className="rounded-[var(--radius-card)] border border-border bg-gray-50/50 p-3.5 text-xs">
          <p className="font-semibold text-fpt-blue-900">Thông tin bản sao lưu được chọn:</p>
          <ul className="mt-2 space-y-1 text-muted">
            <li>
              • Tệp: <span className="font-mono text-ink font-semibold">{backup.filename}</span>
            </li>
            <li>
              • Kích thước: <span className="text-ink">{formatBytes(backup.sizeBytes)}</span>
            </li>
            <li>
              • Thời điểm tạo: <span className="text-ink">{formatDate(backup.createdAt)}</span>
            </li>
            {backup.comment && (
              <li>
                • Ghi chú: <span className="italic text-ink">{backup.comment}</span>
              </li>
            )}
          </ul>
        </div>

        {/* Thông báo cơ chế bảo vệ Snapshot tự động */}
        <div className="rounded-md border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
          <p className="font-semibold">🛡️ Cơ chế Snapshot bảo vệ an toàn:</p>
          <p className="mt-1 text-blue-800">
            Hệ thống sẽ <strong>TỰ ĐỘNG tạo một bản sao lưu trạng thái hiện tại</strong> (Snapshot)
            ngay trước khi ghi đè dữ liệu. Bạn có thể phục hồi lại trạng thái trước đó nếu cần
            thiết.
          </p>
        </div>

        {gate.kind === 'pin' ? (
          <div>
            <Label htmlFor="restore-pin-0" className="text-center">
              Nhập <span className="font-bold text-danger">mã PIN hệ thống</span> ({gate.length} chữ
              số) để xác nhận:
            </Label>
            <div className="mt-3">
              <PinCodeInput
                id="restore-pin"
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
            <Label htmlFor="restore-confirmation">
              Để xác nhận, vui lòng nhập{' '}
              <span className="font-bold text-danger font-mono">{gate.keyword}</span> vào ô bên
              dưới:
            </Label>
            <Input
              id="restore-confirmation"
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
            Hủy bỏ
          </Button>
          <Button variant="danger" type="submit" disabled={!isComplete || isSubmitting || isLocked}>
            {isSubmitting ? 'Đang phục hồi hệ thống...' : 'Tiến hành phục hồi ngay'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
