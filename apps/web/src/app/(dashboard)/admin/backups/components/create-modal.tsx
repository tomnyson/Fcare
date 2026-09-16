'use client';

import { Button } from '@fcare/ui-kit';
import { useState, type FormEvent } from 'react';
import { FormError, Input, Label } from '../../../../../components/ui/form';
import { Modal } from '../../../../../components/ui/modal';

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => Promise<void>;
}

export function CreateModal({ open, onClose, onSubmit }: CreateModalProps) {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(comment.trim());
      setComment('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo bản sao lưu';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Tạo bản sao lưu dữ liệu mới" open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted">
          Hệ thống sẽ kết xuất toàn bộ cấu trúc và dữ liệu cơ sở dữ liệu hiện tại thành tệp lưu trữ
          nén <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">.dump</code>.
        </p>

        <div>
          <Label htmlFor="backup-comment">Ghi chú mục đích sao lưu (Tùy chọn)</Label>
          <Input
            id="backup-comment"
            placeholder="Ví dụ: Sao lưu trước khi import dữ liệu đợt FA26..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={255}
            disabled={isSubmitting}
          />
          <span className="mt-1 block text-right text-[11px] text-muted">
            {comment.length}/255 ký tự
          </span>
        </div>

        {error && <FormError>{error}</FormError>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
            Hủy bỏ
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang tạo sao lưu...' : 'Bắt đầu sao lưu'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
