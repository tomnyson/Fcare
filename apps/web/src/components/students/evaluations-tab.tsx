'use client';

import { ISSUE_GROUPS } from '@fcare/shared-types';
import { Badge, Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Play } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/labels';
import type {
  AuthUser,
  Enrollment,
  Evaluation,
  StudentAnalysisOutput,
  StudentTermAnalysisDetail,
  StudentTermAnalysisRecipientPreview,
  StudentTermAnalysisSummary,
} from '../../lib/types';
import { DataTable, Td } from '../ui/data-table';
import { FormError, Input, Label, Select, Textarea } from '../ui/form';
import { Modal } from '../ui/modal';
import { EvaluationGuidanceCell, EvaluationGuidancePanel } from './evaluation-guidance';
import {
  ANALYSIS_RISK_LABELS,
  ANALYSIS_STATUS_LABELS,
  editableAnalysisOutput,
  parseEditableAnalysisOutput,
  uniqueTermsFromEnrollments,
} from './student-analysis-helpers';

/** Nhãn nhóm vấn đề lấy từ tài liệu nghiệp vụ (`@fcare/shared-types`) — không
 * tự đặt lại tên nhóm ở tầng UI. */
function issueGroupShortLabel(value: number): string {
  return ISSUE_GROUPS.find((group) => group.value === value)?.shortLabel ?? `Nhóm ${value}`;
}

/** Điểm mặc định của form thêm đánh giá — giữa thang 1-10. */
const DEFAULT_SCORE = 5;

const ANALYSIS_STATUS_TONES = {
  QUEUED: 'info',
  GENERATING: 'info',
  DRAFT: 'warning',
  FAILED: 'danger',
  SUPERSEDED: 'neutral',
  SEND_QUEUED: 'info',
  SENT: 'success',
} as const;

type EditableOutput = ReturnType<typeof editableAnalysisOutput>;

function blankEditableOutput(): EditableOutput {
  return {
    riskLevel: 'LOW',
    summary: '',
    strengths: '',
    trends: '',
    riskFactors: '',
    recommendations: '',
    notificationSummary: '',
    dataLimitations: '',
  };
}

function sectionTitle(output: StudentAnalysisOutput | null | undefined): string {
  if (!output) {
    return 'Chưa có kết quả';
  }
  return `Mức rủi ro ${ANALYSIS_RISK_LABELS[output.riskLevel]}`;
}

