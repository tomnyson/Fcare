/**
 * Trang Tổng quan hiển thị theo vai trò — người nhiều vai thấy gộp các khối.
 * Chỉ quyết định HIỂN THỊ; phạm vi dữ liệu vẫn do API (`studentScope`) chặn.
 */
export interface DashboardSections {
  /** Chăm sóc theo bộ môn / giảng viên / CTSV + SV cảnh báo theo mức. */
  careOverview: boolean;
  /** CTSV: sinh viên đang có cảnh báo chưa giải quyết. */
  warnedStudents: boolean;
  /** Người đứng lớp: lớp đang dạy + sinh viên cần chăm sóc. */
  myClasses: boolean;
}

const CARE_OVERVIEW_ROLES = ['ADMIN', 'TRAINING_OFFICER', 'HEAD_OF_DEPT'];
const WARNED_STUDENTS_ROLES = ['SA_OFFICER', 'SA_HEAD'];
const TEACHING_ROLES = ['LECTURER', 'HEAD_OF_DEPT'];

export function dashboardSections(roles: readonly string[]): DashboardSections {
  const has = (list: readonly string[]) => roles.some((role) => list.includes(role));
  return {
    careOverview: has(CARE_OVERVIEW_ROLES),
    warnedStudents: has(WARNED_STUDENTS_ROLES),
    myClasses: has(TEACHING_ROLES),
  };
}

/** Bấm vào thẻ lớp → danh sách sinh viên của lớp đó để chăm sóc ngay. */
export function classStudentsHref(sectionId: string, term: string): string {
  const query = new URLSearchParams({ sectionId });
  if (term) query.set('term', term);
  return `/students?${query.toString()}`;
}
