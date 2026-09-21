/**
 * Bộ lọc trang danh sách sinh viên. URL là nguồn sự thật — gửi link cho đồng
 * nghiệp là gửi đúng bộ lọc — nên toàn bộ logic đọc/ghi tham số nằm ở đây để
 * kiểm thử được mà không cần dựng component.
 */
export interface StudentFilters {
  search: string;
  status: string;
  classCode: string;
  majorId: string;
  /** Bộ môn của sinh viên — link từ thẻ "Theo bộ môn" ở Tổng quan. */
  departmentId: string;
  term: string;
  lecturerId: string;
  sectionId: string;
  missingMajor: boolean;
}

/** Khóa query string của từng bộ lọc, dùng chung cho đọc URL và xóa lọc. */
export const STUDENT_FILTER_KEYS = [
  'search',
  'status',
  'classCode',
  'majorId',
  'departmentId',
  'term',
  'lecturerId',
  'sectionId',
  'missingMajor',
] as const;

export function parseStudentFilters(params: URLSearchParams): StudentFilters {
  return {
    search: params.get('search') ?? '',
    status: params.get('status') ?? '',
    classCode: params.get('classCode') ?? '',
    majorId: params.get('majorId') ?? '',
    departmentId: params.get('departmentId') ?? '',
    term: params.get('term') ?? '',
    lecturerId: params.get('lecturerId') ?? '',
    sectionId: params.get('sectionId') ?? '',
    missingMajor: params.get('missingMajor') === 'true',
  };
}

/**
 * "Chưa gán ngành" và "lọc theo ngành" loại trừ nhau về nghĩa. API đã cho
 * missingMajor thắng; phía web cũng không gửi majorId để query key phản ánh
 * đúng dữ liệu thật sự được lọc.
 */
function effectiveMajorId(filters: StudentFilters): string {
  return filters.missingMajor ? '' : filters.majorId;
}

/** Cột sắp xếp được — khớp `STUDENT_SORT_FIELDS` phía API. */
export const STUDENT_SORT_FIELDS = ['absentSessions', 'openAlerts'] as const;
export type StudentSortField = (typeof STUDENT_SORT_FIELDS)[number];
export type StudentSort = { by: StudentSortField; dir: 'asc' | 'desc' } | null;

function isSortField(value: string | null): value is StudentSortField {
  return (STUDENT_SORT_FIELDS as readonly (string | null)[]).includes(value);
}

/** Sắp xếp nằm ngoài `StudentFilters`: không phải bộ lọc, "Xóa bộ lọc" giữ nguyên nó. */
export function parseStudentSort(params: URLSearchParams): StudentSort {
  const by = params.get('sortBy');
  if (!isSortField(by)) return null;
  return { by, dir: params.get('sortDir') === 'asc' ? 'asc' : 'desc' };
}

/** Chu kỳ bấm tiêu đề cột: giảm dần (nhiều nhất trước) → tăng dần → bỏ sắp xếp. */
export function nextStudentSort(current: StudentSort, field: StudentSortField): StudentSort {
  if (current?.by !== field) return { by: field, dir: 'desc' };
  return current.dir === 'desc' ? { by: field, dir: 'asc' } : null;
}

/** Patch URL khi đổi sắp xếp — thứ tự mới thì trang cũ vô nghĩa, quay về trang 1. */
export function studentSortPatch(sort: StudentSort): Record<string, string | null> {
  return { sortBy: sort?.by ?? null, sortDir: sort?.dir ?? null, page: null };
}

export function buildStudentListQuery(
  filters: StudentFilters,
  page: number,
  limit: number,
  sort: StudentSort = null,
): URLSearchParams {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const entries: Array<[string, string]> = [
    ['search', filters.search.trim()],
    ['status', filters.status],
    ['classCode', filters.classCode],
    ['majorId', effectiveMajorId(filters)],
    ['departmentId', filters.departmentId],
    ['term', filters.term],
    ['lecturerId', filters.lecturerId],
    ['sectionId', filters.sectionId],
    ['missingMajor', filters.missingMajor ? 'true' : ''],
  ];
  for (const [key, value] of entries) {
    if (value) query.set(key, value);
  }
  if (sort) {
    query.set('sortBy', sort.by);
    query.set('sortDir', sort.dir);
  }
  return query;
}

/** Số bộ lọc đang áp dụng — để hiện nút "Xóa bộ lọc" và tóm tắt cho người dùng. */
export function activeFilterCount(filters: StudentFilters): number {
  const values = [
    filters.search.trim(),
    filters.status,
    filters.classCode,
    effectiveMajorId(filters),
    filters.departmentId,
    filters.term,
    filters.lecturerId,
    filters.sectionId,
    filters.missingMajor ? 'true' : '',
  ];
  return values.filter(Boolean).length;
}

/** Patch cho `setFilters` để xóa sạch bộ lọc và quay về trang 1. */
export function clearFiltersPatch(): Record<string, null> {
  return Object.fromEntries([...STUDENT_FILTER_KEYS, 'page'].map((key) => [key, null]));
}

/**
 * Ngành hiện trong ô "Ngành": đã chọn lớp thì chỉ còn ngành có sinh viên trong
 * lớp đó (theo `classMajors` từ API, cùng phạm vi truy cập), không chọn thì
 * giữ nguyên danh sách.
 */
export function majorsForClass<T extends { id: string }>(
  majors: readonly T[],
  classMajors: Readonly<Record<string, readonly string[]>> | undefined,
  classCode: string,
): T[] {
  const allowed = classCode ? classMajors?.[classCode] : undefined;
  if (!allowed) return [...majors];
  return majors.filter((major) => allowed.includes(major.id));
}

/** Link tên sinh viên → tab "Nhật ký chăm sóc" của hồ sơ, giữ kỳ đang lọc. */
export function studentCareHref(studentId: string, term: string): string {
  const query = new URLSearchParams({ tab: 'care-logs' });
  if (term) query.set('term', term);
  return `/students/${studentId}?${query.toString()}`;
}
