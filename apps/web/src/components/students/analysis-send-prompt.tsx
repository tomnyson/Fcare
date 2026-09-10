'use client';

import { FORCED_ESCALATION_RULES } from '@fcare/shared-types';
import { Button } from '@fcare/ui-kit';
import { CARE_CHANNEL_LABELS, formatDate, formatDateTime } from '../../lib/labels';
import type {
  CareChannel,
  StudentAnalysisOutput,
  StudentTermAnalysisRecipientPreview,
} from '../../lib/types';
import { Label, Select, Textarea } from '../ui/form';
import type { CareHistoryEntry } from './analysis-care-history';
import { levelBadge } from './risk-score-panel';

/** Nội dung tự soạn phải đủ dài — cùng ngưỡng 40 ký tự server đang kiểm. */
export const LECTURER_NOTE_MIN = 40;

/** Hai nguồn nội dung cảnh báo, khớp `contentSource` của API. */
export type AnalysisContentSource = 'AI' | 'LECTURER';

/**
 * Vì sao nút Gửi đang khóa — trả `null` nghĩa là gửi được. Hàm thuần để test
 * không cần dựng DOM.
 */
export function sendBlockedReason(
  contentSource: AnalysisContentSource,
  aiSummary: string,
  lecturerNote: string,
): string | null {
  if (contentSource === 'AI') {
    return aiSummary.trim().length === 0
      ? 'Bản AI chưa có nội dung tóm tắt để gửi — hãy chọn tự soạn nội dung.'
      : null;
  }
  const trimmed = lecturerNote.trim();
  if (trimmed.length < LECTURER_NOTE_MIN) {
    return `Nội dung bạn tự soạn cần từ ${LECTURER_NOTE_MIN} ký tự (còn thiếu ${
      LECTURER_NOTE_MIN - trimmed.length
    }).`;
  }
  return null;
}

interface AnalysisSendPromptProps {
  /** Bản vừa sinh sau nhận xét: hiển thị như một lời gợi ý kèm nút "Không gửi". */
  promptMode: boolean;
  systemLevel: number;
  forced: StudentAnalysisOutput['forcedEscalation'];
  level: number;
  onLevelChange: (level: number) => void;
  contentSource: AnalysisContentSource;
  onContentSourceChange: (source: AnalysisContentSource) => void;
  aiSummary: string;
  lecturerNote: string;
  onLecturerNoteChange: (note: string) => void;
  careHistory: CareHistoryEntry[];
  recipients: StudentTermAnalysisRecipientPreview[];
  recipientsLoading: boolean;
  isSending: boolean;
  isDismissing: boolean;
  onSend: () => void;
  onDismiss: () => void;
}

