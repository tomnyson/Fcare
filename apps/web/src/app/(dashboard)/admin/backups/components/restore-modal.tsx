'use client';

import { Button } from '@fcare/ui-kit';
import { useState, type FormEvent } from 'react';
import { FormError, Input, Label } from '../../../../../components/ui/form';
import { Modal } from '../../../../../components/ui/modal';
import type { BackupMetadata } from '../../../../../lib/types';
import { formatBytes, formatDate } from './backup-stats';

interface RestoreModalProps {
  backup: BackupMetadata | null;
  open: boolean;
  onClose: () => void;
  onConfirmRestore: (id: string, confirmation: string) => Promise<void>;
}

export function RestoreModal({
  backup,
  open,
  onClose,
  onConfirmRestore,
}: RestoreModalProps) {
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!backup) return null;

  const isConfirmed = confirmation.trim().toUpperCase() === 'XAC NHAN';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isConfirmed) {
      setError('Vui lòng nhập chính xác từ khóa "XAC NHAN" để tiếp tục');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirmRestore(backup.id, 'XAC NHAN');
      setConfirmation('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Phục hồi database thất bại';
      setError(msg);
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
              • Tệp:{' '}
              <span className="font-mono text-ink font-semibold">{backup.filename}</span>
            </li>
            <li>
              • Kích thước: <span className="text-ink">{formatBytes(backup.sizeBytes)}</span>
            </li>
            <li>
              • Thời điểm tạo:{' '}
              <span className="text-ink">{formatDate(backup.createdAt)}</span>
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
            ngay trước khi ghi đè dữ liệu. Bạn có thể phục hồi lại trạng thái trước đó nếu cần thiết.
          </p>
        </div>

        <div>
          <Label htmlFor="restore-confirmation">
            Để xác nhận, vui lòng nhập <span className="font-bold text-danger font-mono">XAC NHAN</span> vào ô bên dưới:
          </Label>
          <Input
            id="restore-confirmation"
            placeholder="Nhập XAC NHAN"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={isSubmitting}
            className="font-mono uppercase tracking-wider"
          />
        </div>

        {error && <FormError>{error}</FormError>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
            Hủy bỏ
          </Button>
          <Button
            variant="danger"
            type="submit"
            disabled={!isConfirmed || isSubmitting}
          >
            {isSubmitting ? 'Đang phục hồi hệ thống...' : 'Tiến hành phục hồi ngay'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
