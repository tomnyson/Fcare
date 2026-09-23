import * as ExcelJS from 'exceljs';
import type {
  CareReport,
  CareSection,
  CareStudent,
  CareStudentLog,
  CareTotals,
} from './care-statistics.types';
import type { CareStatisticsQuery } from './dto/care-statistics-query.dto';

const CRITERION_LABELS: Record<string, string> = {
  P_NOT_FIT_MAJOR: 'Không phù hợp chuyên ngành',
  P_PART_TIME_JOB: 'Đi làm thêm nhiều',
  P_OTHER_ACTIVITIES: 'Tham gia hoạt động khác nhiều',
  P_FAMILY_HARDSHIP: 'Hoàn cảnh gia đình đặc biệt',
  P_FINANCIAL_HARDSHIP: 'Khó khăn tài chính',
  P_PSYCHOLOGICAL: 'Tâm lý không ổn định',
  P_DROPOUT_INTENT: 'Ý định nghỉ học',
  H_NO_QUIZ_CMS: 'Không làm Quiz / CMS',
  H_EXAM_BAN_RISK: 'Nguy cơ cấm thi',
  H_NO_RESPONSE: 'Không liên lạc được / không phản hồi',
};

/** Nhãn mức cảnh báo — khớp `ALERT_LEVEL_LABELS` (L1..L4) của shared-types. */
const LEVEL_LABELS: Record<number, string> = {
  1: 'Thấp',
  2: 'Trung bình',
  3: 'Cao',
  4: 'Khẩn cấp',
};

/** Giới hạn ký tự của một ô Excel. */
const EXCEL_CELL_LIMIT = 32_767;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const SUMMARY_HEADERS = [
  'Acc GV',
  'Họ tên GV',
  'Bộ môn',
  'Lớp môn',
  'Sĩ số SV',
  'Lượt cảnh báo',
  'Lượt chăm sóc',
  'Tỷ lệ chăm sóc',
  'Lượt nhận xét',
  'Lượt nhật ký',
  'Lượt GV chăm sóc',
];
const SUMMARY_WIDTHS = [14, 26, 22, 22, 11, 14, 14, 15, 14, 13, 17];

const LECTURER_HEADERS = [
  'Acc GV',
  'Họ tên GV',
  'Bộ môn',
  'Số lớp môn',
  'Sĩ số SV (không trùng)',
  'Lượt cảnh báo',
  'Lượt chăm sóc',
  'Tỷ lệ chăm sóc',
  'Lượt nhận xét',
  'Lượt nhật ký',
  'Lượt GV chăm sóc',
  'Lượt trao đổi',
  'CB điểm danh',
  'GV lớp đã CS',
  'GV khác CS',
  'CB chờ GV lớp',
];
const LECTURER_WIDTHS = [
  14, 26, 22, 12, 14, 14, 14, 15, 14, 13, 17, 13, 14, 14, 13, 15,
];

const DETAIL_FIXED_HEADERS = [
  'Acc GV',
  'Họ tên GV',
  'Bộ môn',
  'Lớp môn',
  'Tên môn học',
  'Mã SV',
  'Họ tên SV',
  'Trạng thái',
  'Mức cảnh báo',
  'Nhận xét của GV (Nguyên nhân cần chăm sóc)',
];
const DETAIL_FIXED_WIDTHS = [14, 24, 20, 20, 28, 13, 24, 15, 18, 50];
const DISCUSSION_HEADER = 'Trao đổi thảo luận giữa GV & CB';

const SUMMARY_DEFINITIONS =
  'Mỗi dòng là một lớp môn. Sĩ số SV: sinh viên của lớp môn. Lượt cảnh báo: số SV của lớp có cảnh báo trong kỳ (gắn lớp này hoặc không gắn lớp nào). Lượt chăm sóc: số SV cảnh báo đã có ít nhất một nhật ký chăm sóc trong kỳ (nhận xét và trao đổi nội bộ không tính là chăm sóc). Tỷ lệ chăm sóc = Lượt chăm sóc / Lượt cảnh báo (chỉ tính trên SV cảnh báo, không tính trên sĩ số). Lượt nhận xét, Lượt nhật ký, Lượt GV chăm sóc: đếm trên SV cảnh báo; Lượt nhật ký gồm nhật ký của mọi người (GV, CB), Lượt GV chăm sóc chỉ nhật ký do giảng viên đứng lớp ghi.';
