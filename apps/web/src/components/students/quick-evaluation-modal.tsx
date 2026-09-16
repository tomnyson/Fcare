'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useMe } from '../../lib/hooks';
import type { ClassSection, Enrollment, Evaluation, Student } from '../../lib/types';
import { Modal } from '../ui/modal';
import { EvaluationForm } from './evaluation-form';

interface QuickEvaluationModalProps {
  student: Student | null;
  term: string;
  sectionId?: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (student: Student) => void;
}

export function QuickEvaluationModal({
  student,
  term,
  sectionId,
  open,
  onClose,
  onSaved,
}: QuickEvaluationModalProps) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const studentId = student?.id ?? '';

  const { data: evaluations, isLoading: evaluationsLoading } = useQuery({
    queryKey: ['evaluations', studentId],
    queryFn: () => apiFetch<Evaluation[]>(`/evaluations?studentId=${studentId}`),
    enabled: Boolean(studentId) && open,
  });

  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery({
    queryKey: ['enrollments', studentId],
    queryFn: () => apiFetch<Enrollment[]>(`/enrollments?studentId=${studentId}`),
    enabled: Boolean(studentId) && open,
  });

  if (!student || !open) {
    return null;
  }

  const isLoading = evaluationsLoading || enrollmentsLoading;

  const seesAllSections = me?.user.roles.some((role) =>
    ['HEAD_OF_DEPT', 'ADMIN'].includes(role),
  );

  const sections: ClassSection[] = (enrollments ?? [])
    .map((enrollment) => enrollment.classSection)
    .filter((sec): sec is ClassSection => Boolean(sec))
    .filter((sec) => !term || sec.term === term)
    .filter((sec) => seesAllSections || sec.lecturerId === me?.user.id);

  const ownEvaluations = (evaluations ?? []).filter(
    (evaluation) =>
      (!term || evaluation.term === term) && evaluation.lecturer?.id === me?.user.id,
  );

  return (
    <Modal
      title={`Nhận xét sinh viên: ${student.fullName} (${student.studentCode})`}
      size="lg"
      open={open}
      onClose={onClose}
    >
      <div className="mb-4 rounded-md bg-fpt-blue-50/50 p-3 text-xs text-muted">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <span className="font-semibold text-ink">MSSV:</span> {student.studentCode}
          </div>
          <div>
            <span className="font-semibold text-ink">Lớp:</span> {student.classCode}
          </div>
          <div>
            <span className="font-semibold text-ink">Bộ môn:</span>{' '}
            {student.department?.code ?? '—'}
          </div>
          <div>
            <span className="font-semibold text-ink">Học kỳ:</span> {term || 'Hiện tại'}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted">
          Đang tải dữ liệu lớp học phần và nhận xét…
        </div>
      ) : sections.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted">
          <p className="font-semibold text-ink">Không tìm thấy lớp học phần phù hợp</p>
          <p className="mt-1 text-xs">
            Sinh viên này không có lớp học phần nào do bạn phụ trách trong học kỳ {term || 'này'}.
          </p>
        </div>
      ) : (
        <EvaluationForm
          studentId={student.id}
          term={term}
          sections={sections}
          ownEvaluations={ownEvaluations}
          initialSectionId={sectionId}
          onSaved={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['evaluations'] }),
              queryClient.invalidateQueries({ queryKey: ['students'] }),
            ]);
            onSaved?.(student);
            onClose();
          }}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}
