'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { describeRaiseResult, type RaiseAlertResult } from '../../lib/raise-result';
import { FormError, FormSuccess, Textarea } from '../ui/form';
import { SuggestedLevelBadge } from './evaluation-guidance';

interface RaiseAlertInput {
  studentId: string;
  level: number;
  reason: string;
  classSectionId?: string;
}

/** Thân `POST /alerts`: kèm lớp học phần vừa nhận xét để cảnh báo có liên kết lớp. */
export function raiseAlertBody({ classSectionId, ...rest }: RaiseAlertInput): RaiseAlertInput {
  return classSectionId ? { ...rest, classSectionId } : rest;
}

/**
 * Phát cảnh báo từ nhận xét rồi kích hoạt AI tổng hợp học kỳ. AI chưa bật trên
 * hệ thống thì bỏ qua — cảnh báo đã phát là đủ, không làm hỏng luồng lưu.
 * Trả kết quả API để báo đúng việc đã xảy ra: tạo mới, nâng mức hay chỉ gộp lý do.
 */
export async function raiseEvaluationAlert(
  input: RaiseAlertInput & { term: string },
): Promise<RaiseAlertResult> {
  const { term, ...alert } = input;
  const result = await apiFetch<RaiseAlertResult>('/alerts', {
    method: 'POST',
    body: JSON.stringify(raiseAlertBody(alert)),
  });
  try {
    await apiFetch(`/students/${alert.studentId}/term-analyses`, {
      method: 'POST',
      body: JSON.stringify({ term, idempotencyKey: crypto.randomUUID() }),
    });
  } catch {
    // AI chưa được kích hoạt — không chặn việc phát cảnh báo.
  }
  return result;
}

interface AlertReasonInput {
  term: string;
  criterionLabels: readonly string[];
  note?: string;
  suggestedLevel: number;
  academicDescription: string;
  attitudeDescription: string;
}

