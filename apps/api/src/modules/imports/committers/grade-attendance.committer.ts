import type { EnrollmentResult } from '@prisma/client';
import type {
  CommitResult,
  ImportCommitter,
  ImportContext,
  ParsedRow,
  PrismaTx,
} from '../types';

interface GradePayload {
  studentCode: string;
  sectionCode: string;
  totalScore: number | null;
  result: EnrollmentResult | null;
  isExamBanned: boolean;
  absentSessions: number | null;
  totalSessions: number | null;
  attendanceRate: number | null;
}

interface GradeData {
  totalScore?: number;
  result?: EnrollmentResult;
  isExamBanned?: boolean;
  absentSessions?: number;
  totalSessions?: number;
  attendanceRate?: number;
}

/**
 * Ghi điểm tổng kết + chuyên cần từ file "Lịch học chuyên cần" (LHCT).
 * Chạy CUỐI trong bộ 3 importer đầu kỳ: sinh viên và lớp học phần phải có
 * sẵn (SECTION_LIST rồi ROSTER), dòng nào thiếu một trong hai thì bỏ qua —
 * tạo mới ở đây sẽ ra hồ sơ sinh viên trống ngành/bộ môn.
 */
export class GradeAttendanceCommitter implements ImportCommitter {
  async commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    ctx: ImportContext,
  ): Promise<CommitResult> {
    const payloads = rows.map((row) => row.payload as unknown as GradePayload);

    const sections = await tx.classSection.findMany({
      where: {
        code: { in: payloads.map((p) => p.sectionCode) },
        term: ctx.term,
      },
      select: { id: true, code: true },
    });
    const sectionIdByCode = new Map(sections.map((s) => [s.code, s.id]));

    const students = await tx.student.findMany({
      where: { studentCode: { in: payloads.map((p) => p.studentCode) } },
      select: { id: true, studentCode: true },
    });
    const studentIdByCode = new Map(students.map((s) => [s.studentCode, s.id]));

    const existing = await tx.enrollment.findMany({
      where: { classSectionId: { in: Array.from(sectionIdByCode.values()) } },
      select: { id: true, studentId: true, classSectionId: true },
    });
    const enrollmentIdByKey = new Map(
      existing.map((e) => [`${e.studentId}|${e.classSectionId}`, e.id]),
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const payload of payloads) {
      const studentId = studentIdByCode.get(payload.studentCode);
      const classSectionId = sectionIdByCode.get(payload.sectionCode);
      if (studentId === undefined || classSectionId === undefined) {
        skipped += 1;
        continue;
      }

      const key = `${studentId}|${classSectionId}`;
      const data = gradeDataOf(payload);
      const enrollmentId = enrollmentIdByKey.get(key);

      if (enrollmentId !== undefined) {
        await tx.enrollment.update({ where: { id: enrollmentId }, data });
        updated += 1;
        continue;
      }

      const enrollment = await tx.enrollment.create({
        data: { studentId, classSectionId, ...data },
      });
      // Giữ cache đồng bộ để dòng trùng phía sau cập nhật, không tạo trùng.
      enrollmentIdByKey.set(key, enrollment.id);
      created += 1;
    }

    return { created, updated, skipped };
  }
}

/** Ô trống không được ghi đè dữ liệu đã có — chỉ gửi trường thực sự có giá trị. */
function gradeDataOf(payload: GradePayload): GradeData {
  const data: GradeData = {};
  if (payload.totalScore !== null) {
    data.totalScore = payload.totalScore;
  }
  if (payload.result !== null) {
    data.result = payload.result;
    data.isExamBanned = payload.isExamBanned;
  }
  if (payload.absentSessions !== null) {
    data.absentSessions = payload.absentSessions;
  }
  if (payload.totalSessions !== null) {
    data.totalSessions = payload.totalSessions;
  }
  if (payload.attendanceRate !== null) {
    data.attendanceRate = payload.attendanceRate;
  }
  return data;
}
