/**
 * Bộ lọc trang cảnh báo. Cùng triết lý với `student-filters`: URL là nguồn sự
 * thật để gửi link là gửi đúng bộ lọc, và logic đọc/ghi tham số tách khỏi
 * component để kiểm thử được. Các tiêu chí phía sinh viên (kỳ, lớp, ngành,
 * giảng viên, lớp học phần) dùng chung tên tham số với `/students` nên chuyển
 * qua lại giữa hai trang không phải dịch tên.
 */
export interface AlertFilters {
  search: string;
  status: string;
  level: string;
  term: string;
  classCode: string;
  majorId: string;
  lecturerId: string;
  sectionId: string;
  /** Nguồn cảnh báo: '' (tất cả) | 'MANUAL' | 'AUTO_ATTENDANCE'. */
  source: string;
}

/** Khóa query string của từng bộ lọc, dùng chung cho đọc URL và xóa lọc. */
export const ALERT_FILTER_KEYS = [
  'search',
  'status',
  'level',
  'term',
  'classCode',
  'majorId',
  'lecturerId',
  'sectionId',
  'source',
] as const;

export function parseAlertFilters(params: URLSearchParams): AlertFilters {
  return {
    search: params.get('search') ?? '',
    status: params.get('status') ?? '',
    level: params.get('level') ?? '',
    term: params.get('term') ?? '',
    classCode: params.get('classCode') ?? '',
    majorId: params.get('majorId') ?? '',
    lecturerId: params.get('lecturerId') ?? '',
    sectionId: params.get('sectionId') ?? '',
    source: params.get('source') ?? '',
  };
}

export function buildAlertListQuery(
  filters: AlertFilters,
  limit: number,
  page = 1,
): URLSearchParams {
  const query = new URLSearchParams({ limit: String(limit) });
  if (page > 1) query.set('page', String(page));
  const entries: Array<[string, string]> = [
    ['search', filters.search.trim()],
    ['status', filters.status],
    ['level', filters.level],
    ['term', filters.term],
    ['classCode', filters.classCode],
    ['majorId', filters.majorId],
    ['lecturerId', filters.lecturerId],
    ['sectionId', filters.sectionId],
    ['source', filters.source],
  ];
  for (const [key, value] of entries) {
    if (value) query.set(key, value);
  }
  return query;
}

/** Số bộ lọc đang áp dụng — để hiện nút "Xóa bộ lọc". */
export function activeAlertFilterCount(filters: AlertFilters): number {
  return [
    filters.search.trim(),
    filters.status,
    filters.level,
    filters.term,
    filters.classCode,
    filters.majorId,
    filters.lecturerId,
    filters.sectionId,
    filters.source,
  ].filter(Boolean).length;
}

/** Patch cho `setFilters` để xóa sạch bộ lọc. */
export function clearAlertFiltersPatch(): Record<string, null> {
  return Object.fromEntries(ALERT_FILTER_KEYS.map((key) => [key, null]));
}