export function AnalysisSendPrompt({
  promptMode,
  systemLevel,
  forced,
  level,
  onLevelChange,
  contentSource,
  onContentSourceChange,
  aiSummary,
  lecturerNote,
  onLecturerNoteChange,
  careHistory,
  recipients,
  recipientsLoading,
  isSending,
  isDismissing,
  onSend,
  onDismiss,
}: AnalysisSendPromptProps) {
  // Người duyệt được nâng cấp độ, không được hạ xuống dưới mức hệ thống tính.
  const levelOptions = [1, 2, 3, 4].filter((option) => option >= systemLevel);
  const blocked = sendBlockedReason(contentSource, aiSummary, lecturerNote);
  const badge = levelBadge(level);
  const noteLength = lecturerNote.trim().length;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold text-ink">
          {promptMode ? 'Gửi cảnh báo cho các bên liên quan?' : 'Chốt nội dung và độ khẩn'}
        </p>
        <span className={badge.className} data-testid="confirmed-level-badge">
          {badge.label}
        </span>
      </div>
      <p className="text-sm text-muted">
        {promptMode
          ? 'AI đã tổng hợp xong nhận xét vừa lưu. Bạn quyết định có gửi hay không — hệ thống không tự gửi.'
          : 'Bản nháp này chưa gửi. Bạn có thể gửi lại bất cứ lúc nào.'}{' '}
        Hệ thống tính cấp {systemLevel} từ điểm DRS và luật ép; bạn có thể nâng lên nhưng không hạ
        xuống thấp hơn.
      </p>

      {forced ? (
        <div
          className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3"
          data-testid="forced-escalation"
        >
          <p className="text-sm font-semibold text-danger">
            AI ép cấp độ: {FORCED_ESCALATION_RULES[forced.rule].label} → cấp {forced.level}
          </p>
          <blockquote className="mt-2 border-l-2 border-danger/40 pl-3 text-sm italic text-ink">
            “{forced.quote}”
          </blockquote>
          <p className="mt-2 text-xs text-muted">
            Trích nguyên văn từ nhận xét của giảng viên. Nếu câu này không đúng ngữ cảnh, hãy sửa
            bản nháp và tạo version mới thay vì hạ cấp.
          </p>
        </div>
      ) : null}

      <fieldset className="space-y-2" data-testid="content-source">
        <legend className="text-sm font-semibold text-ink">Nội dung gửi đi</legend>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm">
          <input
            type="radio"
            name="contentSource"
            className="mt-1"
            checked={contentSource === 'AI'}
            onChange={() => onContentSourceChange('AI')}
          />
          <span>
            <span className="font-medium text-ink">Dùng nội dung AI gợi ý</span>
            <span className="mt-1 block text-muted">
              Gửi đúng phần AI tổng hợp từ nhận xét và lịch sử chăm sóc.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm">
          <input
            type="radio"
            name="contentSource"
            className="mt-1"
            checked={contentSource === 'LECTURER'}
            onChange={() => onContentSourceChange('LECTURER')}
          />
          <span>
            <span className="font-medium text-ink">Tôi tự soạn nội dung</span>
            <span className="mt-1 block text-muted">
              Gửi nội dung bạn viết, kèm lịch sử chăm sóc gần đây của sinh viên.
            </span>
          </span>
        </label>
      </fieldset>

      {contentSource === 'AI' ? (
        <blockquote
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink"
          data-testid="ai-summary-preview"
        >
          {aiSummary.trim() || 'AI chưa có nội dung tóm tắt.'}
        </blockquote>
      ) : (
        <div>
          <Label htmlFor="lecturerNote">Nội dung bạn muốn gửi</Label>
          <Textarea
            id="lecturerNote"
            value={lecturerNote}
            onChange={(event) => onLecturerNoteChange(event.target.value)}
            placeholder="Vì sao cần chuyển tiếp trường hợp này…"
          />
          <p
            className={`mt-1 text-xs ${noteLength < LECTURER_NOTE_MIN ? 'text-danger' : 'text-muted'}`}
            data-testid="lecturer-note-counter"
          >
            {noteLength}/{LECTURER_NOTE_MIN} ký tự
          </p>
          <p className="mt-1 text-xs text-muted">
            Không ghi số điện thoại, email, CCCD hay địa chỉ của sinh viên — hệ thống sẽ từ chối
            gửi.
          </p>
          <div className="mt-3 rounded-lg border border-border bg-white px-3 py-2">
            <p className="text-sm font-semibold text-ink">Lịch sử chăm sóc sẽ gửi kèm</p>
            {careHistory.length === 0 ? (
              <p className="mt-1 text-sm text-muted">Chưa có lượt chăm sóc nào được ghi nhận.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-muted" data-testid="care-history-preview">
                {careHistory.map((entry) => (
                  <li key={`${entry.createdAt}-${entry.content}`}>
                    {formatDate(entry.createdAt)} ·{' '}
                    {CARE_CHANNEL_LABELS[entry.channel as CareChannel] ?? entry.channel} ·{' '}
                    {entry.content}
                    {entry.outcome ? ` (kết quả: ${entry.outcome})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="confirmedLevel">Độ khẩn gửi đi</Label>
        <Select
          id="confirmedLevel"
          value={String(level)}
          onChange={(event) => onLevelChange(Number(event.target.value))}
        >
          {levelOptions.map((option) => (
            <option key={option} value={option}>
              {levelBadge(option).label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <p className="text-sm font-semibold text-ink">
          Người nhận theo cấp {level} ({recipients.length})
        </p>
        {recipientsLoading ? (
          <p className="mt-2 text-sm text-muted">Đang tải danh sách người nhận…</p>
        ) : recipients.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Chưa có người nhận phù hợp — kiểm tra lại phân công bộ môn.
          </p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm" data-testid="recipient-list">
            {recipients.map((recipient) => (
              <li key={recipient.id} className="rounded-lg border border-border bg-white px-3 py-2">
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

      {blocked ? <p className="text-sm text-danger">{blocked}</p> : null}
      <div className="flex flex-wrap justify-end gap-3">
        {promptMode ? (
          <Button
            type="button"
            variant="ghost"
            data-testid="dismiss-analysis"
            disabled={isSending || isDismissing}
            onClick={onDismiss}
          >
            {isDismissing ? 'Đang bỏ qua…' : 'Không gửi'}
          </Button>
        ) : null}
        <Button
          type="button"
          data-testid="send-analysis"
          disabled={isSending || isDismissing || blocked !== null || recipients.length === 0}
          onClick={onSend}
        >
          {isSending ? 'Đang gửi…' : 'Gửi cảnh báo'}
        </Button>
      </div>
    </div>
  );
}