export function EvaluationsTab({ studentId, user }: { studentId: string; user: AuthUser }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [error, setError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [postSaveTerm, setPostSaveTerm] = useState('');
  const [draftForm, setDraftForm] = useState<EditableOutput>(blankEditableOutput);
  const [academicScore, setAcademicScore] = useState(DEFAULT_SCORE);
  const [attitudeScore, setAttitudeScore] = useState(DEFAULT_SCORE);
  const [issueGroup, setIssueGroup] = useState<number | null>(null);
  const analysisRequestKey = useRef<string | null>(null);

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
      setSelectedTerm(terms[0] ?? '');
    }
  }, [selectedTerm, terms]);

  useEffect(() => {
    analysisRequestKey.current = null;
  }, [selectedTerm]);

  const {
    data: analysisSummary,
    isFetching: summaryLoading,
    error: summaryError,
  } = useQuery({
    queryKey: ['student-term-analysis', studentId, selectedTerm],
    queryFn: () =>
      apiFetch<StudentTermAnalysisSummary | null>(
        `/students/${studentId}/term-analyses?term=${encodeURIComponent(selectedTerm)}`,
      ),
    enabled: selectedTerm.length > 0,
    retry: (attempt, err) =>
      !(err instanceof ApiError && err.code === 'AI_ANALYSIS_DISABLED') && attempt < 2,
    refetchInterval: (query) => {
      const summary = query.state.data as StudentTermAnalysisSummary | null | undefined;
      const status = summary?.versions[0]?.status;
      return status && ['QUEUED', 'GENERATING', 'SEND_QUEUED'].includes(status) ? 1_500 : false;
    },
  });

  const latestVersion = analysisSummary?.versions[0] ?? null;

  const { data: analysisDetail, isFetching: detailLoading } = useQuery({
    queryKey: ['student-term-analysis-version', latestVersion?.id],
    queryFn: () =>
      apiFetch<StudentTermAnalysisDetail>(`/term-analysis-versions/${latestVersion?.id}`),
    enabled: Boolean(latestVersion?.id),
    refetchInterval: (query) => {
      const detail = query.state.data as StudentTermAnalysisDetail | undefined;
      return detail && ['QUEUED', 'GENERATING', 'SEND_QUEUED'].includes(detail.status)
        ? 1_500
        : false;
    },
  });

  const analysisFeatureDisabled =
    summaryError instanceof ApiError && summaryError.code === 'AI_ANALYSIS_DISABLED';

  const { data: recipients } = useQuery({
    queryKey: ['student-term-analysis-recipients', latestVersion?.id],
    queryFn: () =>
      apiFetch<StudentTermAnalysisRecipientPreview[]>(
        `/term-analysis-versions/${latestVersion?.id}/recipients`,
      ),
    enabled: Boolean(latestVersion?.id && analysisSummary?.canManage),
  });

  useEffect(() => {
    if (analysisDetail?.editedOutput) {
      setDraftForm(editableAnalysisOutput(analysisDetail.editedOutput));
    } else {
      setDraftForm(blankEditableOutput());
    }
  }, [analysisDetail]);

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<Evaluation>('/evaluations', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async (_, variables) => {
      const term = String((variables as { term?: string }).term ?? '');
      setOpen(false);
      setError('');
      toast.success('Lưu đánh giá thành công!');
      setPostSaveTerm(term);
      if (term) {
        setSelectedTerm(term);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['evaluations', studentId] }),
        queryClient.invalidateQueries({ queryKey: ['enrollments', studentId] }),
      ]);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra.'),
  });

  const createAnalysisMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/students/${studentId}/term-analyses`, {
        method: 'POST',
        body: JSON.stringify({
          term: selectedTerm,
          idempotencyKey: (analysisRequestKey.current ??= crypto.randomUUID()),
        }),
      }),
    onSuccess: async () => {
      analysisRequestKey.current = null;
      setAnalysisError('');
      setPostSaveTerm('');
      toast.success('Tạo phân tích AI thành công!');
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['student-term-analysis', studentId, selectedTerm],
        }),
        queryClient.invalidateQueries({ queryKey: ['student-term-analysis-version'] }),
      ]);
    },
    onError: (err) =>
      setAnalysisError(err instanceof ApiError ? err.message : 'Không thể tạo phân tích AI.'),
  });

  const saveDraftMutation = useMutation({
    mutationFn: () => {
      if (!latestVersion?.id) {
        throw new Error('Thiếu version để lưu.');
      }
      return apiFetch(`/term-analysis-versions/${latestVersion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ editedOutput: parseEditableAnalysisOutput(draftForm) }),
      });
    },
    onSuccess: async () => {
      setAnalysisError('');
      toast.success('Đã lưu bản nháp.');
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['student-term-analysis', studentId, selectedTerm],
        }),
        queryClient.invalidateQueries({
          queryKey: ['student-term-analysis-version', latestVersion?.id],
        }),
      ]);
    },
    onError: (err) =>
      setAnalysisError(err instanceof ApiError ? err.message : 'Không thể lưu bản nháp.'),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!latestVersion?.id) {
        throw new Error('Thiếu version để gửi.');
      }
      if (
        !window.confirm(
          'Gửi bản phân tích này tới toàn bộ giảng viên đang dạy sinh viên trong học kỳ đã chọn?',
        )
      ) {
        return null;
      }
      await apiFetch(`/term-analysis-versions/${latestVersion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ editedOutput: parseEditableAnalysisOutput(draftForm) }),
      });
      return apiFetch(`/term-analysis-versions/${latestVersion.id}/send`, { method: 'POST' });
    },
    onSuccess: async () => {
      setAnalysisError('');
      toast.success('Đã gửi đánh giá thành công!');
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['student-term-analysis', studentId, selectedTerm],
        }),
        queryClient.invalidateQueries({
          queryKey: ['student-term-analysis-version', latestVersion?.id],
        }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'STALE_ANALYSIS') {
        setAnalysisError('Dữ liệu học tập đã thay đổi. Hãy tạo version AI mới trước khi gửi.');
        return;
      }
      if (err instanceof ApiError && err.code === 'NO_RECIPIENTS') {
        setAnalysisError('Không có giảng viên nào phù hợp để nhận bản phân tích này.');
        return;
      }
      setAnalysisError(err instanceof ApiError ? err.message : 'Không thể gửi phân tích.');
    },
  });

  const canCreate = user.roles.some((role) => ['LECTURER', 'HEAD_OF_DEPT', 'ADMIN'].includes(role));

  function openCreateModal() {
    // Mở form là một lượt nhập mới: trả điểm và nhóm vấn đề về mặc định để
    // panel gợi ý không nói về sinh viên/lần nhập trước.
    setAcademicScore(DEFAULT_SCORE);
    setAttitudeScore(DEFAULT_SCORE);
    setIssueGroup(null);
    setError('');
    setOpen(true);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createMutation.mutate({
      studentId,
      term: form.get('term'),
      academicScore,
      attitudeScore,
      ...(issueGroup === null ? {} : { issueGroup }),
      ...(form.get('note') ? { note: form.get('note') } : {}),
    });
  }

  return (
    <>
      {!analysisFeatureDisabled ? (
        <section className="mb-6 rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">Phân tích AI theo học kỳ</p>
              <p className="mt-1 text-sm text-muted">
                Nội dung AI chỉ mang tính hỗ trợ và đã được giảng viên duyệt.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <Label htmlFor="analysisTerm">Học kỳ</Label>
                <Select
                  id="analysisTerm"
                  value={selectedTerm}
                  onChange={(event) => {
                    setSelectedTerm(event.target.value);
                    analysisRequestKey.current = null;
                    setPostSaveTerm('');
                    setAnalysisError('');
                  }}
                  disabled={terms.length === 0}
                >
                  {terms.length === 0 ? <option value="">Chưa có học phần</option> : null}
                  {terms.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                type="button"
                disabled={!selectedTerm || createAnalysisMutation.isPending}
                onClick={() => createAnalysisMutation.mutate()}
              >
                {createAnalysisMutation.isPending ? 'Đang tạo…' : 'Tạo / cập nhật AI'}
              </Button>
            </div>
          </div>

          {postSaveTerm ? (
            <div className="mt-4 rounded-lg border border-fpt-orange/30 bg-fpt-orange-50 px-4 py-3 text-sm text-ink">
              Đánh giá đã được lưu cho học kỳ <strong>{postSaveTerm}</strong>. Bạn có thể tạo hoặc
              cập nhật phân tích AI ngay bây giờ.
            </div>
          ) : null}

          <FormError>{analysisError}</FormError>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr,0.7fr]">
            <div className="rounded-lg border border-border bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold text-ink">
                  {sectionTitle(analysisDetail?.editedOutput ?? null)}
                </p>
                {latestVersion ? (
                  <Badge tone={ANALYSIS_STATUS_TONES[latestVersion.status]}>
                    {ANALYSIS_STATUS_LABELS[latestVersion.status]}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Chưa có version</Badge>
                )}
              </div>

              {summaryLoading || detailLoading ? (
                <p className="mt-3 text-sm text-muted">Đang tải trạng thái phân tích…</p>
              ) : null}

              {!latestVersion && !summaryLoading ? (
                <p className="mt-3 text-sm text-muted">
                  Chọn học kỳ rồi bấm “Tạo / cập nhật AI” để khởi tạo version phân tích đầu tiên.
                </p>
              ) : null}

              {latestVersion?.errorMessage ? (
                <p className="mt-3 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                  {latestVersion.errorMessage}
                </p>
              ) : null}

              {analysisDetail?.editedOutput && latestVersion?.status === 'DRAFT' ? (
                <form
                  className="mt-4 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveDraftMutation.mutate();
                  }}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="riskLevel">Mức rủi ro</Label>
                      <Select
                        id="riskLevel"
                        value={draftForm.riskLevel}
                        onChange={(event) =>
                          setDraftForm((current) => ({
                            ...current,
                            riskLevel: event.target.value as EditableOutput['riskLevel'],
                          }))
                        }
                      >
                        {Object.entries(ANALYSIS_RISK_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="notificationSummary">Tóm tắt thông báo</Label>
                      <Input
                        id="notificationSummary"
                        value={draftForm.notificationSummary}
                        onChange={(event) =>
                          setDraftForm((current) => ({
                            ...current,
                            notificationSummary: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="summary">Tóm tắt phân tích</Label>
                    <Textarea
                      id="summary"
                      value={draftForm.summary}
                      onChange={(event) =>
                        setDraftForm((current) => ({ ...current, summary: event.target.value }))
                      }
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="strengths">Điểm mạnh (mỗi dòng 1 ý)</Label>
                      <Textarea
                        id="strengths"
                        value={draftForm.strengths}
                        onChange={(event) =>
                          setDraftForm((current) => ({ ...current, strengths: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="recommendations">Khuyến nghị (mỗi dòng 1 ý)</Label>
                      <Textarea
                        id="recommendations"
                        value={draftForm.recommendations}
                        onChange={(event) =>
                          setDraftForm((current) => ({
                            ...current,
                            recommendations: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="trends">Xu hướng (`finding | evidence` mỗi dòng)</Label>
                      <Textarea
                        id="trends"
                        value={draftForm.trends}
                        onChange={(event) =>
                          setDraftForm((current) => ({ ...current, trends: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="riskFactors">
                        Yếu tố rủi ro (`finding | evidence` mỗi dòng)
                      </Label>
                      <Textarea
                        id="riskFactors"
                        value={draftForm.riskFactors}
                        onChange={(event) =>
                          setDraftForm((current) => ({
                            ...current,
                            riskFactors: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="dataLimitations">Giới hạn dữ liệu (mỗi dòng 1 ý)</Label>
                    <Textarea
                      id="dataLimitations"
                      value={draftForm.dataLimitations}
                      onChange={(event) =>
                        setDraftForm((current) => ({
                          ...current,
                          dataLimitations: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="flex flex-wrap justify-end gap-3">
                    <Button type="submit" disabled={saveDraftMutation.isPending}>
                      {saveDraftMutation.isPending ? 'Đang lưu…' : 'Lưu bản nháp'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={sendMutation.isPending}
                      onClick={() => sendMutation.mutate()}
                    >
                      {sendMutation.isPending ? 'Đang gửi…' : 'Duyệt và gửi'}
                    </Button>
                  </div>
                </form>
              ) : null}

              {analysisDetail?.aiOriginal ? (
                <details className="mt-4 rounded-lg border border-border bg-white px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">
                    Xem bản gốc AI
                  </summary>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted">
                    {JSON.stringify(analysisDetail.aiOriginal, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>

            <div className="rounded-lg border border-border bg-slate-50 p-4">
              <p className="text-sm font-semibold text-ink">Giảng viên sẽ nhận</p>
              <p className="mt-1 text-sm text-muted">
                Snapshot người nhận được chốt tại thời điểm gửi.
              </p>

              {(recipients ?? []).length === 0 ? (
                <p className="mt-4 text-sm text-muted">
                  {selectedTerm
                    ? 'Chưa có danh sách người nhận cho học kỳ này.'
                    : 'Chọn học kỳ để xem trước người nhận.'}
                </p>
              ) : (
                <ul className="mt-4 space-y-2 text-sm">
                  {(recipients ?? []).map((recipient) => (
                    <li
                      key={recipient.id}
                      className="rounded-lg border border-border bg-white px-3 py-2"
                    >
                      <p className="font-medium text-ink">{recipient.fullName}</p>
                      <p className="text-muted">{recipient.staffCode}</p>
                      {recipient.openedAt ? (
                        <p className="mt-1 text-xs text-muted">
                          Đã mở lúc {formatDateTime(recipient.openedAt)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Button type="button" onClick={openCreateModal} disabled={terms.length === 0}>
            + Thêm đánh giá
          </Button>
        </div>
      ) : null}

      <DataTable
        headers={[
          'Học kỳ',
          'Học lực (1-10)',
          'Thái độ (1-10)',
          'Nhóm vấn đề',
          'Gợi ý & độ khẩn đề xuất',
          'Ghi chú',
          'Người đánh giá',
          'Thời điểm',
        ]}
        isLoading={evaluationsLoading}
        skeletonRows={5}
        isEmpty={!evaluationsLoading && (evaluations?.length ?? 0) === 0}
        emptyMessage="Chưa có đánh giá nào."
      >
        {(evaluations ?? []).map((evaluation) => (
          <tr key={evaluation.id}>
            <Td className="font-semibold">{evaluation.term}</Td>
            <Td>{evaluation.academicScore}</Td>
            <Td>{evaluation.attitudeScore}</Td>
            <Td className="whitespace-normal">
              {evaluation.issueGroup ? issueGroupShortLabel(evaluation.issueGroup) : '—'}
            </Td>
            <Td>
              <EvaluationGuidanceCell
                scores={{
                  academicScore: evaluation.academicScore,
                  attitudeScore: evaluation.attitudeScore,
                  issueGroup: evaluation.issueGroup,
                }}
              />
            </Td>
            <Td className="max-w-72 whitespace-normal">{evaluation.note ?? '—'}</Td>
            <Td>{evaluation.lecturer?.fullName ?? '—'}</Td>
            <Td className="text-muted">{formatDateTime(evaluation.createdAt)}</Td>
          </tr>
        ))}
      </DataTable>

      <Modal title="Thêm đánh giá sinh viên" open={open} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormError>{error}</FormError>
          <div>
            <Label htmlFor="term">Học kỳ</Label>
            <Select id="term" name="term" defaultValue={selectedTerm} required>
              <option value="" disabled>
                Chọn học kỳ
              </option>
              {terms.map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="academicScore">Điểm học lực (1-10)</Label>
              <Input
                id="academicScore"
                name="academicScore"
                type="number"
                min={1}
                max={10}
                required
                value={academicScore}
                onChange={(event) => setAcademicScore(Number(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="attitudeScore">Điểm thái độ (1-10)</Label>
              <Input
                id="attitudeScore"
                name="attitudeScore"
                type="number"
                min={1}
                max={10}
                required
                value={attitudeScore}
                onChange={(event) => setAttitudeScore(Number(event.target.value))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="issueGroup">Nhóm vấn đề cần can thiệp</Label>
            <Select
              id="issueGroup"
              name="issueGroup"
              value={issueGroup === null ? '' : String(issueGroup)}
              onChange={(event) =>
                setIssueGroup(event.target.value === '' ? null : Number(event.target.value))
              }
            >
              <option value="">Không có</option>
              {ISSUE_GROUPS.map((group) => (
                <option key={group.value} value={group.value}>
                  {group.label}
                </option>
              ))}
            </Select>
          </div>

          <EvaluationGuidancePanel
            scores={{ academicScore, attitudeScore, issueGroup }}
            showHandoffHint
          />
          <div>
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea id="note" name="note" placeholder="Nhận xét chi tiết…" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Đang lưu…' : 'Lưu đánh giá'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
