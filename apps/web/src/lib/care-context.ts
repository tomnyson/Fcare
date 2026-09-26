import type { ClassSection, Enrollment } from './types';

/**
 * Bối cảnh của một lượt chăm sóc / trao đổi: học kỳ nào, lớp nào, môn gì.
 * Thiếu thông tin này thì nhật ký chung chung, người đọc không biết thầy cô
 * đang chăm sóc sinh viên trong môn nào.
 */
export interface SectionContext {
  code: string;
  term: string;
  subject?: { code: string; name: string } | null;
}

export function sectionContextLabel(section: SectionContext): string {
  return [section.term, section.code, section.subject?.name].filter(Boolean).join(' · ');
}

const SEASON_ORDER: Record<string, number> = { SP: 0, SU: 1, FA: 2 };

/** "FA26" → 26*3+2: sắp học kỳ theo thời gian thay vì theo bảng chữ cái. */
function termRank(term: string): number {
  const season = SEASON_ORDER[term.slice(0, 2).toUpperCase()] ?? -1;
  const year = Number.parseInt(term.slice(2), 10);
  return Number.isNaN(year) ? -1 : year * 3 + season;
}

export interface CareSectionGroup {
  term: string;
  sections: ClassSection[];
}

/** Lớp học phần sinh viên đang/đã học, nhóm theo học kỳ, kỳ mới nhất trước. */
export function careSectionGroups(enrollments: readonly Enrollment[]): CareSectionGroup[] {
  const sections = enrollments.flatMap((enrollment) =>
    enrollment.classSection ? [enrollment.classSection] : [],
  );
  const terms = [...new Set(sections.map((section) => section.term))].sort(
    (a, b) => termRank(b) - termRank(a),
  );
  return terms.map((term) => ({
    term,
    sections: sections.filter((section) => section.term === term),
  }));
}

/** Nhóm lớp của kỳ đang xem; kỳ đó không có lớp thì lấy kỳ mới nhất. */
export function termSectionGroup(
  groups: readonly CareSectionGroup[],
  term: string,
): CareSectionGroup | null {
  return groups.find((group) => group.term === term) ?? groups[0] ?? null;
}

/**
 * Lớp chọn sẵn trong form nhật ký: lớp mình dạy ở kỳ đang xem → lớp mình dạy
 * gần nhất → lớp đầu của kỳ đang xem → lớp đầu của kỳ mới nhất.
 */
export function defaultCareSectionId(
  groups: readonly CareSectionGroup[],
  { term, userId }: { term: string; userId: string | undefined },
): string {
  const all = groups.flatMap((group) => group.sections);
  const inTerm = all.filter((section) => section.term === term);
  const mine = (section: ClassSection) => userId !== undefined && section.lecturerId === userId;
  return (
    inTerm.find(mine)?.id ?? all.find(mine)?.id ?? inTerm[0]?.id ?? all[0]?.id ?? ''
  );
}
