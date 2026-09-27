'use client';

import { Badge } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import type {
  StudentAnalysisOutput,
  StudentTermAnalysisDetail,
  StudentTermAnalysisRecipientsPreview,
  StudentTermAnalysisSummary,
} from '../../lib/types';
import { FormError, Label, Select } from '../ui/form';
import { blankEditableOutput, type EditableOutput } from './analysis-draft-fields';
import { AnalysisResultView } from './analysis-result-view';
import { careHistoryEntries } from './analysis-care-history';
import {
  AnalysisSendPrompt,
  type AnalysisContentSource,
} from './analysis-send-prompt';
import {
  ANALYSIS_RISK_LABELS,
  ANALYSIS_STATUS_LABELS,
  editableAnalysisOutput,
} from './student-analysis-helpers';
import { useAnalysisSend } from './use-analysis-send';

const ANALYSIS_STATUS_TONES = {
  QUEUED: 'info',
  GENERATING: 'info',
  DRAFT: 'warning',
  FAILED: 'danger',
  SUPERSEDED: 'neutral',
  SEND_QUEUED: 'info',
  SENT: 'success',
} as const;

const POLLING_STATUSES = ['QUEUED', 'GENERATING', 'SEND_QUEUED'];

function sectionTitle(output: StudentAnalysisOutput | null | undefined): string {
  if (!output) {
    return 'Chưa có kết quả';
  }
  return `Mức rủi ro ${ANALYSIS_RISK_LABELS[output.riskLevel]}`;
}

interface StudentAnalysisPanelProps {
  studentId: string;
  terms: string[];
  selectedTerm: string;
  onSelectTerm: (term: string) => void;
  /** Học kỳ vừa lưu nhận xét — báo cho người dùng biết hệ thống đang tự chạy AI cho kỳ đó. */
  postSaveTerm: string;
  onDismissPostSave: () => void;
  /** Badge cấp theo DRS, đặt cạnh bộ chọn học kỳ. */
  headerBadge?: ReactNode;
  /** Phần điểm DRS, đứng trước phần AI đề xuất trong cùng thẻ. */
  riskSlot?: ReactNode;
}

