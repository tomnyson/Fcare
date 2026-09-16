export interface CareStudentEvaluation {
  academicScore: number;
  attitudeScore: number;
  absentSessions: number | null;
  note: string | null;
  criteria: string[];
  evaluatorStaffCode: string;
  evaluatorName: string;
  updatedAt: string;
}

export interface CareStudentLog {
  channel: string;
  content: string;
  outcome: string | null;
  nextAction: string | null;
  staffCode: string;
  staffName: string;
  createdAt: string;
}

export interface CareStudentDiscussion {
  authorCode: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/** Cảnh báo điểm danh tự động mới nhất của sinh viên tại một lớp học phần. */
export interface CareStudentAttendanceAlert {
  level: number;
  absentSessions: number | null;
  ownerCaredAt: string | null;
  careLogCount: number;
  createdAt: string;
}

/** Bước 4 flow 2: TBM đếm GV đứng lớp đã chăm sóc cảnh báo điểm danh chưa. */
export interface CareAttendanceTotals {
  total: number;
  caredByOwner: number;
  /** Chưa được GV đứng lớp chăm sóc nhưng đã có thầy cô khác ghi nhật ký. */
  caredByOthers: number;
  /** = total - caredByOwner: còn hiện liên tục ở GV đứng lớp. */
  pending: number;
}

export interface CareStudent {
  id: string;
  studentCode: string;
  fullName: string;
  classCode: string;
  cared: boolean;
  evaluationCount: number;
  careLogCount: number;
  discussionCount: number;
  lastCareAt: string | null;
  alertLevel: number | null;
  attendanceAlert: CareStudentAttendanceAlert | null;
  evaluations?: CareStudentEvaluation[];
  careLogs?: CareStudentLog[];
  discussions?: CareStudentDiscussion[];
}
export interface CareTotals {
  studentCount: number;
  caredCount: number;
  uncaredCount: number;
  careRate: number | null;
  evaluationCount: number;
  careLogCount: number;
  discussionCount: number;
  attendanceAlerts: CareAttendanceTotals;
}
export interface CareSection extends CareTotals {
  id: string;
  code: string;
  subjectName: string;
  students: CareStudent[];
}
export interface CareLecturer extends CareTotals {
  id: string;
  staffCode: string;
  fullName: string;
  department: { code: string; name: string } | null;
  sectionCount: number;
  sections: CareSection[];
}
export interface CareReport {
  term: { code: string; name: string; startDate: Date; endDate: Date };
  generatedAt: string;
  lecturers: CareLecturer[];
}
