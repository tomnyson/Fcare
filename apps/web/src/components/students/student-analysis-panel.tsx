'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import type {
  StudentAnalysisOutput,
  StudentTermAnalysisDetail,
  StudentTermAnalysisRecipientsPreview,
  StudentTermAnalysisSummary,
} from '../../lib/types';
import { FormError, Label, Select } from '../ui/form';
import {
  AnalysisDraftFields,
  blankEditableOutput,
  type EditableOutput,
} from './analysis-draft-fields';
import { careHistoryEntries } from './analysis-care-history';
import {
  AnalysisSendPrompt,
  type AnalysisContentSource,
} from './analysis-send-prompt';
import {
  ANALYSIS_RISK_LABELS,
  ANALYSIS_STATUS_LABELS,
  editableAnalysisOutput,
  parseEditableAnalysisOutput,
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
}

export function StudentAnalysisPanel({
  studentId,
  terms,
  selectedTerm,
  onSelectTerm,
  postSaveTerm,
  onDismissPostSave,
}: StudentAnalysisPanelProps) {
  const queryClient = useQueryClient();
  const [analysisError, setAnalysisError] = useState('');
  const [draftForm, setDraftForm] = useState<EditableOutput>(blankEditableOutput);
  const [confirmedLevel, setConfirmedLevel] = useState<number | null>(null);
  const [contentSource, setContentSource] = useState<AnalysisContentSource>('AI');
  const [lecturerNote, setLecturerNote] = useState('');
  const analysisRequestKey = useRef<string | null>(null);

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
      onDismissPostSave();
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

  async function invalidateVersion() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['student-term-analysis', studentId, selectedTerm],
      }),
      queryClient.invalidateQueries({
        queryKey: ['student-term-analysis-version', latestVersion?.id],
      }),
    ]);
  }

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
      await invalidateVersion();
    },
    onError: (err) =>
      setAnalysisError(err instanceof ApiError ? err.message : 'Không thể lưu bản nháp.'),
  });

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
    <section className="mb-6 rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink">Phân tích AI theo học kỳ</p>
          <p className="mt-1 text-sm text-muted">
            Nội dung AI chỉ mang tính hỗ trợ và phải được người duyệt chốt trước khi gửi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <Label htmlFor="analysisTerm">Học kỳ</Label>
            <Select
              id="analysisTerm"
              value={selectedTerm}
              onChange={(event) => {
                onSelectTerm(event.target.value);
                analysisRequestKey.current = null;
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
          Nhận xét đã được lưu cho học kỳ <strong>{postSaveTerm}</strong>. Hệ thống đang tổng hợp
          phân tích AI; sinh xong sẽ hỏi bạn có gửi cảnh báo hay không — không có cảnh báo nào tự
          gửi đi.
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

          {isDraft ? (
            <form
              className="mt-4 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveDraftMutation.mutate();
              }}
            >
              <AnalysisDraftFields value={draftForm} onChange={setDraftForm} />
              <div className="flex justify-end">
                <Button type="submit" disabled={saveDraftMutation.isPending}>
                  {saveDraftMutation.isPending ? 'Đang lưu…' : 'Lưu bản nháp'}
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
