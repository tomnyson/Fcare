/**
 * Trạng thái của trang thống kê. Tab và học kỳ nằm trên URL để gửi link
 * "tỷ lệ đạt theo môn kỳ SU25" là gửi đúng thứ mình đang nhìn — cùng triết lý
 * với `alert-filters` và `student-filters`.
 */
export const STATISTICS_TABS = [
  { key: 'classes', label: 'Lớp học phần', endpoint: '/statistics/classes' },
  { key: 'departments', label: 'Bộ môn', endpoint: '/statistics/departments' },
  { key: 'subjects', label: 'Môn học', endpoint: '/statistics/subjects' },
  { key: 'lecturers', label: 'Giảng viên', endpoint: '/statistics/lecturers' },
  { key: 'care', label: 'Chăm sóc sinh viên', endpoint: '/statistics/care' },
] as const;

export type StatisticsTab = (typeof STATISTICS_TABS)[number];
export type StatisticsTabKey = StatisticsTab['key'];

const DEFAULT_TAB: StatisticsTabKey = 'classes';

export function isStatisticsTabKey(value: string): value is StatisticsTabKey {
  return STATISTICS_TABS.some((tab) => tab.key === value);
}

export function parseStatisticsView(params: URLSearchParams): {
  tab: StatisticsTabKey;
  term: string;
} {
  const tab = params.get('tab') ?? '';
  return {
    tab: isStatisticsTabKey(tab) ? tab : DEFAULT_TAB,
    term: params.get('term') ?? '',
  };
}

/** Chuỗi query gắn vào endpoint; rỗng khi không lọc kỳ. */
export function buildStatisticsQuery(term: string): string {
  return term ? `?term=${encodeURIComponent(term)}` : '';
}
