'use client';

import { Button } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import type { AuthUser, ClassSection, Enrollment, Evaluation } from '../../lib/types';
import { useCurrentTerm } from '../../lib/use-current-term';
import { Modal } from '../ui/modal';
import { EvaluationForm } from './evaluation-form';
import { attendanceBySection } from '../../lib/evaluation-absence';
import { canEvaluateSection } from '../../lib/evaluation-access';
import { EvaluationList } from './evaluation-list';
import { RiskScorePanel } from './risk-score-panel';
import { uniqueTermsFromEnrollments } from './student-analysis-helpers';
import { StudentAnalysisPanel } from './student-analysis-panel';

/**
 * Tab nhận xét: ghép ba khối độc lập — danh sách nhận xét của từng lớp học
 * phần, điểm DRS gộp và phân tích AI theo học kỳ. Danh sách nhận xét đứng ĐẦU:
 * khối AI rất dài nên đặt dưới cùng thì vừa nhận xét xong phải cuộn cả trang mới
 * thấy. Mọi logic nghiệp vụ nằm trong các component con, ở đây chỉ điều phối
 * học kỳ đang chọn.
 */
/**
 * Yêu cầu mở form nhận xét cho đúng một lớp học phần (bấm "Nhận xét" ở tab
 * Học phần & điểm). `nonce` đổi mỗi lần bấm để bấm lại cùng lớp vẫn mở lại.
 */
export interface EvaluateRequest {
  term: string;
  sectionId: string;
  nonce: number;
}

export function EvaluationsTab({
  studentId,
  user,
  initialTerm = '',
  evaluateRequest,
}: {
  studentId: string;
  user: AuthUser;
  initialTerm?: string;
  evaluateRequest?: EvaluateRequest | null;
}) {
  const [open, setOpen] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState(evaluateRequest?.term || initialTerm);
  const [formSectionId, setFormSectionId] = useState('');
  const handledRequest = useRef<number | null>(null);
  const [postSaveTerm, setPostSaveTerm] = useState('');
  const { data: currentTerm } = useCurrentTerm();
  const analysisRef = useRef<HTMLDivElement>(null);

  const { data: evaluations, isLoading: evaluationsLoading } = useQuery({
    queryKey: ['evaluations', studentId],
    queryFn: () => apiFetch<Evaluation[]>(`/evaluations?studentId=${studentId}`),
  });
  const { data: enrollments } = useQuery({
    queryKey: ['enrollments', studentId],
    queryFn: () => apiFetch<Enrollment[]>(`/enrollments?studentId=${studentId}`),
  });

  const terms = uniqueTermsFromEnrollments(enrollments ?? []);

  // Chỉ mở modal khi đã có danh sách lớp: form khởi tạo lớp chọn sẵn và số buổi
  // vắng đúng một lần lúc mount, mở sớm thì form rỗng.
  useEffect(() => {
    if (!evaluateRequest || !enrollments) return;
    if (handledRequest.current === evaluateRequest.nonce) return;
    handledRequest.current = evaluateRequest.nonce;
    setSelectedTerm(evaluateRequest.term);
    setFormSectionId(evaluateRequest.sectionId);
    setOpen(true);
  }, [evaluateRequest, enrollments]);

  useEffect(() => {
    if ((!selectedTerm || !terms.includes(selectedTerm)) && terms.length > 0) {
      if (currentTerm?.code && terms.includes(currentTerm.code)) {
        setSelectedTerm(currentTerm.code);
      } else {
        setSelectedTerm(terms[0] ?? '');
      }
    }
  }, [selectedTerm, terms, currentTerm?.code]);

  // Giảng viên chỉ nhận xét lớp mình đứng lớp; vai quản lý thấy mọi lớp của kỳ.
  const sections: ClassSection[] = (enrollments ?? [])
    .map((enrollment) => enrollment.classSection)
    .filter((section): section is ClassSection => Boolean(section))
    .filter((section) => section.term === selectedTerm)
    .filter((section) => canEvaluateSection(user, section));

  // Mỗi lớp học phần chỉ có một nhận xét của một giảng viên: giữ sẵn bản của
  // chính mình trong kỳ để form biết lúc nào là sửa thay vì tạo mới.
  const ownEvaluations = (evaluations ?? []).filter(
    (evaluation) => evaluation.term === selectedTerm && evaluation.lecturer?.id === user.id,
  );

  const canCreate = user.roles.some((role) => ['LECTURER', 'HEAD_OF_DEPT', 'ADMIN'].includes(role));

  return (
    <>
      <section aria-labelledby="evaluations-heading" className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="evaluations-heading" className="text-base font-bold text-ink">
              Nhận xét của giảng viên
            </h2>
            <p className="text-sm text-muted">Mới nhất ở trên cùng — mỗi lớp học phần một dòng.</p>
          </div>
          {canCreate ? (
            <Button
              type="button"
              onClick={() => {
                setFormSectionId('');
                setOpen(true);
              }}
              disabled={terms.length === 0}
              data-testid="add-evaluation"
            >
              + Thêm nhận xét
            </Button>
          ) : null}
        </div>

        {postSaveTerm ? (
          <div
            role="status"
            className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-fpt-orange/30 bg-fpt-orange-50 px-4 py-3 text-sm text-ink"
          >
            <span>
              Đã lưu nhận xét học kỳ <strong>{postSaveTerm}</strong>. AI đang tổng hợp — bạn cần
              quyết định có gửi cảnh báo hay không.
            </span>
            <button
              type="button"
              onClick={() =>
                analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="rounded-md px-2 py-1 font-semibold text-fpt-orange-600 underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fpt-orange"
            >
              Xem phân tích &amp; quyết định gửi ↓
            </button>
          </div>
        ) : null}

        <EvaluationList items={evaluations ?? []} isLoading={evaluationsLoading} />
      </section>

      <RiskScorePanel studentId={studentId} term={selectedTerm} />

      <div ref={analysisRef} className="scroll-mt-4">
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
      </div>

      <Modal
        title="Nhận xét sinh viên"
        size="xl"
        scrollBody
        open={open}
        onClose={() => setOpen(false)}
      >
        <EvaluationForm
          studentId={studentId}
          term={selectedTerm}
          sections={sections}
          initialSectionId={formSectionId || undefined}
          ownEvaluations={ownEvaluations}
          systemAbsences={attendanceBySection(enrollments ?? [])}
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
