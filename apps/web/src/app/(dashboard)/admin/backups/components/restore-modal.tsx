'use client';

import { PIN_LENGTH } from '@fcare/shared-types';
import { Button } from '@fcare/ui-kit';
import { useEffect, useState, type FormEvent } from 'react';
import { FormError, Label } from '../../../../../components/ui/form';
import { Modal } from '../../../../../components/ui/modal';
import { PinCodeInput } from '../../../../../components/ui/pin-code-input';
import { ApiError } from '../../../../../lib/api';
import { requestPinProof } from '../../../../../lib/pin-lock';
import { RESTORE_CONFIRMATION_KEYWORD } from '../../../../../lib/restore-gate';
import type { BackupMetadata } from '../../../../../lib/types';
import { formatBytes, formatDate } from './backup-stats';

interface RestoreModalProps {
  backup: BackupMetadata | null;
  open: boolean;
  onClose: () => void;
  /** `pinProof` = bằng chứng server cấp sau khi kiểm PIN — gửi kèm header `X-Pin-Proof`. */
  onConfirmRestore: (id: string, confirmation: string, pinProof: string) => Promise<void>;
}

export function RestoreModal({ backup, open, onClose, onConfirmRestore }: RestoreModalProps) {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mỗi lần mở lại modal là một phiên xác thực mới.
  useEffect(() => {
    if (open) {
      setInput('');
      setError(null);
    }
  }, [open]);

  if (!backup) return null;

  const isComplete = input.length === PIN_LENGTH;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isComplete || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    let proof: string;
    try {
      // PIN kiểm ở server (đếm sai chung với màn khoá — 5 lần là thu hồi phiên).
      proof = await requestPinProof(input, 'BACKUP_RESTORE');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không kiểm tra được mã PIN.');
      setInput('');
      setIsSubmitting(false);
      return;
    }

    try {
      await onConfirmRestore(backup.id, RESTORE_CONFIRMATION_KEYWORD, proof);
      setInput('');
      onClose();
    } catch (err: unknown) {
      // status 0 = mất kết nối tới API giữa chừng (API tắt/khởi động lại), không
      // phải API từ chối — phục hồi có thể đã chạy xong, cần kiểm tra trước khi thử lại.
      const lostConnection = err instanceof ApiError && err.status === 0;
      setError(
        lostConnection
          ? 'Mất kết nối tới máy chủ trong lúc phục hồi. Kiểm tra trạng thái API và Nhật ký hành động trước khi thử lại.'
          : err instanceof Error
            ? err.message
            : 'Phục hồi database thất bại',
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

        <div>
          <Label htmlFor="restore-pin-0" className="text-center">
            Nhập <span className="font-bold text-danger">mã PIN của bạn</span> ({PIN_LENGTH} chữ số)
            để xác nhận:
          </Label>
          <div className="mt-3">
            <PinCodeInput
              id="restore-pin"
              label="Mã PIN xác nhận phục hồi"
              value={input}
              length={PIN_LENGTH}
              onChange={(next) => {
                setInput(next);
                if (error) setError(null);
              }}
              disabled={isSubmitting}
              invalid={Boolean(error) && !isSubmitting}
              autoFocus
            />
          </div>
        </div>

        {error && <FormError>{error}</FormError>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
            Hủy bỏ
          </Button>
          <Button variant="danger" type="submit" disabled={!isComplete || isSubmitting}>
            {isSubmitting ? 'Đang phục hồi hệ thống...' : 'Tiến hành phục hồi ngay'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
