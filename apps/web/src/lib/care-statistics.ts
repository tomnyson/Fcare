export type CareStatus = 'all' | 'cared' | 'uncared';

/** Đếm cảnh báo điểm danh tự động trong phạm vi (GV / lớp / cả kỳ). */
export interface CareAttendanceTotals {
  total: number;
  caredByOwner: number;
  caredByOthers: number;
  pending: number;
}
/** Cảnh báo điểm danh đang mở của một sinh viên trong lớp học phần. */
export interface CareStudentAttendanceAlert {
  level: number;
  absentSessions: number | null;
  ownerCaredAt: string | null;
  careLogCount: number;
  createdAt: string;
}

export interface CareCounts {
  studentCount: number;
  caredCount: number;
  uncaredCount: number;
  careRate: number | null;
  evaluationCount: number;
  careLogCount: number;
  discussionCount?: number;
  attendanceAlerts?: CareAttendanceTotals;
}
export interface CareStudent {
  id: string;
  studentCode: string;
  fullName: string;
  classCode: string;
  cared: boolean;
  evaluationCount: number;
  careLogCount: number;
  discussionCount?: number;
  lastCareAt: string | null;
  alertLevel: number | null;
  attendanceAlert?: CareStudentAttendanceAlert | null;
}

export type AttendanceCareState = 'owner' | 'others' | 'pending';

/** Ai đã chăm sóc cảnh báo điểm danh: GV đứng lớp, GV khác, hay chưa ai. */
export function attendanceCareState(alert: CareStudentAttendanceAlert): AttendanceCareState {
  if (alert.ownerCaredAt) return 'owner';
  return alert.careLogCount > 0 ? 'others' : 'pending';
}
export interface CareSection extends CareCounts {
  id: string;
  code: string;
  subjectName: string;
  students: CareStudent[];
}
export interface CareLecturer extends CareCounts {
  id: string;
  staffCode: string;
  fullName: string;
  department: { code: string; name: string } | null;
  sectionCount: number;
  sections: CareSection[];
}
export interface CareReport {
  term: { code: string; name: string; startDate: string; endDate: string };
  generatedAt: string;
  lecturers: CareLecturer[];
}

export function canViewCareStatistics(roles: readonly string[]): boolean {
  return roles.some((role) => role === 'ADMIN' || role === 'HEAD_OF_DEPT');
}

export function buildCareQuery(
  term: string,
  lecturerId = '',
  status: CareStatus = 'all',
  mode?: 'summary' | 'detailed',
): string {
  const params = new URLSearchParams({ term, status });
  if (lecturerId) params.set('lecturerId', lecturerId);
  if (mode) params.set('mode', mode);
  return `?${params.toString()}`;
}
