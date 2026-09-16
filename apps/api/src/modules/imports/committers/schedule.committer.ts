import { buildSectionCode, parseClassCode } from '../parsers/class-code';
import type {
  CommitResult,
  ImportCommitter,
  ImportContext,
  ParsedRow,
  PrismaTx,
} from '../types';

interface SchedulePayload {
  subjectCode: string;
  classCode: string;
  block: number | null;
  slot: string | null;
  weekdays: string | null;
  room: string | null;
  capacity: number | null;
  trainingTime: string | null;
  startDate: string | null;
  totalHours: number | null;
  lecturerName: string | null;
}

function nameKey(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

export class ScheduleCommitter implements ImportCommitter {
  async commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    ctx: ImportContext,
  ): Promise<CommitResult> {
    const payloads = rows.map(
      (row) => row.payload as unknown as SchedulePayload,
    );

    const subjects = await tx.subject.findMany({
      where: { code: { in: payloads.map((p) => p.subjectCode) } },
      select: { id: true, code: true },
    });
    const subjectIdByCode = new Map(subjects.map((s) => [s.code, s.id]));

    // Bảng Staff là danh sách nhân sự của trường — nhỏ, nạp toàn bộ một lần
    // rồi so khớp ở JS bằng `nameKey` hoặc `staffCode` / `username`.
    // Khớp không phân biệt hoa thường theo cột manv hoặc username.
    const staff = await tx.staff.findMany({
      select: {
        id: true,
        staffCode: true,
        fullName: true,
        username: true,
        departmentId: true,
      },
    });
    const staffIdByNameKey = new Map(
      staff.map((s) => [nameKey(s.fullName), s.id]),
    );
    const staffIdByCodeOrUser = new Map<string, string>();
    const staffDeptMap = new Map<string, string>();
    for (const s of staff) {
      if (s.departmentId) {
        staffDeptMap.set(s.id, s.departmentId);
      }
      if (s.staffCode) {
        staffIdByCodeOrUser.set(s.staffCode.trim().toLowerCase(), s.id);
      }
      if (s.username) {
        staffIdByCodeOrUser.set(s.username.trim().toLowerCase(), s.id);
      }
    }

    /** Thử họ tên trước, rồi staffCode / username. Trùng cả hai thì họ tên thắng. */
    function resolveLecturerId(rawName: string): string | null {
      const byName = staffIdByNameKey.get(nameKey(rawName));
      if (byName) {
        return byName;
      }
      return staffIdByCodeOrUser.get(rawName.trim().toLowerCase()) ?? null;
    }

    let deptByPrefix: Map<string, string> | null = null;
    let defaultDepartmentId: string | null = null;

    const getDepartmentForSubject = async (
      subjectCode: string,
      lecturerId: string | null,
    ): Promise<string | null> => {
      if (!tx.department?.findMany) return null;
      if (!deptByPrefix) {
        const [allDepartments, allSubjects] = await Promise.all([
          tx.department.findMany({ select: { id: true, code: true } }),
          tx.subject.findMany({ select: { code: true, departmentId: true } }),
        ]);
        defaultDepartmentId = allDepartments[0]?.id ?? null;
        deptByPrefix = new Map<string, string>();
        for (const s of allSubjects) {
          const match = s.code.match(/^[A-Za-z]+/);
          if (match && !deptByPrefix.has(match[0].toUpperCase())) {
            deptByPrefix.set(match[0].toUpperCase(), s.departmentId);
          }
        }
      }
      const prefixMatch = subjectCode.match(/^[A-Za-z]+/);
      const prefix = prefixMatch ? prefixMatch[0].toUpperCase() : '';
      return (
        deptByPrefix.get(prefix) ??
        (lecturerId ? (staffDeptMap.get(lecturerId) ?? null) : null) ??
        defaultDepartmentId
      );
    };

    const codes = payloads.map((payload) => {
      const parsed = parseClassCode(payload.classCode);
      return parsed
        ? buildSectionCode(payload.subjectCode, parsed, ctx.term)
        : '';
    });
    const existing = await tx.classSection.findMany({
      where: { code: { in: codes }, term: ctx.term },
      select: { id: true, code: true },
    });
    const sectionIdByCode = new Map(existing.map((s) => [s.code, s.id]));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    // Khoá gộp của parser có `block`, nhưng `buildSectionCode` thì không —
    // hai dòng khác block có thể sinh cùng mã lớp học phần. Nếu mã này đã
    // được xử lý trong CHÍNH lô này rồi, bỏ qua thay vì ghi đè âm thầm
    // (last-write-wins). Mất dữ liệu nhìn thấy được (skipped) tốt hơn mất
    // dữ liệu âm thầm.
    const processedCodes = new Set<string>();

    for (const payload of payloads) {
      const lecturerId = payload.lecturerName
        ? resolveLecturerId(payload.lecturerName)
        : null;

      let subjectId = subjectIdByCode.get(payload.subjectCode);
      if (!subjectId && tx.subject?.create) {
        const deptId = await getDepartmentForSubject(
          payload.subjectCode,
          lecturerId,
        );
        if (deptId) {
          const createdSubject = await tx.subject.create({
            data: {
              code: payload.subjectCode,
              name: payload.subjectCode,
              credits: 3,
              departmentId: deptId,
            },
            select: { id: true, code: true },
          });
          subjectId = createdSubject.id;
          subjectIdByCode.set(payload.subjectCode, subjectId);
        }
      }

      const parsed = parseClassCode(payload.classCode);
      // Môn chưa có trong danh mục → bỏ qua. Chạy importer danh mục trước.
      if (!subjectId || !parsed) {
        skipped += 1;
        continue;
      }

      const code = buildSectionCode(payload.subjectCode, parsed, ctx.term);
      if (processedCodes.has(code)) {
        skipped += 1;
        continue;
      }
      processedCodes.add(code);

      const data = {
        subjectId,
        lecturerId,
        term: ctx.term,
        block: payload.block,
        slot: payload.slot,
        weekdays: payload.weekdays,
        room: payload.room,
        capacity: payload.capacity,
        trainingTime: payload.trainingTime,
        startDate: payload.startDate ? new Date(payload.startDate) : null,
        totalHours: payload.totalHours,
      };

      const existingId = sectionIdByCode.get(code);
      if (existingId) {
        await tx.classSection.update({ where: { id: existingId }, data });
        updated += 1;
      } else {
        const section = await tx.classSection.create({
          data: { code, ...data },
          select: { id: true },
        });
        sectionIdByCode.set(code, section.id);
        created += 1;
      }
    }

    return { created, updated, skipped };
  }
}
