import { StudentStatus } from '@prisma/client';
import { aliasKey, matchAlias } from '../alias-match';
import { parseClassCode } from '../parsers/class-code';
import type {
  CommitResult,
  ImportCommitter,
  ImportContext,
  ParsedRow,
  PrismaTx,
} from '../types';

interface RosterPayload {
  studentCode: string;
  fullName: string;
  majorAlias: string | null;
  classCode: string;
  subjectCode: string;
  sectionCode: string;
  status: StudentStatus | null;
}

interface CachedStudent {
  id: string;
  fullName: string;
  majorId: string | null;
  classCode: string;
  status: StudentStatus;
}

interface MajorTarget {
  majorId: string;
  departmentId: string;
}

/**
 * Ghi hồ sơ sinh viên + ghi danh từ file "Danh sách sinh viên lớp môn".
 * Chạy SAU importer danh sách lớp (SECTION_LIST) — dòng nào chưa có lớp học
 * phần tương ứng sẽ bị bỏ qua chứ không tự tạo lớp: lớp tạo ở đây sẽ thiếu
 * giảng viên, ca học, phòng và không có cách nào bù lại.
 */
export class RosterCommitter implements ImportCommitter {
  async commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    ctx: ImportContext,
  ): Promise<CommitResult> {
    const payloads = rows.map((row) => row.payload as unknown as RosterPayload);

    const subjects = await tx.subject.findMany({
      where: { code: { in: payloads.map((p) => p.subjectCode) } },
      select: { id: true, code: true, departmentId: true },
    });
    const deptIdBySubject = new Map(
      subjects.map((s) => [s.code, s.departmentId]),
    );

    // Mã ngành trong file ("CHNA") thường không phải mã ngành trong DB — phải
    // đi qua bảng ánh xạ. Nhưng file cũng có khi ghi thẳng mã thật ("LTAI"),
    // nên mã ngành trong DB là fallback; alias vẫn thắng khi trùng. Mã có hậu
    // tố khoá tuyển sinh ("LTWE04") rơi về phần gốc — xem `matchAlias`. Không
    // tra được thì để trống, KHÔNG đoán ngành.
    const [aliases, majors] = await Promise.all([
      tx.majorAlias.findMany({
        select: {
          alias: true,
          major: { select: { id: true, departmentId: true } },
        },
      }),
      tx.major.findMany({
        select: { id: true, code: true, departmentId: true },
      }),
    ]);
    const majorByAlias = new Map<string, MajorTarget>([
      ...majors.map(
        (entry) =>
          [
            aliasKey(entry.code),
            { majorId: entry.id, departmentId: entry.departmentId },
          ] as const,
      ),
      ...aliases.map(
        (entry) =>
          [
            aliasKey(entry.alias),
            { majorId: entry.major.id, departmentId: entry.major.departmentId },
          ] as const,
      ),
    ]);

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
      select: {
        id: true,
        studentCode: true,
        fullName: true,
        majorId: true,
        classCode: true,
        status: true,
      },
    });
    const studentByCode = new Map<string, CachedStudent>(
      students.map((s) => [s.studentCode, s]),
    );

    const enrollments = await tx.enrollment.findMany({
      where: { classSectionId: { in: sections.map((s) => s.id) } },
      select: { studentId: true, classSectionId: true },
    });
    const enrolled = new Set(
      enrollments.map((e) => `${e.studentId}|${e.classSectionId}`),
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const payload of payloads) {
      const classSectionId = sectionIdByCode.get(payload.sectionCode);
      const subjectDeptId = deptIdBySubject.get(payload.subjectCode);
      // Chưa có lớp học phần hoặc môn chưa có trong danh mục → bỏ qua.
      if (!classSectionId || !subjectDeptId) {
        skipped += 1;
        continue;
      }

      const major = payload.majorAlias
        ? (matchAlias(majorByAlias, payload.majorAlias) ?? null)
        : null;
      const studentId = await this.syncStudent(
        tx,
        studentByCode,
        payload,
        major,
        subjectDeptId,
      );

      const key = `${studentId}|${classSectionId}`;
      if (enrolled.has(key)) {
        updated += 1;
        continue;
      }
      // Chỉ tạo quan hệ ghi danh — điểm và chuyên cần do importer
      // GRADE_ATTENDANCE ghi, không đụng ở đây.
      await tx.enrollment.create({ data: { studentId, classSectionId } });
      enrolled.add(key);
      created += 1;
    }

    return { created, updated, skipped };
  }

  /** Tạo mới hoặc lấp chỗ trống hồ sơ sinh viên; trả về id để ghi danh. */
  private async syncStudent(
    tx: PrismaTx,
    cache: Map<string, CachedStudent>,
    payload: RosterPayload,
    major: MajorTarget | null,
    subjectDeptId: string,
  ): Promise<string> {
    const existing = cache.get(payload.studentCode);
    if (!existing) {
      const student = await tx.student.create({
        data: {
          studentCode: payload.studentCode,
          fullName: payload.fullName,
          classCode: payload.classCode,
          majorId: major?.majorId ?? null,
          // departmentId LUÔN có giá trị (RULE 2): ưu tiên bộ môn của ngành,
          // chưa ánh xạ được ngành thì lấy bộ môn của môn đang import.
          departmentId: major?.departmentId ?? subjectDeptId,
          status: payload.status ?? StudentStatus.STUDYING,
        },
        select: { id: true },
      });
      cache.set(payload.studentCode, {
        id: student.id,
        fullName: payload.fullName,
        majorId: major?.majorId ?? null,
        classCode: payload.classCode,
        status: payload.status ?? StudentStatus.STUDYING,
      });
      return student.id;
    }

    const data = diffStudent(existing, payload, major);
    if (Object.keys(data).length > 0) {
      await tx.student.update({ where: { id: existing.id }, data });
      // Dòng sau của cùng sinh viên phải thấy giá trị mới, tránh UPDATE thừa.
      cache.set(payload.studentCode, { ...existing, ...data });
    }
    return existing.id;
  }
}

/** Chỉ ghi trường thực sự đổi — tránh UPDATE vô ích mỗi dòng của cùng sinh viên. */
function diffStudent(
  existing: CachedStudent,
  payload: RosterPayload,
  major: MajorTarget | null,
): Partial<CachedStudent> & { departmentId?: string } {
  const data: Partial<CachedStudent> & { departmentId?: string } = {};
  if (existing.fullName !== payload.fullName) {
    data.fullName = payload.fullName;
  }
  // Chỉ lấp chỗ trống — KHÔNG ghi đè ngành admin đã gán tay. Đổi ngành thì
  // đổi cả bộ môn để hai trường không lệch nhau.
  if (existing.majorId === null && major !== null) {
    data.majorId = major.majorId;
    data.departmentId = major.departmentId;
  }
  // Lớp hành chính ("DM21302") thắng mã lớp học phần ("PDP102.01"): cột
  // "ID lớp" trộn cả hai loại mã. Chỉ lấp khi dòng này là lớp hành chính mà
  // giá trị đang lưu thì không.
  const currentKind = parseClassCode(existing.classCode)?.kind;
  if (
    parseClassCode(payload.classCode)?.kind === 'ADMIN' &&
    currentKind !== 'ADMIN'
  ) {
    data.classCode = payload.classCode;
  }
  // Nhãn lạ (null) không được ghi đè trạng thái đang có.
  if (payload.status !== null && payload.status !== existing.status) {
    data.status = payload.status;
  }
  return data;
}
