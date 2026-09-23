import type {
  CareAttendanceTotals,
  CareStudent,
  CareStudentAttendanceAlert,
} from './care-statistics.types';

interface AttendanceAlertRow {
  studentId: string;
  classSectionId: string | null;
  level: number;
  absentSessions: number | null;
  ownerCaredAt: Date | null;
  createdAt: Date;
  careLogCount: number;
}

export const attendanceKey = (sectionId: string, studentId: string): string =>
  `${sectionId}:${studentId}`;

/**
 * Một sinh viên tại một lớp có thể có nhiều cảnh báo điểm danh (cấp 2 bị
 * thay bằng cấp 3, hoặc đã xử lý rồi vắng tiếp) — thống kê lấy bản MỚI NHẤT.
 */
export function latestAttendanceAlerts(
  rows: readonly AttendanceAlertRow[],
): Map<string, CareStudentAttendanceAlert> {
  const latest = new Map<string, AttendanceAlertRow>();
  for (const row of rows) {
    if (!row.classSectionId) continue;
    const key = attendanceKey(row.classSectionId, row.studentId);
    const previous = latest.get(key);
    if (previous && previous.createdAt >= row.createdAt) continue;
    latest.set(key, row);
  }
  return new Map(
    [...latest].map(([key, row]) => [
      key,
      {
        level: row.level,
        absentSessions: row.absentSessions,
        ownerCaredAt: row.ownerCaredAt?.toISOString() ?? null,
        careLogCount: row.careLogCount,
        createdAt: row.createdAt.toISOString(),
      },
    ]),
  );
}

/** Tính trên từng dòng sinh viên-lớp (KHÔNG gộp theo sinh viên: cảnh báo là theo lớp). */
export function attendanceTotals(
  students: readonly CareStudent[],
): CareAttendanceTotals {
  const alerts = students.flatMap((student) =>
    student.attendanceAlert ? [student.attendanceAlert] : [],
  );
  const caredByOwner = alerts.filter(
    (alert) => alert.ownerCaredAt !== null,
  ).length;
  const caredByOthers = alerts.filter(
    (alert) => alert.ownerCaredAt === null && alert.careLogCount > 0,
  ).length;
  return {
    total: alerts.length,
    caredByOwner,
    caredByOthers,
    pending: alerts.length - caredByOwner,
  };
}

export function formatAttendanceAlert(
  alert: CareStudentAttendanceAlert | null,
): string {
  if (!alert) return 'Không có';
  const absent =
    alert.absentSessions === null ? '' : ` — vắng ${alert.absentSessions} buổi`;
  return `Mức ${alert.level}${absent}`;
}

export function formatOwnerCared(
  alert: CareStudentAttendanceAlert | null,
): string {
  if (!alert) return '—';
  return alert.ownerCaredAt ? 'GV đã chăm sóc' : 'Chưa';
}
