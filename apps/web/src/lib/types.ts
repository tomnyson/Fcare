import type { RoleKey } from '@fcare/shared-types';

export interface AuthUser {
  id: string;
  staffCode: string;
  fullName: string;
  roles: RoleKey[];
  departmentId: string | null;
  consented: boolean;
  mustChangePassword: boolean;
}

export interface LoginResult {
  user: AuthUser;
  requiresConsent: boolean;
  mustChangePassword: boolean;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export type StudentStatus = 'STUDYING' | 'RESERVED' | 'WARNED' | 'DROPPED_OUT' | 'GRADUATED';
export type EnrollmentResult = 'IN_PROGRESS' | 'PASS' | 'FAIL';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type CareChannel = 'IN_PERSON' | 'ONLINE';

export interface Department {
  id: string;
  code: string;
  name: string;
  _count?: { students: number; staff: number; majors: number };
}

export interface Major {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  department?: Department;
  _count?: { students: number };
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  credits: number;
  departmentId: string;
  department?: Department;
  _count?: { classSections: number };
}

export interface StaffRef {
  id: string;
  staffCode: string;
  fullName: string;
}

export interface ClassSection {
  id: string;
  code: string;
  term: string;
  subjectId: string;
  lecturerId: string | null;
  block?: number | null;
  slot?: string | null;
  weekdays?: string | null;
  room?: string | null;
  capacity?: number | null;
  trainingTime?: string | null;
  startDate?: string | null;
  totalHours?: number | null;
  subject?: Subject;
  lecturer?: StaffRef;
  _count?: { enrollments: number };
}

export interface Student {
  id: string;
  studentCode: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: string | null;
  cohort: string | null;
  classCode: string;
  status: StudentStatus;
  major?: { id: string; code: string; name: string } | null;
  department?: { id: string; code: string; name: string };
  _count?: Record<string, number>;
}

export interface Enrollment {
  id: string;
  attendanceRate: number | null;
  midtermScore: number | null;
  finalScore: number | null;
  totalScore: number | null;
  isExamBanned: boolean;
  result: EnrollmentResult;
  classSection?: ClassSection;
  student?: Student;
}

export interface Evaluation {
  id: string;
  term: string;
  academicScore: number;
  attitudeScore: number;
  issueGroup: number | null;
  note: string | null;
  createdAt: string;
  lecturer?: StaffRef;
  student?: Student;
}

export interface CareLog {
  id: string;
  channel: CareChannel;
  content: string;
  outcome: string | null;
  nextAction: string | null;
  createdAt: string;
  staff?: StaffRef;
  student?: Student;
}

export interface Alert {
  id: string;
  level: number;
  reason: string;
  status: AlertStatus;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  student?: Student & { department?: { code: string; name: string } };
  raisedBy?: StaffRef;
  resolvedBy?: StaffRef | null;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  alert?: {
    id: string;
    level: number;
    status: AlertStatus;
    student?: { id: string; studentCode: string; fullName: string };
  } | null;
}

export interface StatisticsOverview {
  totalStudents: number;
  careLogsLast30Days: number;
  studentsByStatus: Array<{ status: StudentStatus; count: number }>;
  openAlertsByLevel: Array<{ level: number; count: number }>;
}

export interface ClassStatistics {
  id: string;
  code: string;
  term: string;
  subject?: { code: string; name: string };
  lecturer?: { staffCode: string; fullName: string };
  total: number;
  pass: number;
  fail: number;
  inProgress: number;
  examBanned: number;
  passRate: number | null;
}

export interface DepartmentStatistics {
  id: string;
  code: string;
  name: string;
  totalStudents: number;
  totalStaff: number;
  openAlerts: number;
  studentsByStatus: Array<{ status: StudentStatus; count: number }>;
}

export interface StaffMember {
  id: string;
  staffCode: string;
  fullName: string;
  departmentId: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
  lecturerType?: string | null;
  department: { id: string; code: string; name: string } | null;
  roles: Array<{ role: { key: RoleKey; name: string } }>;
}

export interface ImportResult {
  created?: number;
  updated?: number;
  upserted?: number;
  errors: Array<{ row: number; message: string }>;
}
