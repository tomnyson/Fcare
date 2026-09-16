import type {
  CommitResult,
  ImportCommitter,
  ImportContext,
  ParsedRow,
  PrismaTx,
} from '../types';

interface SectionListPayload {
  code: string;
  classCode: string;
  subjectCode: string;
  altSubjectCode?: string | null;
  subjectName?: string | null;
  block: number | null;
  slot: string | null;
  room: string | null;
  capacity: number | null;
  startDate: string | null;
  lecturerUsername: string | null;
}

function nameKey(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Ghi lớp học phần từ file "Danh sách lớp" nhà trường gửi đầu kỳ.
 * Chạy TRƯỚC importer ROSTER và GRADE_ATTENDANCE — hai loại đó cần lớp
 * học phần đã tồn tại mới ghi được ghi danh và điểm.
 */
export class SectionListCommitter implements ImportCommitter {
  async commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    ctx: ImportContext,
  ): Promise<CommitResult> {
    const payloads = rows.map(
      (row) => row.payload as unknown as SectionListPayload,
    );

    const allSubjectCodes = new Set<string>();
    for (const p of payloads) {
      if (p.subjectCode) allSubjectCodes.add(p.subjectCode);
      if (p.altSubjectCode) allSubjectCodes.add(p.altSubjectCode);
    }

    const subjects = await tx.subject.findMany({
      where: { code: { in: Array.from(allSubjectCodes) } },
      select: { id: true, code: true },
    });
    const subjectIdByCode = new Map(
      subjects.map((s) => [s.code.toUpperCase(), s.id]),
    );

    // Cột "Giảng viên" trong file tương ứng với cột manv (staffCode) hoặc username nội bộ
    // (vd "sonlh32", "dungnth6"). Khớp đồng nhất không phân biệt hoa/thường.
    const staff = await tx.staff.findMany({
      select: {
        id: true,
        staffCode: true,
        username: true,
        fullName: true,
        departmentId: true,
      },
    });
    const staffIdByNameKey = new Map(
      staff.filter((s) => s.fullName).map((s) => [nameKey(s.fullName), s.id]),
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

    function resolveLecturerId(raw: string | null): string | null {
      if (!raw) return null;
      const byName = staffIdByNameKey.get(nameKey(raw));
      if (byName) {
        return byName;
      }
      return staffIdByCodeOrUser.get(raw.trim().toLowerCase()) ?? null;
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

    const existing = await tx.classSection.findMany({
      where: { code: { in: payloads.map((p) => p.code) }, term: ctx.term },
      select: { id: true, code: true },
    });
    const sectionIdByCode = new Map(existing.map((s) => [s.code, s.id]));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    // Cùng mã lớp xuất hiện hai lần trong một file → chỉ ghi dòng đầu. Ghi đè
    // âm thầm (last-write-wins) làm mất dữ liệu mà admin không nhìn thấy.
    const processedCodes = new Set<string>();

    for (const payload of payloads) {
      const lecturerId = resolveLecturerId(payload.lecturerUsername);

      const subKey = payload.subjectCode.trim().toUpperCase();
      const altKey = payload.altSubjectCode
        ? payload.altSubjectCode.trim().toUpperCase()
        : null;

      let subjectId = subjectIdByCode.get(subKey);
      if (!subjectId && altKey) {
        subjectId = subjectIdByCode.get(altKey);
      }

      // Nếu môn học chưa có trong danh mục, tự động tạo nếu có thể để không làm mất lớp học và phân công giảng viên
      if (!subjectId && tx.subject?.create) {
        const deptId = await getDepartmentForSubject(subKey, lecturerId);
        if (deptId) {
          const createdSubject = await tx.subject.create({
            data: {
              code: subKey,
              name: payload.subjectName || subKey,
              credits: 3,
              departmentId: deptId,
            },
            select: { id: true, code: true },
          });
          subjectId = createdSubject.id;
          subjectIdByCode.set(subKey, subjectId);
          if (altKey) {
            subjectIdByCode.set(altKey, subjectId);
          }
        }
      }

      if (subjectId) {
        subjectIdByCode.set(subKey, subjectId);
      }

      if (!subjectId || processedCodes.has(payload.code)) {
        skipped += 1;
        continue;
      }
      processedCodes.add(payload.code);

      const data = {
        subjectId,
        lecturerId,
        term: ctx.term,
        block: payload.block,
        slot: payload.slot,
        room: payload.room,
        capacity: payload.capacity,
        startDate: payload.startDate ? new Date(payload.startDate) : null,
      };

      const existingId = sectionIdByCode.get(payload.code);
      if (existingId) {
        await tx.classSection.update({ where: { id: existingId }, data });
        updated += 1;
      } else {
        const section = await tx.classSection.create({
          data: { code: payload.code, ...data },
          select: { id: true },
        });
        sectionIdByCode.set(payload.code, section.id);
        created += 1;
      }
    }

    return { created, updated, skipped };
  }
}
