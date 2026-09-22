'use client';

import { Button } from '@fcare/ui-kit';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import type { EnrollmentResult, SectionGradeRow } from '../../lib/types';
import { FormError, FormSuccess, Input, Label, Select } from '../ui/form';
import { Modal } from '../ui/modal';

export interface EditSectionStudentModalProps {
  open: boolean;
  sectionId: string;
  student: SectionGradeRow | null;
  onClose: () => void;
  onSuccess: () => void;
}

const RESULT_OPTIONS: Array<{ value: EnrollmentResult; label: string }> = [
  { value: 'IN_PROGRESS', label: 'Đang học' },
  { value: 'PASS', label: 'Đạt' },
  { value: 'FAIL', label: 'Không đạt' },
];

export function EditSectionStudentModal({
  open,
  sectionId,
  student,
  onClose,
  onSuccess,
}: EditSectionStudentModalProps) {
  const [fullName, setFullName] = useState('');
  const [totalScore, setTotalScore] = useState<string>('');
  const [result, setResult] = useState<EnrollmentResult>('IN_PROGRESS');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (student) {
      setFullName(student.fullName);
      setTotalScore(student.totalScore !== null ? String(student.totalScore) : '');
      setResult(student.result);
      setError('');
      setSuccess('');
    }
  }, [student]);

  if (!open || !student) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError('Họ và tên sinh viên không được để trống.');
      return;
    }

    let parsedScore: number | null = null;
    if (totalScore !== '') {
      parsedScore = Number(totalScore);
      if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 10) {
        setError('Điểm tổng kết phải nằm trong khoảng từ 0 đến 10.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await apiFetch(
        `/class-sections/${sectionId}/enrollments/${student.enrollmentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            fullName: trimmedName,
            totalScore: parsedScore,
            result,
          }),
        },
      );

      setSuccess('Cập nhật thông tin sinh viên thành công!');
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể cập nhật sinh viên.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chỉnh sửa thông tin sinh viên trong lớp"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <FormError>{error}</FormError>}
        {success && <FormSuccess>{success}</FormSuccess>}

        <div>
          <Label htmlFor="edit-student-code">Mã số sinh viên (MSSV)</Label>
          <Input
            id="edit-student-code"
            value={student.studentCode}
            disabled
            className="bg-slate-100 font-mono text-muted cursor-not-allowed"
          />
        </div>

        <div>
          <Label htmlFor="edit-student-name">Họ và tên</Label>
          <Input
            id="edit-student-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nhập họ và tên sinh viên…"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-student-score">Điểm tổng kết</Label>
            <Input
              id="edit-student-score"
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={totalScore}
              onChange={(e) => setTotalScore(e.target.value)}
              placeholder="Chưa có điểm"
            />
          </div>

          <div>
            <Label htmlFor="edit-student-result">Kết quả học phần</Label>
            <Select
              id="edit-student-result"
              value={result}
              onChange={(e) => setResult(e.target.value as EnrollmentResult)}
            >
              {RESULT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
