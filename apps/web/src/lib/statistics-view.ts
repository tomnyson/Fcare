import { canViewCareStatistics } from './care-statistics';

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

const DEFAULT_STATISTICS_TAB: StatisticsTabKey = 'classes';

export function isStatisticsTabKey(value: string): value is StatisticsTabKey {
  return STATISTICS_TABS.some((tab) => tab.key === value);
}

export function parseStatisticsView(params: URLSearchParams): {
  tab: StatisticsTabKey;
  term: string;
} {
  const tab = params.get('tab') ?? '';
  return {
    tab: isStatisticsTabKey(tab) ? tab : DEFAULT_STATISTICS_TAB,
    term: params.get('term') ?? '',
  };
}

/** Block trong kỳ của lớp học phần (`ClassSection.block`). */
export const CLASS_BLOCKS = ['1', '2'] as const;
type ClassBlock = (typeof CLASS_BLOCKS)[number];

/** Giá trị block lạ trên URL coi như không lọc thay vì làm API trả 400. */
export function parseBlockParam(value: string | null): ClassBlock | '' {
  return CLASS_BLOCKS.find((block) => block === value) ?? '';
}

/** Chuỗi query gắn vào endpoint; rỗng khi không lọc kỳ/block. */
export function buildStatisticsQuery(term: string, block = ''): string {
  const query = new URLSearchParams();
  if (term) query.set('term', term);
  if (block) query.set('block', block);
  const text = query.toString();
  return text ? `?${text}` : '';
}

/** Mỗi tab là một route con `/statistics/{tab}` — học kỳ đi kèm để đổi tab không mất lọc. */
export function statisticsTabHref(tab: StatisticsTabKey, term: string): string {
  return `/statistics/${tab}${buildStatisticsQuery(term)}`;
}

/** Tab "Chăm sóc sinh viên" chỉ dành cho ADMIN/Cán bộ Đào tạo/TBM, dùng chung cho sidebar và thanh tab. */
export function visibleStatisticsTabs(roles: readonly string[]): StatisticsTab[] {
  const canViewCare = canViewCareStatistics(roles);
  return STATISTICS_TABS.filter((tab) => tab.key !== 'care' || canViewCare);
}
