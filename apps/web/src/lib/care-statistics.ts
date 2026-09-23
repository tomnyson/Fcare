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
  /** Sĩ số (mọi SV đang học). */
  studentCount: number;
  /** SV có cảnh báo — mẫu số của `careRate`. */
  alertedStudentCount?: number;
  caredCount: number;
  uncaredCount: number;
  careRate: number | null;
  evaluationCount: number;
  careLogCount: number;
  discussionCount?: number;
  ownerCareLogCount?: number;
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
export interface CareDepartment {
  id: string;
  code: string;
  name: string;
}
export interface CareLecturer extends CareCounts {
  id: string;
  staffCode: string;
  fullName: string;
  department: CareDepartment | null;
  sectionCount: number;
  sections: CareSection[];
}
export interface CareReport {
  term: { code: string; name: string; startDate: string; endDate: string };
  generatedAt: string;
  lecturers: CareLecturer[];
}

export function canViewCareStatistics(roles: readonly string[]): boolean {
  return roles.some(
    (role) => role === 'ADMIN' || role === 'TRAINING_OFFICER' || role === 'HEAD_OF_DEPT',
  );
}

interface CareFilters {
  lecturerId?: string;
  departmentId?: string;
  status?: CareStatus;
  mode?: 'summary' | 'detailed';
}

/** Cùng một chuỗi lọc cho màn hình và file Excel. */
export function buildCareQuery(term: string, filters: CareFilters = {}): string {
  const params = new URLSearchParams({ term });
  if (filters.lecturerId) params.set('lecturerId', filters.lecturerId);
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  params.set('status', filters.status ?? 'all');
  if (filters.mode) params.set('mode', filters.mode);
  return `?${params.toString()}`;
}

/** Bộ môn có giảng viên trong báo cáo — đã nằm sẵn trong phạm vi người xem. */
export function careDepartments(lecturers: readonly CareLecturer[]): CareDepartment[] {
  const unique = new Map<string, CareDepartment>();
  for (const { department } of lecturers) {
    if (department) unique.set(department.id, department);
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
