/**
 * Số buổi vắng đưa vào R_C. Giảng viên tự ghi thì dùng số đó; bỏ trống thì
 * lấy số buổi nghỉ từ dữ liệu điểm danh đã import của CHÍNH lớp học phần được
 * nhận xét — trước đây bỏ trống là R_C = 0 dù hệ thống đã biết sinh viên vắng.
 */
export function attendanceOfStudentSelect(studentId: string) {
  return {
    select: {
      enrollments: {
        where: { studentId },
        select: { absentSessions: true },
        take: 1,
      },
    },
  } as const;
}

interface EvaluationAbsenceRow {
  absentSessions: number | null;
  classSection: { enrollments: { absentSessions: number | null }[] };
}

export function effectiveAbsentSessions(
  row: EvaluationAbsenceRow,
): number | null {
  return (
    row.absentSessions ??
    row.classSection.enrollments[0]?.absentSessions ??
    null
  );
}
