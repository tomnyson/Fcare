import { buildSectionCode, parseClassCode } from '../parsers/class-code';
import { parseEnrollmentResult } from '../parsers/gradebook.parser';
import type {
  CommitResult,
  ImportCommitter,
  ImportContext,
  ParsedRow,
  PrismaTx,
} from '../types';

interface GradebookPayload {
  subjectCode: string;
  studentCode: string;
  fullName: string;
  rawClass: string;
  totalScore: number | null;
  resultLabel: string;
}

export class GradebookCommitter implements ImportCommitter {
  async commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    ctx: ImportContext,
  ): Promise<CommitResult> {
    const payloads = rows.map(
      (row) => row.payload as unknown as GradebookPayload,
    );

    const subjects = await tx.subject.findMany({
      where: { code: { in: payloads.map((p) => p.subjectCode) } },
      select: { id: true, code: true, departmentId: true },
    });
    const subjectByCode = new Map(subjects.map((s) => [s.code, s]));

    const rules = await tx.classMajorRule.findMany({
      select: { classPrefix: true, majorId: true },
    });
    const majorIdByPrefix = new Map(
      rules.map((r) => [r.classPrefix, r.majorId]),
    );

    const students = await tx.student.findMany({
      where: { studentCode: { in: payloads.map((p) => p.studentCode) } },
      select: { id: true, studentCode: true, majorId: true, cohort: true },
    });
    const studentByCode = new Map(students.map((s) => [s.studentCode, s]));

    const sections = await tx.classSection.findMany({
      where: { term: ctx.term },
      select: { id: true, code: true },
    });
    const sectionIdByCode = new Map(sections.map((s) => [s.code, s.id]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const payload of payloads) {
      const subject = subjectByCode.get(payload.subjectCode);
      const parsed = parseClassCode(payload.rawClass);
      // Môn chưa có trong danh mục → bỏ qua; chạy importer danh mục trước.
      if (!subject || !parsed) {
        skipped += 1;
        continue;
      }

      // departmentId LUÔN có giá trị: lấy từ bộ môn của môn đang import.
      // Không bao giờ null, không bao giờ dùng placeholder (RULE 2).
      const departmentId = subject.departmentId;
      const majorId =
        parsed.majorPrefix !== null
          ? (majorIdByPrefix.get(parsed.majorPrefix) ?? null)
          : null;

      const existing = studentByCode.get(payload.studentCode);
      let studentId: string;

      if (existing) {
        // Chỉ lấp chỗ trống — KHÔNG ghi đè ngành/khoá admin đã gán tay.
        const data: Record<string, unknown> = { fullName: payload.fullName };
        if (existing.majorId === null && majorId !== null) {
          data.majorId = majorId;
        }
        if (existing.cohort === null && parsed.cohort !== null) {
          data.cohort = parsed.cohort;
        }
        await tx.student.update({ where: { id: existing.id }, data });
        studentId = existing.id;
        updated += 1;
      } else {
        const student = await tx.student.create({
          data: {
            studentCode: payload.studentCode,
            fullName: payload.fullName,
            classCode: parsed.raw,
            cohort: parsed.cohort,
            majorId,
            departmentId,
          },
          select: { id: true },
        });
        studentByCode.set(payload.studentCode, {
          id: student.id,
          studentCode: payload.studentCode,
          majorId,
          cohort: parsed.cohort,
        });
        studentId = student.id;
        created += 1;
      }

      const sectionCode = buildSectionCode(
        payload.subjectCode,
        parsed,
        ctx.term,
      );
      let classSectionId = sectionIdByCode.get(sectionCode);
      if (!classSectionId) {
        const section = await tx.classSection.create({
          data: {
            code: sectionCode,
            term: ctx.term,
            subjectId: subject.id,
            lecturerId: null,
          },
          select: { id: true },
        });
        classSectionId = section.id;
        sectionIdByCode.set(sectionCode, section.id);
      }

      // Chỉ ghi điểm tổng kết + kết quả (quyết định §3). Không đụng
      // midtermScore/finalScore/attendanceRate — không có nguồn dữ liệu.
      const grade = {
        totalScore: payload.totalScore,
        result: parseEnrollmentResult(payload.resultLabel),
      };
      await tx.enrollment.upsert({
        where: { studentId_classSectionId: { studentId, classSectionId } },
        create: { studentId, classSectionId, ...grade },
        update: grade,
      });
    }

    return { created, updated, skipped };
  }
}
