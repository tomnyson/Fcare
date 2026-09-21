/**
 * Ô "Số buổi đã vắng" của form nhận xét. Hệ thống đã có số buổi nghỉ từ file
 * điểm danh import (`enrollment.absentSessions`), nên form điền sẵn số đó thay
 * vì bắt giảng viên gõ lại — bỏ trống trước đây làm R_C luôn bằng 0.
 */

interface EnrollmentAttendance {
  absentSessions: number | null;
  classSection?: { id: string };
}

export function attendanceBySection(
  enrollments: readonly EnrollmentAttendance[],
): Readonly<Record<string, number | null>> {
  return Object.fromEntries(
    enrollments.flatMap((enrollment) =>
      enrollment.classSection ? [[enrollment.classSection.id, enrollment.absentSessions]] : [],
    ),
  );
}

/** Số giảng viên đã ghi ưu tiên; chưa ghi thì lấy số của hệ thống. */
export function initialAbsentValue(
  recorded: number | null | undefined,
  system: number | null | undefined,
): string {
  const value = recorded ?? system;
  return value === null || value === undefined ? '' : String(value);
}

export function parseAbsentInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function absenceSourceHint(system: number | null | undefined, current: string): string {
  if (system === null || system === undefined) {
    return 'Hệ thống chưa có dữ liệu điểm danh của lớp này — nhập tay nếu bạn có theo dõi.';
  }
  if (parseAbsentInput(current) === system) {
    return 'Tự động điền từ dữ liệu điểm danh đã import. Sửa lại nếu bạn ghi nhận khác.';
  }
  return `Dữ liệu điểm danh của hệ thống ghi ${system} buổi.`;
}
