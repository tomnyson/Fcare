'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../../lib/api';
import type { AnalysisContentSource } from './analysis-send-prompt';
import { parseEditableAnalysisOutput } from './student-analysis-helpers';
import type { EditableOutput } from './analysis-draft-fields';

interface UseAnalysisSendInput {
  studentId: string;
  term: string;
  versionId: string | null;
  draftForm: EditableOutput;
  level: number;
  contentSource: AnalysisContentSource;
  lecturerNote: string;
  recipientCount: number;
  onError: (message: string) => void;
}

/**
 * Hai quyết định sau khi AI sinh xong bản nháp: gửi cảnh báo (kèm nội dung AI
 * hoặc nội dung giảng viên tự soạn) hay bỏ qua. Tách khỏi panel để phần hiển
 * thị không phải gánh thêm logic gọi API.
 */
export function useAnalysisSend({
  studentId,
  term,
  versionId,
  draftForm,
  level,
  contentSource,
  lecturerNote,
  recipientCount,
  onError,
}: UseAnalysisSendInput) {
  const queryClient = useQueryClient();

  async function invalidateAfterDecision() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['student-term-analysis', studentId, term] }),
      queryClient.invalidateQueries({ queryKey: ['student-term-analysis-version', versionId] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['alerts'] }),
    ]);
  }

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!versionId) {
        throw new Error('Thiếu version để gửi.');
      }
      if (
        !window.confirm(
          `Gửi cảnh báo này ở cấp ${level} tới ${recipientCount} người nhận theo ma trận độ khẩn?`,
        )
      ) {
        return null;
      }
      // Lưu bản nháp trước để nội dung AI gửi đi đúng thứ người duyệt đang thấy.
      await apiFetch(`/term-analysis-versions/${versionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ editedOutput: parseEditableAnalysisOutput(draftForm) }),
      });
      return apiFetch(`/term-analysis-versions/${versionId}/send`, {
        method: 'POST',
        body: JSON.stringify({
          confirmedLevel: level,
          contentSource,
          ...(contentSource === 'LECTURER' ? { lecturerNote: lecturerNote.trim() } : {}),
        }),
      });
    },
    onSuccess: async () => {
      onError('');
      await invalidateAfterDecision();
    },
    onError: (err) => onError(sendErrorMessage(err)),
  });

  const dismissMutation = useMutation({
    mutationFn: () => {
      if (!versionId) {
        throw new Error('Thiếu version để bỏ qua.');
      }
      return apiFetch(`/term-analysis-versions/${versionId}/dismiss`, { method: 'POST' });
    },
    onSuccess: async () => {
      onError('');
      await invalidateAfterDecision();
    },
    onError: (err) =>
      onError(err instanceof ApiError ? err.message : 'Không thể bỏ qua lời gợi ý gửi.'),
  });

  return { sendMutation, dismissMutation };
}

/** Đổi mã lỗi nghiệp vụ thành câu người dùng đọc được. */
function sendErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return 'Không thể gửi cảnh báo.';
  }
  if (err.code === 'STALE_ANALYSIS') {
    return 'Dữ liệu học tập đã thay đổi. Hãy tạo version AI mới trước khi gửi.';
  }
  if (err.code === 'NO_RECIPIENTS') {
    return 'Không có người nhận phù hợp cho cấp độ khẩn này.';
  }
  return err.message;
}