/** Lý do cảnh báo tự sinh từ nhận xét — dùng chung cho bước tiếp theo và nút "Phát cảnh báo" trong form. */
export function buildAlertReason({
  term,
  criterionLabels,
  note,
  suggestedLevel,
  academicDescription,
  attitudeDescription,
}: AlertReasonInput): string {
  const parts = [
    `Nhận xét DRS học kỳ ${term}:`,
    criterionLabels.length > 0 ? `Tiêu chí ghi nhận: ${criterionLabels.join(', ')}.` : '',
    note?.trim() ? `Ghi chú GV: ${note.trim()}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Cảnh báo mức 4 khẩn cấp yêu cầu tối thiểu 40 ký tự
  if (suggestedLevel === 4 && parts.length < 40) {
    return `${parts} Khả năng học tập: ${academicDescription}. Thái độ: ${attitudeDescription}.`;
  }
  return parts;
}

interface EvaluationHandoffStepProps {
  studentId: string;
  term: string;
  /** Lớp học phần của nhận xét vừa lưu — cảnh báo phát ra gắn lớp này. */
  classSectionId?: string;
  suggestedLevel: number;
  criterionLabels: readonly string[];
  note?: string;
  academicDescription: string;
  attitudeDescription: string;
  lecturerActions: readonly string[];
  studentAffairsActions: readonly string[];
  /** Lỗi mang sang từ form (vd. tự phát cảnh báo khi lưu thất bại). */
  initialError?: string | null;
  onComplete: () => void;
}

export function EvaluationHandoffStep({
  studentId,
  term,
  classSectionId,
  suggestedLevel,
  criterionLabels,
  note,
  academicDescription,
  attitudeDescription,
  lecturerActions,
  studentAffairsActions,
  initialError = null,
  onComplete,
}: EvaluationHandoffStepProps) {
  const queryClient = useQueryClient();

  const defaultReason = useMemo(
    () =>
      buildAlertReason({
        term,
        criterionLabels,
        note,
        suggestedLevel,
        academicDescription,
        attitudeDescription,
      }),
    [term, criterionLabels, note, suggestedLevel, academicDescription, attitudeDescription],
  );

  const [reason, setReason] = useState(defaultReason);
  const [showEditReason, setShowEditReason] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(initialError);

  // Mutation 1: Phát cảnh báo + Kích hoạt AI phân tích
  const raiseAlertAndAiMutation = useMutation({
    mutationFn: async () => {
      setActionError(null);
      return raiseEvaluationAlert({
        studentId,
        term,
        level: suggestedLevel,
        reason: reason.trim() || defaultReason,
        classSectionId,
      });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['student-term-analysis'] }),
        queryClient.invalidateQueries({ queryKey: ['students'] }),
      ]);
      setActionNotice(
        `${describeRaiseResult(result).text.replace(/\.$/, '')} và kích hoạt tổng hợp AI.`,
      );
      setTimeout(() => onComplete(), 1200);
    },
    onError: (err) => {
      setActionError(
        err instanceof ApiError ? err.message : 'Không thể phát cảnh báo. Vui lòng thử lại.',
      );
    },
  });

  // Mutation 2: Chỉ kích hoạt AI phân tích
  const aiOnlyMutation = useMutation({
    mutationFn: async () => {
      setActionError(null);
      await apiFetch(`/students/${studentId}/term-analyses`, {
        method: 'POST',
        body: JSON.stringify({
          term,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student-term-analysis'] });
      setActionNotice('Đã gửi yêu cầu AI phân tích học kỳ.');
      setTimeout(() => onComplete(), 1000);
    },
    onError: (err) => {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Không thể tạo phân tích AI (chức năng AI có thể chưa được kích hoạt trên hệ thống).',
      );
    },
  });

  const isPending = raiseAlertAndAiMutation.isPending || aiOnlyMutation.isPending;

  return (
    <div className="space-y-4 py-1">
      {/* Thông báo đã lưu nhận xét */}
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
        <span className="text-base font-bold">✓</span>
        <span>
          Đã lưu nhận xét cho học kỳ <strong>{term}</strong>.
        </span>
        <span className="ml-auto">
          <SuggestedLevelBadge level={suggestedLevel} />
        </span>
      </div>

      {/* Khối đề xuất bước tiếp theo */}
      <div className="rounded-lg border border-fpt-orange/30 bg-fpt-orange-50/50 p-4">
        <h3 className="font-semibold text-ink">Đề xuất bước xử lý tiếp theo</h3>
        <p className="mt-1 text-xs text-muted">
          Dựa trên đánh giá của bạn, sinh viên này thuộc diện nguy cơ cần được can thiệp sớm. Để
          tiết kiệm thời gian chuyển trang, bạn có thể thực hiện nhanh các bước dưới đây:
        </p>

        {criterionLabels.length > 0 ? (
          <div className="mt-3">
            <span className="text-xs font-semibold text-muted">Vấn đề ghi nhận:</span>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {criterionLabels.map((label) => (
                <li
                  key={label}
                  className="rounded-full border border-border bg-white px-2.5 py-0.5 text-xs text-ink shadow-sm"
                >
                  {label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Nội dung lý do cảnh báo dự kiến */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-muted">Lý do cảnh báo gửi kèm:</span>
            <button
              type="button"
              onClick={() => setShowEditReason(!showEditReason)}
              className="text-fpt-blue hover:underline"
            >
              {showEditReason ? 'Thu gọn' : 'Chỉnh sửa lý do'}
            </button>
          </div>

          {showEditReason ? (
            <Textarea
              className="mt-1.5 text-xs"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do cảnh báo..."
            />
          ) : (
            <p className="mt-1 line-clamp-2 rounded bg-white/70 p-2 text-xs italic text-ink">
              &quot;{reason}&quot;
            </p>
          )}
        </div>

        {/* Khuyến nghị hành động */}
        <div className="mt-3 grid gap-2 border-t border-border/60 pt-3 text-xs sm:grid-cols-2">
          {lecturerActions.length > 0 ? (
            <div>
              <span className="font-bold text-ink">Giảng viên nên làm:</span>
              <ul className="mt-1 list-disc pl-4 text-muted">
                {lecturerActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {studentAffairsActions.length > 0 ? (
            <div>
              <span className="font-bold text-ink">Phòng CTSV nên làm:</span>
              <ul className="mt-1 list-disc pl-4 text-muted">
                {studentAffairsActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {actionError ? <FormError>{actionError}</FormError> : null}
      {actionNotice ? <FormSuccess>{actionNotice}</FormSuccess> : null}

      {/* Các nút hành động 1-click */}
      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={onComplete}
          className="text-xs text-muted hover:text-ink"
        >
          Hoàn tất — Chỉ lưu nhận xét
        </Button>

        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => aiOnlyMutation.mutate()}
          className="text-xs"
        >
          {aiOnlyMutation.isPending ? 'Đang gửi AI…' : 'Chỉ cập nhật phân tích AI'}
        </Button>

        <Button
          type="button"
          disabled={isPending}
          onClick={() => raiseAlertAndAiMutation.mutate()}
          className="text-xs font-semibold"
        >
          {raiseAlertAndAiMutation.isPending
            ? 'Đang phát cảnh báo…'
            : `Phát cảnh báo Mức ${suggestedLevel} & Chạy AI`}
        </Button>
      </div>
    </div>
  );
}
