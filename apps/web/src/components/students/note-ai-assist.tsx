'use client';

import type { EvaluationCriterion } from '@fcare/shared-types';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';

/** Giãn cách giữa hai lần nhờ AI — khớp NOTE_DRAFT_COOLDOWN_MS phía API. */
const COOLDOWN_SECONDS = 30;

/** Dữ liệu đang nhập trên form; `null` khi chưa chọn lớp học phần. */
export interface NoteDraftRequest {
  classSectionId: string;
  term: string;
  academicScore: number;
  attitudeScore: number;
  absentSessions?: number;
  criteria: readonly EvaluationCriterion[];
}

interface NoteDraftResponse {
  note: string;
  cooldownSeconds: number;
}

export function cooldownRemaining(until: number | null, now: number): number {
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/** API trả "Vui lòng đợi N giây…" khi bấm dồn; không đọc được thì đợi đủ 30 giây. */
export function retryAfterSeconds(message: string): number {
  const match = /(\d+)\s*giây/.exec(message);
  return match ? Number(match[1]) : COOLDOWN_SECONDS;
}

export function noteAiButtonLabel({
  drafted,
  pending,
  remaining,
}: {
  drafted: boolean;
  pending: boolean;
  remaining: number;
}): string {
  if (pending) return 'AI đang viết…';
  if (!drafted) return 'Viết nhận xét với AI';
  return remaining > 0 ? `Tạo lại nhận xét (đợi ${remaining}s)` : 'Tạo lại nhận xét';
}

/** Đếm lùi theo giây tới `until`; dừng timer khi hết giờ. */
function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [until]);
  return cooldownRemaining(until, now);
}

interface NoteAiAssistProps {
  studentId: string;
  request: NoteDraftRequest | null;
  /** Nội dung ô nhận xét hiện tại — tự viết thì hỏi trước khi AI ghi đè. */
  currentNote: string;
  onDraft: (note: string) => void;
}

/**
 * Nút nhờ AI viết nháp ô "Nhận xét" từ điểm + tiêu chí đang chọn. Giảng viên
 * vẫn sửa được trước khi lưu. Sau mỗi lần tạo phải đợi 30 giây mới tạo lại —
 * chặn bấm dồn làm tốn lượt gọi AI; API cũng chặn riêng nên không lách được.
 */
export function NoteAiAssist({ studentId, request, currentNote, onDraft }: NoteAiAssistProps) {
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [lastDraft, setLastDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remaining = useCountdown(cooldownUntil);

  const draftMutation = useMutation({
    mutationFn: (body: NoteDraftRequest) =>
      apiFetch<NoteDraftResponse>(`/students/${studentId}/evaluation-note-draft`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      setLastDraft(result.note);
      setCooldownUntil(Date.now() + result.cooldownSeconds * 1000);
      onDraft(result.note);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'AI_NOTE_COOLDOWN') {
        setCooldownUntil(Date.now() + retryAfterSeconds(err.message) * 1000);
      }
      setError(
        err instanceof ApiError
          ? err.message
          : 'AI chưa viết được nhận xét. Vui lòng thử lại sau hoặc tự viết.',
      );
    },
  });

  const pending = draftMutation.isPending;
  const disabled = request === null || pending || remaining > 0;

  function requestDraft() {
    if (!request) return;
    const typedByUser = currentNote.trim() !== '' && currentNote !== lastDraft;
    if (typedByUser && !window.confirm('Thay nội dung bạn đang viết bằng nhận xét do AI soạn?')) {
      return;
    }
    draftMutation.mutate(request);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={requestDraft}
        disabled={disabled}
        aria-live="polite"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-fpt-orange/40 bg-fpt-orange-50 px-3 py-1.5 text-xs font-semibold text-fpt-orange-600 transition-colors duration-150 hover:border-fpt-orange hover:bg-fpt-orange/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange active:bg-fpt-orange/25 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
      >
        <span aria-hidden="true">✦</span>
        {noteAiButtonLabel({ drafted: lastDraft !== null, pending, remaining })}
      </button>
      {request === null ? (
        <p className="text-xs text-muted">Chọn lớp học phần để AI viết nhận xét.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
