'use client';

import { Button } from '@fcare/ui-kit';
import { useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import type { SectionGradeRow } from '../../lib/types';
import { FormError } from '../ui/form';
import { Modal } from '../ui/modal';

export interface ConfirmRemoveStudentModalProps {
  open: boolean;
  sectionId: string;
  sectionCode?: string;
  student: SectionGradeRow | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ConfirmRemoveStudentModal({
  open,
  sectionId,
  sectionCode,
  student,
  onClose,
  onSuccess,
}: ConfirmRemoveStudentModalProps) {
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!open || !student) {
    return null;
  }

  const handleConfirm = async () => {
    setError('');
    setIsDeleting(true);
    try {
      await apiFetch(
        `/class-sections/${sectionId}/enrollments/${student.enrollmentId}`,
        {
          method: 'DELETE',
        },
      );

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể xóa sinh viên khỏi lớp.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Xóa sinh viên khỏi lớp học phần"
      size="md"
    >
      <div className="space-y-4">
        {error && <FormError>{error}</FormError>}

        <p className="text-sm text-ink">
          Bạn chắc chắn muốn xóa sinh viên sau ra khỏi lớp{' '}
          {sectionCode ? <strong className="text-fpt-orange">{sectionCode}</strong> : 'này'}?
        </p>

        <div className="rounded-lg border border-border bg-slate-50 p-3.5 text-sm space-y-1">
          <div>
            <span className="text-muted">MSSV: </span>
            <span className="font-mono font-bold text-ink">{student.studentCode}</span>
          </div>
          <div>
            <span className="text-muted">Họ và tên: </span>
            <span className="font-semibold text-ink">{student.fullName}</span>
          </div>
        </div>

        <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
          Lưu ý: Thao tác này sẽ hủy ghi danh của sinh viên trong lớp học phần này và giảm sĩ số lớp đi 1. Hồ sơ chung của sinh viên trong hệ thống vẫn được giữ nguyên.
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isDeleting}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Đang xóa…' : 'Xóa khỏi lớp'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
