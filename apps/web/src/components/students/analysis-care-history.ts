import type { CareChannel } from '../../lib/types';

/** Số lượt chăm sóc gửi kèm — khớp trần MAX_ENTRIES của digest phía API. */
const CARE_HISTORY_PREVIEW_LIMIT = 5;

export interface CareHistoryEntry {
  createdAt: string;
  channel: CareChannel | string;
  content: string;
  outcome: string | null;
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Bóc lịch sử chăm sóc từ `sourceSnapshot` của version để xem trước đúng phần
 * sẽ được gửi kèm khi giảng viên tự soạn nội dung. Snapshot là JSON tự do phía
 * API nên đọc phòng thủ, sai hình dạng thì coi như không có lịch sử.
 */
export function careHistoryEntries(sourceSnapshot: unknown): CareHistoryEntry[] {
  if (!sourceSnapshot || typeof sourceSnapshot !== 'object') {
    return [];
  }
  const careLogs = (sourceSnapshot as { careLogs?: unknown }).careLogs;
  if (!Array.isArray(careLogs)) {
    return [];
  }

  return careLogs
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => ({
      createdAt: readString(row, 'createdAt'),
      channel: readString(row, 'channel'),
      content: readString(row, 'content'),
      outcome: readString(row, 'outcome') || null,
    }))
    .filter((entry) => entry.content.length > 0)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, CARE_HISTORY_PREVIEW_LIMIT);
}
