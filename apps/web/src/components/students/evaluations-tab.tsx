'use client';

import { Button } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import type { AuthUser, ClassSection, Enrollment, Evaluation } from '../../lib/types';
import { useCurrentTerm } from '../../lib/use-current-term';
import { Modal } from '../ui/modal';
import { EvaluationForm } from './evaluation-form';
import { EvaluationList } from './evaluation-list';
import { RiskScorePanel } from './risk-score-panel';
import { uniqueTermsFromEnrollments } from './student-analysis-helpers';
import { StudentAnalysisPanel } from './student-analysis-panel';

/**
 * Tab nhận xét: ghép ba khối độc lập — điểm DRS gộp, phân tích AI theo học kỳ,
 * và danh sách nhận xét của từng lớp học phần. Mọi logic nghiệp vụ nằm trong
 * các component con, ở đây chỉ điều phối học kỳ đang chọn.
 */
export function EvaluationsTab({ studentId, user }: { studentId: string; user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [postSaveTerm, setPostSaveTerm] = useState('');
  const { data: currentTerm } = useCurrentTerm();

  const { data: evaluations, isLoading: evaluationsLoading } = useQuery({
    queryKey: ['evaluations', studentId],
    queryFn: () => apiFetch<Evaluation[]>(`/evaluations?studentId=${studentId}`),
  });
  const { data: enrollments } = useQuery({
    queryKey: ['enrollments', studentId],
    queryFn: () => apiFetch<Enrollment[]>(`/enrollments?studentId=${studentId}`),
  });

  const terms = uniqueTermsFromEnrollments(enrollments ?? []);

  useEffect(() => {
    if (!selectedTerm && terms.length > 0) {
      if (currentTerm?.code && terms.includes(currentTerm.code)) {
        setSelectedTerm(currentTerm.code);
      } else {
        setSelectedTerm(terms[0] ?? '');
      }
    }
  }, [selectedTerm, terms, currentTerm?.code]);

  // Giảng viên chỉ nhận xét lớp mình đứng lớp; vai quản lý thấy mọi lớp của kỳ.
  const seesAllSections = user.roles.some((role) =>
    ['HEAD_OF_DEPT', 'ADMIN'].includes(role),
  );
  const sections: ClassSection[] = (enrollments ?? [])
    .map((enrollment) => enrollment.classSection)
    .filter((section): section is ClassSection => Boolean(section))
    .filter((section) => section.term === selectedTerm)
    .filter((section) => seesAllSections || section.lecturerId === user.id);

  // Mỗi lớp học phần chỉ có một nhận xét của một giảng viên: giữ sẵn bản của
  // chính mình trong kỳ để form biết lúc nào là sửa thay vì tạo mới.
  const ownEvaluations = (evaluations ?? []).filter(
    (evaluation) =>
      evaluation.term === selectedTerm && evaluation.lecturer?.id === user.id,
  );

  const canCreate = user.roles.some((role) =>
    ['LECTURER', 'HEAD_OF_DEPT', 'ADMIN'].includes(role),
  );

  return (
    <>
      <RiskScorePanel studentId={studentId} term={selectedTerm} />

      <StudentAnalysisPanel
        studentId={studentId}
        terms={terms}
        selectedTerm={selectedTerm}
        onSelectTerm={(term) => {
          setSelectedTerm(term);
          setPostSaveTerm('');
        }}
        postSaveTerm={postSaveTerm}
        onDismissPostSave={() => setPostSaveTerm('')}
      />

      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Button
            type="button"
            onClick={() => setOpen(true)}
            disabled={terms.length === 0}
            data-testid="add-evaluation"
          >
            + Thêm nhận xét
          </Button>
        </div>
      ) : null}

      <EvaluationList items={evaluations ?? []} isLoading={evaluationsLoading} />

      <Modal
        title="Nhận xét sinh viên"
        size="lg"
        open={open}
        onClose={() => setOpen(false)}
      >
        <EvaluationForm
          studentId={studentId}
          term={selectedTerm}
          sections={sections}
          ownEvaluations={ownEvaluations}
          onSaved={(term) => {
            setOpen(false);
            setPostSaveTerm(term);
            setSelectedTerm(term);
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
