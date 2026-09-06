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

export function buildStudentListQuery(
  filters: StudentFilters,
  page: number,
  limit: number,
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
    ['term', filters.term],
    ['lecturerId', filters.lecturerId],
    ['sectionId', filters.sectionId],
    ['missingMajor', filters.missingMajor ? 'true' : ''],
  ];
  for (const [key, value] of entries) {
    if (value) query.set(key, value);
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
    filters.term,
    filters.lecturerId,
    filters.sectionId,
    filters.missingMajor ? 'true' : '',
  ];
  return values.filter(Boolean).length;
}

/** Patch cho `setFilters` để xóa sạch bộ lọc và quay về trang 1. */
export function clearFiltersPatch(): Record<string, null> {
  return Object.fromEntries(
    [...STUDENT_FILTER_KEYS, 'page'].map((key) => [key, null]),
  );
}
