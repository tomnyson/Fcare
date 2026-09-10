import type { AnalysisSourceCareLog } from './analysis-source';

/** Số lượt chăm sóc gần nhất được đính kèm cảnh báo. */
const MAX_ENTRIES = 5;
/** Trần độ dài mỗi phần nội dung/kết quả để một lượt dài không lấn hết chỗ. */
const MAX_FIELD_LENGTH = 200;
/**
 * Trần tổng: `reason` của cảnh báo còn phải chứa nội dung giảng viên viết, mà
 * DTO chặn ở 2000 ký tự.
 */
const MAX_TOTAL_LENGTH = 1_200;

const CHANNEL_LABELS: Record<string, string> = {
  IN_PERSON: 'Gặp trực tiếp',
  ONLINE: 'Trao đổi online',
};

function clamp(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_FIELD_LENGTH
    ? `${trimmed.slice(0, MAX_FIELD_LENGTH)}…`
    : trimmed;
}

/** Ngày kiểu dd/MM/yyyy — người nhận đọc nhanh hơn ISO. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/**
 * Tóm tắt lịch sử chăm sóc để gửi kèm cảnh báo khi giảng viên tự soạn nội dung
 * (bản AI đã tự tổng hợp phần này trong `notificationSummary`). Dữ liệu lấy từ
 * `sourceSnapshot` đã lọc PII và đã băm nên không phải truy vấn lại.
 */
export function careHistoryDigest(
  careLogs: readonly AnalysisSourceCareLog[],
): string {
  const lines = [...careLogs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_ENTRIES)
    .map((entry) => {
      const channel = CHANNEL_LABELS[entry.channel] ?? entry.channel;
      const outcome = entry.outcome?.trim()
        ? ` (kết quả: ${clamp(entry.outcome)})`
        : '';
      return `${formatDate(entry.createdAt)} · ${channel} · ${clamp(entry.content)}${outcome}`;
    });

  const digest = lines.join('\n');
  return digest.length > MAX_TOTAL_LENGTH
    ? `${digest.slice(0, MAX_TOTAL_LENGTH - 1)}…`
    : digest;
}
