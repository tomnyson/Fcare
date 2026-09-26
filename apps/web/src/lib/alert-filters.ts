import { minVisibleAlertLevel, type RoleKey } from '@fcare/shared-types';
import { ALERT_LEVEL_LABELS } from './labels';

/**
 * Bộ lọc trang cảnh báo. Cùng triết lý với `student-filters`: URL là nguồn sự
 * thật để gửi link là gửi đúng bộ lọc, và logic đọc/ghi tham số tách khỏi
 * component để kiểm thử được. Các tiêu chí phía sinh viên (kỳ, lớp, ngành,
 * giảng viên, lớp học phần) dùng chung tên tham số với `/students` nên chuyển
 * qua lại giữa hai trang không phải dịch tên.
 */
interface AlertFilters {
  search: string;
  status: string;
  level: string;
  term: string;
  classCode: string;
  majorId: string;
  /** Bộ môn của sinh viên — link từ thẻ "Theo bộ môn" ở Tổng quan. */
  departmentId: string;
  lecturerId: string;
  sectionId: string;
  /** Chỉ cảnh báo chưa giải quyết (OPEN + ACKNOWLEDGED); API cho thắng `status`. */
  openOnly: boolean;
  /** Nguồn cảnh báo: '' (tất cả) | 'MANUAL' | 'AUTO_ATTENDANCE'. */
  source: string;
}

/** Khóa query string của từng bộ lọc, dùng chung cho đọc URL và xóa lọc. */
const ALERT_FILTER_KEYS = [
  'search',
  'status',
  'level',
  'term',
  'classCode',
  'majorId',
  'departmentId',
  'lecturerId',
  'sectionId',
  'openOnly',
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
    departmentId: params.get('departmentId') ?? '',
    lecturerId: params.get('lecturerId') ?? '',
    sectionId: params.get('sectionId') ?? '',
    openOnly: params.get('openOnly') === 'true',
    source: params.get('source') ?? '',
  };
}

/** Cột sắp xếp được — khớp `ALERT_SORT_FIELDS` phía API. */
export const ALERT_SORT_FIELDS = ['level', 'createdAt'] as const;
export type AlertSortField = (typeof ALERT_SORT_FIELDS)[number];
export type AlertSort = { by: AlertSortField; dir: 'asc' | 'desc' } | null;

function isAlertSortField(value: string | null): value is AlertSortField {
  return (ALERT_SORT_FIELDS as readonly (string | null)[]).includes(value);
}

/** Mặc định: cảnh báo khẩn nhất lên đầu (docs/plan-lert.md mục 2). */
export const DEFAULT_ALERT_SORT = { by: 'level', dir: 'desc' } as const satisfies AlertSort;

/** Sắp xếp không phải bộ lọc — "Xóa tất cả" giữ nguyên nó, giống trang Sinh viên. */
export function parseAlertSort(params: URLSearchParams): AlertSort {
  const by = params.get('sortBy');
  if (!isAlertSortField(by)) return { ...DEFAULT_ALERT_SORT };
  return { by, dir: params.get('sortDir') === 'asc' ? 'asc' : 'desc' };
}

/** Chu kỳ bấm tiêu đề cột: giảm dần → tăng dần → bỏ (về mặc định). */
export function nextAlertSort(current: AlertSort, field: AlertSortField): AlertSort {
  if (current?.by !== field) return { by: field, dir: 'desc' };
  return current.dir === 'desc' ? { by: field, dir: 'asc' } : null;
}

/** Patch URL khi đổi sắp xếp — thứ tự mới thì trang cũ vô nghĩa, quay về trang 1. */
export function alertSortPatch(sort: AlertSort): Record<string, string | null> {
  return { sortBy: sort?.by ?? null, sortDir: sort?.dir ?? null, page: null };
}

/**
 * Các mức cho ô lọc "Độ khẩn". CTSV thuần chỉ được thấy từ mức 3 (API cũng cắt
 * sẵn) nên không bày mức 1–2 ra để chọn rồi nhận bảng rỗng.
 */
export function alertLevelFilterOptions(
  roles: readonly RoleKey[] | undefined,
): Array<{ value: string; label: string }> {
  const min = roles ? minVisibleAlertLevel(roles) : 1;
  return Object.entries(ALERT_LEVEL_LABELS)
    .filter(([value]) => Number(value) >= min)
    .map(([value, label]) => ({ value, label: `Mức ${value} — ${label}` }));
}

export function buildAlertListQuery(
  filters: AlertFilters,
  limit: number,
  page = 1,
  sort: AlertSort = null,
): URLSearchParams {
  const query = new URLSearchParams({ limit: String(limit) });
  if (page > 1) query.set('page', String(page));
  if (sort) {
    query.set('sortBy', sort.by);
    query.set('sortDir', sort.dir);
  }
  const entries: Array<[string, string]> = [
    ['search', filters.search.trim()],
    ['status', filters.status],
    ['level', filters.level],
    ['term', filters.term],
    ['classCode', filters.classCode],
    ['majorId', filters.majorId],
    ['departmentId', filters.departmentId],
    ['lecturerId', filters.lecturerId],
    ['sectionId', filters.sectionId],
    ['openOnly', filters.openOnly ? 'true' : ''],
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
    filters.departmentId,
    filters.lecturerId,
    filters.sectionId,
    filters.openOnly ? 'true' : '',
    filters.source,
  ].filter(Boolean).length;
}

/** Patch cho `setFilters` để xóa sạch bộ lọc. */
export function clearAlertFiltersPatch(): Record<string, null> {
  return Object.fromEntries(ALERT_FILTER_KEYS.map((key) => [key, null]));
}