const DETAIL_DEFINITIONS =
  'Chỉ gồm sinh viên có cảnh báo trong kỳ (đã hoặc chưa được chăm sóc); mỗi dòng là một sinh viên trong một lớp môn. Mỗi lần GV hoặc CB ghi nhật ký chăm sóc là một cột "Nhật ký chăm sóc lần X" (lần 1 là sớm nhất), ghi giờ, ngày, Acc người chăm sóc và nội dung. Mức cảnh báo: mức cao nhất trong kỳ tại lớp này.';

function formatDateVN(date: Date | string): string {
  return new Date(date).toLocaleString('vi-VN', {
    timeZone: TIME_ZONE,
    hour12: false,
  });
}

/** `HH:mm dd/MM/yyyy` theo giờ Việt Nam. */
function formatTimeDate(date: Date | string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
      .formatToParts(new Date(date))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}

function cell(text: string): string {
  return text.length > EXCEL_CELL_LIMIT
    ? `${text.slice(0, EXCEL_CELL_LIMIT - 1)}…`
    : text;
}

function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${rate}%`;
}

function formatLevel(level: number | null): string {
  if (!level) return 'Không có';
  return `Mức ${level} - ${LEVEL_LABELS[level] ?? ''}`.trim();
}

function formatEvaluations(student: CareStudent): string {
  return (student.evaluations ?? [])
    .map((mark) => {
      const reasons = mark.criteria
        .map((c) => CRITERION_LABELS[c] ?? c)
        .join(', ');
      const lines = [
        `${formatTimeDate(mark.updatedAt)} — Acc ${mark.evaluatorStaffCode}`,
        reasons ? `Nguyên nhân: ${reasons}` : '',
        mark.note ? `Ghi chú: ${mark.note}` : '',
        `Điểm học tập ${mark.academicScore}/10 · Thái độ ${mark.attitudeScore}/10 · Vắng ${mark.absentSessions ?? 0} buổi`,
      ];
      return lines.filter(Boolean).join('\n');
    })
    .join('\n\n');
}

function formatLog(log: CareStudentLog): string {
  return `${formatTimeDate(log.createdAt)} — Acc ${log.staffCode} — ${log.content}`;
}

function formatDiscussions(student: CareStudent): string {
  return [...(student.discussions ?? [])]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(
      (msg) =>
        `${formatTimeDate(msg.createdAt)} — Acc ${msg.authorCode}: ${msg.body}`,
    )
    .join('\n\n');
}

/** Nhật ký tăng dần theo thời gian: lần 1 là lần chăm sóc sớm nhất. */
function chronologicalLogs(student: CareStudent): CareStudentLog[] {
  return [...(student.careLogs ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

function filterLabel(report: CareReport, query: CareStatisticsQuery): string {
  const lecturers = report.lecturers;
  const lecturer = query.lecturerId
    ? (lecturers.find((l) => l.id === query.lecturerId)?.fullName ??
      query.lecturerId)
    : 'Tất cả';
  const department = query.departmentId
    ? (lecturers.find((l) => l.department?.id === query.departmentId)
        ?.department?.name ?? query.departmentId)
    : 'Tất cả';
  const status =
    query.status === 'cared'
      ? 'Đã chăm sóc'
      : query.status === 'uncared'
        ? 'Chưa chăm sóc'
        : 'Tất cả';
  return `Bộ lọc áp dụng: Bộ môn ${department}; Giảng viên ${lecturer}; Trạng thái ${status}`;
}

function addSheet(
  workbook: ExcelJS.Workbook,
  meta: string[],
  name: string,
  headers: string[],
  widths: number[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name);
  meta.forEach((line, index) => {
    sheet.addRow([line]);
    const row = index + 1;
    sheet.mergeCells(row, 1, row, headers.length);
    sheet.getRow(row).alignment = { wrapText: true, vertical: 'middle' };
    sheet.getRow(row).height = row === meta.length ? 58 : 26;
  });

  const header = sheet.addRow(headers);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF16304E' },
  };
  header.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: true,
  };
  header.height = 32;

  sheet.columns.forEach((column, index) => {
    column.width = widths[index] ?? 40;
  });
  sheet.views = [{ state: 'frozen', ySplit: header.number }];
  sheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: header.number, column: headers.length },
  };
  return sheet;
}

function careCounts(entry: CareTotals & { studentCount: number }) {
  return [
    entry.studentCount,
    entry.alertedStudentCount,
    entry.caredCount,
    formatRate(entry.careRate),
    entry.evaluationCount,
    entry.careLogCount,
    entry.ownerCareLogCount,
  ];
}

function writeSummary(
  workbook: ExcelJS.Workbook,
  report: CareReport,
  meta: (definitions: string) => string[],
): void {
  const classes = addSheet(
    workbook,
    meta(SUMMARY_DEFINITIONS),
    'Tổng hợp theo lớp môn',
    SUMMARY_HEADERS,
    SUMMARY_WIDTHS,
  );
  for (const lecturer of report.lecturers) {
    for (const section of lecturer.sections) {
      classes.addRow([
        lecturer.staffCode,
        lecturer.fullName,
        lecturer.department?.name ?? '—',
        section.code,
        ...careCounts(section),
      ]);
    }
  }

  const lecturers = addSheet(
    workbook,
    meta(
      'Mỗi dòng là một giảng viên; sinh viên học nhiều lớp của cùng giảng viên chỉ tính một lần. Lượt cảnh báo = số SV có cảnh báo; Tỷ lệ chăm sóc = Lượt chăm sóc / Lượt cảnh báo. Các cột điểm danh đếm cảnh báo điểm danh tự động theo từng lớp.',
    ),
    'Tổng hợp giảng viên',
    LECTURER_HEADERS,
    LECTURER_WIDTHS,
  );
  for (const lecturer of report.lecturers) {
    lecturers.addRow([
      lecturer.staffCode,
      lecturer.fullName,
      lecturer.department?.name ?? '—',
      lecturer.sectionCount,
      ...careCounts(lecturer),
      lecturer.discussionCount,
      lecturer.attendanceAlerts.total,
      lecturer.attendanceAlerts.caredByOwner,
      lecturer.attendanceAlerts.caredByOthers,
      lecturer.attendanceAlerts.pending,
    ]);
  }
}

function writeDetail(
  workbook: ExcelJS.Workbook,
  report: CareReport,
  meta: string[],
): void {
  const rows = report.lecturers.flatMap((lecturer) =>
    lecturer.sections.flatMap((section: CareSection) =>
      section.students.map((student) => ({
        lecturer,
        section,
        student,
        logs: chronologicalLogs(student),
      })),
    ),
  );
  // Luôn có ít nhất cột "lần 1" để file có cấu trúc cố định.
  const logColumns = Math.max(1, ...rows.map((row) => row.logs.length));
  const logHeaders = Array.from(
    { length: logColumns },
    (_, index) => `Nhật ký chăm sóc lần ${index + 1}`,
  );

  const sheet = addSheet(
    workbook,
    meta,
    'Chi tiết nội dung chăm sóc',
    [...DETAIL_FIXED_HEADERS, ...logHeaders, DISCUSSION_HEADER],
    [...DETAIL_FIXED_WIDTHS, ...logHeaders.map(() => 42), 50],
  );

  for (const { lecturer, section, student, logs } of rows) {
    const logCells = logHeaders.map((_, index) =>
      logs[index] ? cell(formatLog(logs[index])) : '',
    );
    const row = sheet.addRow([
      lecturer.staffCode,
      lecturer.fullName,
      lecturer.department?.name ?? '—',
      section.code,
      section.subjectName,
      student.studentCode,
      student.fullName,
      student.cared ? 'Đã chăm sóc' : 'Chưa chăm sóc',
      formatLevel(student.alertLevel),
      cell(formatEvaluations(student)),
      ...logCells,
      cell(formatDiscussions(student)),
    ]);
    row.alignment = { vertical: 'top', wrapText: true };
  }
}

/** Dựng file Excel chăm sóc: `summary` (theo lớp môn) hoặc `detailed` (nội dung). */
export async function buildCareWorkbook(
  report: CareReport,
  query: CareStatisticsQuery,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FCare';
  const meta = (definitions: string) => [
    `Học kỳ: ${report.term.code} — ${report.term.name}`,
    `Thời gian học kỳ: ${formatDateVN(report.term.startDate)} — ${formatDateVN(report.term.endDate)} | Thời điểm xuất: ${formatDateVN(report.generatedAt)}`,
    filterLabel(report, query),
    definitions,
  ];

  if (query.mode === 'detailed') {
    writeDetail(workbook, report, meta(DETAIL_DEFINITIONS));
  } else {
    writeSummary(workbook, report, meta);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