export function StudentAnalysisPanel({
  studentId,
  terms,
  selectedTerm,
  onSelectTerm,
  postSaveTerm,
  onDismissPostSave,
  headerBadge,
  riskSlot,
}: StudentAnalysisPanelProps) {
  const [analysisError, setAnalysisError] = useState('');
  const [draftForm, setDraftForm] = useState<EditableOutput>(blankEditableOutput);
  const [confirmedLevel, setConfirmedLevel] = useState<number | null>(null);
  const [contentSource, setContentSource] = useState<AnalysisContentSource>('AI');
  const [lecturerNote, setLecturerNote] = useState('');

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
      return status && POLLING_STATUSES.includes(status) ? 1_500 : false;
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
      return detail && POLLING_STATUSES.includes(detail.status) ? 1_500 : false;
    },
  });

  const analysisFeatureDisabled =
    summaryError instanceof ApiError && summaryError.code === 'AI_ANALYSIS_DISABLED';

  const { data: recipientsPreview, isFetching: recipientsLoading } = useQuery({
    queryKey: ['student-term-analysis-recipients', latestVersion?.id, confirmedLevel],
    queryFn: () =>
      apiFetch<StudentTermAnalysisRecipientsPreview>(
        `/term-analysis-versions/${latestVersion?.id}/recipients${
          confirmedLevel === null ? '' : `?level=${confirmedLevel}`
        }`,
      ),
    enabled: Boolean(latestVersion?.id && analysisSummary?.canManage),
  });

  const systemLevel = recipientsPreview?.systemLevel ?? 1;

  useEffect(() => {
    setDraftForm(
      analysisDetail?.editedOutput
        ? editableAnalysisOutput(analysisDetail.editedOutput)
        : blankEditableOutput(),
    );
  }, [analysisDetail]);

  useEffect(() => {
    // Mặc định gửi đúng cấp hệ thống tính; người duyệt chỉ chỉnh khi muốn nâng.
    setConfirmedLevel((current) => current ?? recipientsPreview?.systemLevel ?? null);
  }, [recipientsPreview?.systemLevel]);

  useEffect(() => {
    setConfirmedLevel(null);
    setContentSource('AI');
    setLecturerNote('');
  }, [latestVersion?.id]);

  const { sendMutation, dismissMutation } = useAnalysisSend({
    studentId,
    term: selectedTerm,
    versionId: latestVersion?.id ?? null,
    draftForm,
    level: confirmedLevel ?? systemLevel,
    contentSource,
    lecturerNote,
    recipientCount: recipientsPreview?.recipients.length ?? 0,
    onError: setAnalysisError,
  });

  /** Chuyển sang tự soạn thì mồi sẵn bản AI để giảng viên sửa thay vì gõ lại. */
  function changeContentSource(next: AnalysisContentSource) {
    setContentSource(next);
    if (next === 'LECTURER' && lecturerNote.trim().length === 0) {
      setLecturerNote(analysisDetail?.editedOutput?.notificationSummary ?? '');
    }
  }

  if (analysisFeatureDisabled) {
    return null;
  }

  const isDraft = Boolean(analysisDetail?.editedOutput) && latestVersion?.status === 'DRAFT';
  // Bản vừa sinh sau nhận xét và chưa ai quyết định: hiện như lời gợi ý có kèm "Không gửi".
  const promptMode = Boolean(
    isDraft && analysisDetail?.needsSendDecision && !analysisDetail?.dismissedAt,
  );
  const aiSummary = analysisDetail?.editedOutput?.notificationSummary ?? '';
  const careHistory = careHistoryEntries(analysisDetail?.sourceSnapshot);

  return (
    <section
      aria-labelledby="risk-review-heading"
      className="mb-6 rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="risk-review-heading" className="text-base font-bold text-ink">
            Đánh giá rủi ro — học kỳ {selectedTerm || '—'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Cấp theo DRS do hệ thống tính; AI chỉ đề xuất và phải được người duyệt chốt trước khi
            gửi.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {headerBadge ? <div className="self-center">{headerBadge}</div> : null}
          <div>
            <Label htmlFor="analysisTerm">Học kỳ</Label>
            <Select
              id="analysisTerm"
              value={selectedTerm}
              onChange={(event) => {
                onSelectTerm(event.target.value);
                onDismissPostSave();
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
        </div>
      </div>

      {postSaveTerm ? (
        <div className="mt-4 rounded-lg border border-fpt-orange/30 bg-fpt-orange-50 px-4 py-3 text-sm text-ink">
          Nhận xét đã được lưu cho học kỳ <strong>{postSaveTerm}</strong>. Hệ thống đang tổng hợp
          phân tích AI; sinh xong sẽ hỏi bạn có gửi cảnh báo hay không — không có cảnh báo nào tự
          gửi đi.
        </div>
      ) : null}

      {riskSlot ? <div className="mt-5 border-t border-border pt-4">{riskSlot}</div> : null}

      <FormError>{analysisError}</FormError>

      <h3 className="mt-5 border-t border-border pt-4 text-sm font-semibold text-ink">
        AI đề xuất
      </h3>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1.3fr,0.7fr]">
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
              Chưa có đề xuất AI cho học kỳ này. AI tự tổng hợp sau khi giảng viên lưu nhận xét
              — không cần bấm tạo.
            </p>
          ) : null}

          {latestVersion?.errorMessage ? (
            <p className="mt-3 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {latestVersion.errorMessage}
            </p>
          ) : null}

          {analysisDetail?.editedOutput ? (
            <AnalysisResultView output={analysisDetail.editedOutput} />
          ) : null}
        </div>

        {isDraft ? (
          <AnalysisSendPrompt
            promptMode={promptMode}
            systemLevel={systemLevel}
            forced={analysisDetail?.editedOutput?.forcedEscalation ?? null}
            level={confirmedLevel ?? systemLevel}
            onLevelChange={setConfirmedLevel}
            contentSource={contentSource}
            onContentSourceChange={changeContentSource}
            aiSummary={aiSummary}
            lecturerNote={lecturerNote}
            onLecturerNoteChange={setLecturerNote}
            careHistory={careHistory}
            recipients={recipientsPreview?.recipients ?? []}
            recipientsLoading={recipientsLoading}
            isSending={sendMutation.isPending}
            isDismissing={dismissMutation.isPending}
            onSend={() => sendMutation.mutate()}
            onDismiss={() => dismissMutation.mutate()}
          />
        ) : (
          <div className="rounded-lg border border-border bg-slate-50 p-4">
            <p className="text-sm font-semibold text-ink">Người nhận</p>
            <p className="mt-1 text-sm text-muted">
              Snapshot người nhận được chốt tại thời điểm gửi theo ma trận độ khẩn.
            </p>
            {(recipientsPreview?.recipients ?? []).length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                {selectedTerm
                  ? 'Chưa có danh sách người nhận cho học kỳ này.'
                  : 'Chọn học kỳ để xem trước người nhận.'}
              </p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {(recipientsPreview?.recipients ?? []).map((recipient) => (
                  <li
                    key={recipient.id}
                    className="rounded-lg border border-border bg-white px-3 py-2"
                  >
                    <p className="font-medium text-ink">{recipient.fullName}</p>
                    <p className="text-muted">{recipient.staffCode}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
