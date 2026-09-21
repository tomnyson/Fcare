import type {
  AlertSource,
  EvaluationCriterion,
  ForcedEscalationRule,
  RoleKey,
} from '@fcare/shared-types';

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
  /** Bộ môn cơ sở không mở thì tắt — môn học thuộc bộ môn cũng ẩn theo. */
  isActive: boolean;
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
  openAlertCount?: number;
}

export type TermSeason = 'SPRING' | 'SUMMER' | 'FALL';

export interface Term {
  id: string;
  code: string;
  name: string;
  season: TermSeason;
  year: number;
  startDate: string;
  endDate: string;
  isCurrentOverride: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentAlias {
  id: string;
  alias: string;
  departmentId: string;
  department?: { id: string; code: string; name: string };
}

export interface MajorAlias {
  id: string;
  alias: string;
  majorId: string;
  major?: { id: string; code: string; name: string };
}

export interface ClassMajorRule {
  id: string;
  classPrefix: string;
  majorId: string;
  major?: { id: string; code: string; name: string };
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
  /** Chỉ có ở `/students` (danh sách): tổng buổi vắng trong phạm vi bộ lọc kỳ/lớp HP; null = chưa có dữ liệu điểm danh. */
  absentSessions?: number | null;
  /** Số buổi vắng cao nhất trong một lớp học phần — dùng tô màu theo ngưỡng cảnh báo 2/3 buổi. */
  maxSectionAbsent?: number | null;
}

/** Nguồn cấp option cho bộ lọc trang danh sách sinh viên (`/students/filter-options`). */
export interface ClassSectionOption {
  id: string;
  code: string;
  term: string;
  subject?: { code: string; name: string } | null;
}

export interface StudentFilterOptions {
  terms: string[];
  classCodes: string[];
  majors: Array<{ id: string; code: string; name: string }>;
  lecturers: StaffRef[];
  sections: ClassSectionOption[];
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

export interface SectionGradeRow {
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  totalScore: number | null;
  result: EnrollmentResult;
  /** Độ khẩn cao nhất trong các cảnh báo chưa xử lý của sinh viên (1-4). */
  alertLevel: number | null;
}

export interface SectionGradesResponse {
  section: {
    id: string;
    code: string;
    term: string;
    subject?: { code: string; name: string };
  };
  rows: SectionGradeRow[];
}

export interface Evaluation {
  id: string;
  term: string;
  studentId?: string;
  classSectionId: string;
  academicScore: number;
  attitudeScore: number;
  /** Số buổi vắng giảng viên ghi nhận; null = chưa theo dõi chuyên cần. */
  absentSessions: number | null;
  criteria: { criterion: EvaluationCriterion }[];
  note: string | null;
  createdAt: string;
  lecturer?: StaffRef;
  student?: Student;
  classSection?: ClassSectionOption;
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
  /** Cảnh báo được gắn khi ghi nhật ký (chăm sóc sau điểm danh). */
  alert?: {
    id: string;
    level: number;
    source: AlertSource;
    classSection: { code: string } | null;
  } | null;
}

export interface Alert {
  id: string;
  level: number;
  reason: string;
  status: AlertStatus;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  source: AlertSource;
  /** Số buổi vắng khi hệ thống tự phát cảnh báo; null với cảnh báo thủ công. */
  absentSessions: number | null;
  /** Thời điểm giảng viên đứng lớp ghi nhật ký cho cảnh báo này. */
  ownerCaredAt: string | null;
  classSection?: { id: string; code: string; subject?: { name: string } } | null;
  student?: Student & { department?: { code: string; name: string } };
  /** null khi cảnh báo do hệ thống tự phát. */
  raisedBy?: StaffRef | null;
  resolvedBy?: StaffRef | null;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  analysisVersionId?: string | null;
  /** Có giá trị khi thông báo thuộc một luồng trao đổi nội bộ. */
  discussionMessageId?: string | null;
  targetUrl?: string | null;
  alert?: {
    id: string;
    level: number;
    status: AlertStatus;
    student?: { id: string; studentCode: string; fullName: string };
  } | null;
  analysis?: {
    id: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  } | null;
}

export interface StudentAnalysisEvidenceItem {
  finding: string;
  evidence: string;
}

export interface StudentAnalysisOutput {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  summary: string;
  strengths: string[];
  trends: StudentAnalysisEvidenceItem[];
  riskFactors: StudentAnalysisEvidenceItem[];
  recommendations: string[];
  notificationSummary: string;
  dataLimitations: string[];
  /** Độ khẩn AI đề xuất (1-4); cấp cuối vẫn do server chốt. */
  suggestedLevel: 1 | 2 | 3 | 4;
  /** Luật ép cấp AI đọc ra được từ nhận xét, kèm câu trích nguyên văn. */
  forcedEscalation: {
    rule: ForcedEscalationRule;
    quote: string;
    level: 3 | 4;
  } | null;
}

export interface StudentTermAnalysisVersionSummary {
  id: string;
  version: number;
  status: 'QUEUED' | 'GENERATING' | 'DRAFT' | 'FAILED' | 'SUPERSEDED' | 'SEND_QUEUED' | 'SENT';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  notificationSummary: string | null;
  createdAt: string;
  updatedAt: string;
  generatedAt: string | null;
  sentAt: string | null;
  errorMessage: string | null;
  createdBy?: StaffRef | null;
  reviewedBy?: StaffRef | null;
}

export interface StudentTermAnalysisSummary {
  id: string;
  studentId: string;
  term: string;
  owner: StaffRef;
  canManage: boolean;
  versions: StudentTermAnalysisVersionSummary[];
}

/**
 * Kết quả xem trước người nhận: `systemLevel` là cấp hệ thống tính từ DRS +
 * luật ép, `level` là cấp đang xem trước (không bao giờ thấp hơn systemLevel).
 * Version đã gửi trả cả hai bằng `null` vì danh sách đã chốt.
 */
export interface StudentTermAnalysisRecipientsPreview {
  systemLevel: number | null;
  level: number | null;
  recipients: StudentTermAnalysisRecipientPreview[];
}

export interface StudentTermAnalysisRecipientPreview {
  id: string;
  staffCode: string;
  fullName: string;
  departmentId: string | null;
  openedAt: string | null;
}

export interface StudentTermAnalysisDetail {
  id: string;
  version: number;
  status: StudentTermAnalysisVersionSummary['status'];
  term: string;
  student: { id: string; studentCode: string; fullName: string };
  owner?: StaffRef;
  createdBy?: StaffRef | null;
  reviewedBy?: StaffRef | null;
  sender?: StaffRef | null;
  sourceSnapshot?: unknown;
  sourceHash?: string;
  aiOriginal?: StudentAnalysisOutput | null;
  editedOutput: StudentAnalysisOutput | null;
  model?: string;
  promptVersion?: string;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
  };
  errorMessage?: string | null;
  /** Bản do hệ thống sinh sau nhận xét, đang chờ người nhận xét quyết định gửi. */
  needsSendDecision?: boolean;
  /** Nguồn nội dung đã gửi: AI tổng hợp hay giảng viên tự soạn. */
  contentSource?: 'AI' | 'LECTURER';
  /** Thời điểm người dùng bấm "Không gửi" — bản nháp vẫn gửi tay được sau đó. */
  dismissedAt?: string | null;
  requestedAt?: string;
  generatedAt?: string | null;
  editedAt?: string | null;
  reviewedAt?: string | null;
  sentAt?: string | null;
  recipients?: Array<
    StudentTermAnalysisRecipientPreview & {
      notificationId?: string | null;
    }
  >;
  recipient?: {
    id: string;
    staffCode: string;
    fullName: string;
    openedAt: string | null;
  } | null;
  disclaimer?: string;
}

/** Tổng quan của MỘT học kỳ — `term` null khi chưa cấu hình kỳ nào. */
export interface StatisticsOverview {
  term: { code: string; name: string; startDate: string; endDate: string } | null;
  totalStudents: number;
  /** SV có ít nhất một cảnh báo chưa giải quyết thuộc kỳ. */
  warnedStudents: number;
  careLogsInTerm: number;
  careLogsLast7Days: number;
  studentsByStatus: Array<{ status: StudentStatus; count: number }>;
  openAlertsByLevel: Array<{ level: number; count: number }>;
  /** Cảnh báo điểm danh ở lớp mình đứng lớp mà mình chưa chăm sóc. */
  attendancePending: number;
}

export type PendingScope = 'owned' | 'all';

/** Một dòng trong bảng "cần chăm sóc sau điểm danh" (GET /attendance-alerts/pending). */
export interface PendingAttendanceAlert {
  id: string;
  level: number;
  status: AlertStatus;
  reason: string;
  absentSessions: number | null;
  ownerCaredAt: string | null;
  createdAt: string;
  careLogCount: number;
  /** true = người xem là giảng viên đứng lớp và chưa chăm sóc. */
  isOwner: boolean;
  student: { id: string; studentCode: string; fullName: string; classCode: string | null };
  classSection: { id: string; code: string; subjectName: string; lecturerName: string | null };
}

export interface PendingAttendanceAlertsResult {
  items: PendingAttendanceAlert[];
  total: number;
  ownedTotal: number;
}

export interface ClassStatistics {
  id: string;
  code: string;
  term: string;
  subject: { code: string; name: string };
  /** `ClassSection.lecturerId` nullable → API trả `null` khi lớp chưa phân công. */
  lecturer: { staffCode: string; fullName: string } | null;
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
  /** `null` khi người xem không được biết tổng nhân sự của bộ môn đó (giảng viên). */
  totalStaff: number | null;
  openAlerts: number;
  studentsByStatus: Array<{ status: StudentStatus; count: number }>;
}

export interface SubjectStatistics {
  id: string;
  code: string;
  name: string;
  credits: number;
  department: { code: string; name: string };
  sectionCount: number;
  total: number;
  pass: number;
  fail: number;
  inProgress: number;
  examBanned: number;
  /** `null` khi chưa lớp nào có kết quả — hiển thị "—" chứ không phải 0%. */
  passRate: number | null;
  /** `null` khi chưa có bài nào có điểm. */
  avgScore: number | null;
}

export interface LecturerStatistics {
  id: string;
  staffCode: string;
  fullName: string;
  department: { code: string; name: string } | null;
  sectionCount: number;
  total: number;
  pass: number;
  fail: number;
  inProgress: number;
  examBanned: number;
  passRate: number | null;
  evaluationCount: number;
}

export interface StaffMember {
  id: string;
  staffCode: string;
  fullName: string;
  email: string | null;
  departmentId: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
  lecturerType: string | null;
  department: { id: string; code: string; name: string } | null;
  roles: Array<{ role: { key: RoleKey; name: string } }>;
}

export interface ImportResult {
  created?: number;
  updated?: number;
  upserted?: number;
  errors: Array<{ row: number; message: string }>;
  /** Ô PII đã bị xoá trước khi đọc file (RULE 1) — nêu vị trí, không nêu giá trị. */
  warnings?: string[];
}

// --- Import wizard (staging import: upload → preview → commit) ---
// Khớp NGUYÊN VĂN payload thật của ImportsController/ImportsService
// (apps/api/src/modules/imports) tại thời điểm viết — không phải bản mô tả
// trong brief: summary là object JSON lồng trong batch (không phải field
// rời), preview row không có `id`, và list()/preview() không trả `createdBy`.
export type ImportKind =
  | 'CATALOG'
  | 'LECTURER'
  | 'SCHEDULE'
  | 'GRADEBOOK'
  // Bộ file nhà trường gửi đầu kỳ, chạy đúng thứ tự này.
  | 'SECTION_LIST'
  | 'ROSTER'
  | 'GRADE_ATTENDANCE';
export type ImportStatus = 'PENDING' | 'COMMITTED' | 'FAILED' | 'CANCELLED';

export interface ImportSummary {
  totalRows: number;
  validRows: number;
  errorCount: number;
  warnings: string[];
  /** Mã bộ môn chưa tra được — dòng dùng mã này sẽ bị BỎ QUA khi commit. */
  unmappedAliases: string[];
  /**
   * Mã ngành chưa tra được — sinh viên vẫn được tạo, chỉ để trống ngành.
   * Optional: batch tạo trước khi tách hai loại không có khoá này.
   */
  unmappedMajorAliases?: string[];
}

export interface ImportRowView {
  sheet: string;
  rowIndex: number;
  payload: Record<string, unknown>;
  error: string | null;
}

export interface ImportBatchSummary {
  id: string;
  kind: ImportKind;
  status: ImportStatus;
  term: string;
  fileName: string;
  summary: ImportSummary;
  createdAt: string;
  committedAt: string | null;
  /** Họ tên người đã upload — null nếu quan hệ không giải quyết được. RULE 1: chỉ họ tên. */
  uploadedByName: string | null;
}

export interface ImportBatchDetail extends ImportBatchSummary {
  /** Một TRANG dòng staging (mặc định 50) — lật trang/lọc lỗi qua GET preview?page&onlyErrors. */
  rows: Paginated<ImportRowView>;
}

export interface ImportCommitResult {
  created: number;
  updated: number;
  skipped: number;
}

export interface ImportDiscardResult {
  id: string;
}

/** Tin trong luồng trao đổi nội bộ về một sinh viên. `author` null khi tài khoản đã bị xóa. */
export interface DiscussionMessage {
  id: string;
  /** `null` khi tin đã bị thu hồi — API che nội dung, không chỉ ẩn ở tầng render. */
  body: string | null;
  deletedAt: string | null;
  createdAt: string;
  author: { id: string; staffCode: string; fullName: string } | null;
}

/** Một trang của luồng, kèm mốc đã đọc của chính người đang xem. */
export interface DiscussionThread {
  messages: DiscussionMessage[];
  lastReadAt: string | null;
}

export type BackupType = 'MANUAL' | 'SCHEDULED' | 'PRE_RESTORE';
export type BackupStatus = 'COMPLETED' | 'FAILED' | 'IN_PROGRESS';

export interface BackupMetadata {
  id: string;
  filename: string;
  filepath: string;
  sizeBytes: number;
  checksumSha256: string;
  type: BackupType;
  status: BackupStatus;
  createdAt: string;
  createdByStaffId?: string;
  createdByName?: string;
  comment?: string;
  pgVersion?: string;
  errorMessage?: string;
}

export interface BackupScheduleConfig {
  enabled: boolean;
  cronExpression: string;
  retentionCount: number;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface BackupOverviewStats {
  totalBackups: number;
  totalSizeBytes: number;
  lastBackupAt?: string;
  scheduleConfig: BackupScheduleConfig;
  isLocked: boolean;
  activeOperation?: {
    type: 'BACKUP' | 'RESTORE';
    startedAt: string;
    targetId?: string;
  };
}

/** `GET /statistics/care-overview` — chăm sóc trong một kỳ theo bộ môn / GV / CTSV. */
export interface CareCountRow {
  id: string;
  staffCode: string;
  fullName: string;
  careLogs: number;
  caredStudents: number;
}

export interface CareDepartmentRow {
  id: string;
  code: string;
  name: string;
  careLogs: number;
  caredStudents: number;
  lecturers: CareCountRow[];
}

export interface CareOverview {
  term: { code: string; name: string; startDate: string; endDate: string } | null;
  departments: CareDepartmentRow[];
  sa: { careLogs: number; caredStudents: number; staff: CareCountRow[] };
  /** Luôn đủ 4 mức, Khẩn cấp → Thấp; mỗi SV tính một lần ở mức cao nhất. */
  warnedByLevel: Array<{ level: number; students: number }>;
}
