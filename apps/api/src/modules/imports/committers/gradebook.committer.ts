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

interface CachedStudent {
  id: string;
  studentCode: string;
  fullName: string;
  majorId: string | null;
  cohort: string | null;
  classCode: string;
}

interface CachedSection {
  id: string;
  subjectId: string;
}

/** "20" → "K20" — cả hệ thống dùng định dạng K + hai chữ số khoá (seed,
 * schema.prisma), không phải hai chữ số thô mà `parseClassCode` trả ra. */
function cohortLabel(digits: string): string {
  return `K${digits}`;
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
      select: {
        id: true,
        studentCode: true,
        fullName: true,
        majorId: true,
        cohort: true,
        classCode: true,
      },
    });
    const studentByCode = new Map<string, CachedStudent>(
      students.map((s) => [s.studentCode, s]),
    );

    // subjectId đi kèm để phát hiện tái dùng lớp học phần sai môn: với lớp
    // hành chính buildSectionCode nhúng subjectCode vào mã, nhưng với lớp
    // học phần (SECTION) thì không — hai môn khác nhau có thể đụng cùng
    // sectionCode nếu tái dùng mã lớp thô.
    const sections = await tx.classSection.findMany({
      where: { term: ctx.term },
      select: { id: true, code: true, subjectId: true },
    });
    const sectionByCode = new Map<string, CachedSection>(
      sections.map((s) => [s.code, { id: s.id, subjectId: s.subjectId }]),
    );

    let created = 0;
    let skipped = 0;
    const updatedStudentIds = new Set<string>();

    for (const payload of payloads) {
      const subject = subjectByCode.get(payload.subjectCode);
      const parsed = parseClassCode(payload.rawClass);
      // Môn chưa có trong danh mục → bỏ qua; chạy importer danh mục trước.
      if (!subject || !parsed) {
        skipped += 1;
        continue;
      }

      const sectionCode = buildSectionCode(
        payload.subjectCode,
        parsed,
        ctx.term,
      );
      const existingSection = sectionByCode.get(sectionCode);
      // Lớp đã tồn tại nhưng thuộc môn khác → KHÔNG ghi enrollment, tính vào
      // skipped. Mất dữ liệu nhìn thấy được tốt hơn gán nhầm môn âm thầm
      // (nguyên tắc đã chốt ở Task 8).
      if (existingSection && existingSection.subjectId !== subject.id) {
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
      const cohort = parsed.cohort !== null ? cohortLabel(parsed.cohort) : null;

      const existing = studentByCode.get(payload.studentCode);
      let studentId: string;

      if (existing) {
        // Chỉ ghi trường thực sự đổi — tránh UPDATE vô ích ghi lại đúng giá
        // trị cũ mỗi dòng lặp lại của cùng sinh viên.
        const data: Record<string, unknown> = {};
        if (existing.fullName !== payload.fullName) {
          data.fullName = payload.fullName;
        }
        // Chỉ lấp chỗ trống — KHÔNG ghi đè ngành/khoá admin đã gán tay.
        if (existing.majorId === null && majorId !== null) {
          data.majorId = majorId;
        }
        if (existing.cohort === null && cohort !== null) {
          data.cohort = cohort;
        }
        // Ưu tiên: lớp hành chính (ADMIN) thắng lớp học phần (SECTION) —
        // không bao giờ ghi đè một classCode hành chính đã có bằng mã lớp
        // học phần. Chỉ lấp khi dòng hiện tại là ADMIN mà classCode hiện
        // tại KHÔNG phải lớp hành chính.
        const currentKind = existing.classCode
          ? parseClassCode(existing.classCode)?.kind
          : undefined;
        if (parsed.kind === 'ADMIN' && currentKind !== 'ADMIN') {
          data.classCode = parsed.raw;
        }

        if (Object.keys(data).length > 0) {
          await tx.student.update({ where: { id: existing.id }, data });
          updatedStudentIds.add(existing.id);
          // Đồng bộ cache: dòng tiếp theo của CÙNG sinh viên trong batch này
          // phải thấy giá trị mới, không thì sẽ tính lại "thay đổi" và ghi
          // UPDATE thừa lần nữa.
          studentByCode.set(payload.studentCode, {
            ...existing,
            fullName:
              (data.fullName as string | undefined) ?? existing.fullName,
            majorId:
              (data.majorId as string | null | undefined) ?? existing.majorId,
            cohort:
              (data.cohort as string | null | undefined) ?? existing.cohort,
            classCode:
              (data.classCode as string | undefined) ?? existing.classCode,
          });
        }
        studentId = existing.id;
      } else {
        const student = await tx.student.create({
          data: {
            studentCode: payload.studentCode,
            fullName: payload.fullName,
            classCode: parsed.raw,
            cohort,
            majorId,
            departmentId,
          },
          select: { id: true },
        });
        studentByCode.set(payload.studentCode, {
          id: student.id,
          studentCode: payload.studentCode,
          fullName: payload.fullName,
          majorId,
          cohort,
          classCode: parsed.raw,
        });
        studentId = student.id;
        created += 1;
      }

      let classSectionId = existingSection?.id;
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
        sectionByCode.set(sectionCode, {
          id: section.id,
          subjectId: subject.id,
        });
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

    return { created, updated: updatedStudentIds.size, skipped };
  }
}
