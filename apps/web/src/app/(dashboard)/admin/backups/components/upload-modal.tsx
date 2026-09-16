'use client';

import { Button } from '@fcare/ui-kit';
import { useRef, useState, type FormEvent } from 'react';
import { FormError, Input, Label } from '../../../../../components/ui/form';
import { Modal } from '../../../../../components/ui/modal';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File, comment: string) => Promise<void>;
}

export function UploadModal({ open, onClose, onUpload }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endsWith('.dump')) {
        setError('Hệ thống chỉ chấp nhận tệp định dạng .dump của PostgreSQL');
        setSelectedFile(null);
        return;
      }
      setError(null);
      setSelectedFile(file);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Vui lòng chọn tệp .dump để tải lên');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onUpload(selectedFile, comment.trim());
      setSelectedFile(null);
      setComment('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tải lên tệp sao lưu thất bại';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Tải lên tệp sao lưu từ máy tính" open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted">
          Chọn tệp sao lưu định dạng <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">.dump</code> (PostgreSQL Custom Format, tối đa 500MB). Hệ thống sẽ kiểm tra tính toàn vẹn của tệp trước khi lưu trữ.
        </p>

        <div>
          <Label htmlFor="backup-file">Chọn tệp .dump</Label>
          <input
            id="backup-file"
            type="file"
            ref={fileInputRef}
            accept=".dump"
            onChange={handleFileChange}
            disabled={isSubmitting}
            className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-fpt-orange-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-fpt-orange hover:file:bg-fpt-orange-100"
          />
          {selectedFile && (
            <p className="mt-1.5 text-xs text-ink font-medium">
              Đã chọn: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="upload-comment">Ghi chú nguồn gốc tệp (Tùy chọn)</Label>
          <Input
            id="upload-comment"
            placeholder="Ví dụ: Bản sao lưu từ máy chủ production ngày..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={255}
            disabled={isSubmitting}
          />
        </div>

        {error && <FormError>{error}</FormError>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isSubmitting}>
            Hủy bỏ
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting || !selectedFile}>
            {isSubmitting ? 'Đang tải lên & kiểm tra...' : 'Tải lên hệ thống'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
