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
    // rồi so khớp ở JS bằng `nameKey`. KHÔNG lọc bằng `where: { fullName: {
    // in: ... } } }`: Postgres so khớp CHÍNH XÁC (phân biệt hoa/thường và
    // khoảng trắng) nên tên chỉ khác hoa/thường sẽ không bao giờ lọt qua bộ
    // lọc, làm nhánh chuẩn hoá `nameKey` phía dưới thành code chết.
    const staff = await tx.staff.findMany({
      select: { id: true, fullName: true, username: true },
    });
    const staffIdByNameKey = new Map(
      staff.map((s) => [nameKey(s.fullName), s.id]),
    );
    // `Staff.username` là username nội bộ do importer T.Kê (Task 7) ghi từ
    // chính họ file phân công này — KHÔNG phải email. Khớp theo username là
    // khớp khoá chính xác, không phải suy đoán: cột "Phân công giảng viên"
    // chủ yếu chứa username, họ tên chỉ là ngoại lệ hiếm.
    const staffIdByUsername = new Map(
      staff
        .filter(
          (s): s is typeof s & { username: string } => s.username !== null,
        )
        .map((s) => [s.username.toLowerCase(), s.id]),
    );

    /** Thử họ tên trước, rồi username. Trùng cả hai thì họ tên thắng. */
    function resolveLecturerId(rawName: string): string | null {
      const byName = staffIdByNameKey.get(nameKey(rawName));
      if (byName) {
        return byName;
      }
      return staffIdByUsername.get(rawName.trim().toLowerCase()) ?? null;
    }

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
      const subjectId = subjectIdByCode.get(payload.subjectCode);
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

      // Tên không khớp Staff nào → để trống. KHÔNG tự tạo tài khoản giảng viên
      // từ một chuỗi tên: đó là việc của importer T.Kê.
      const lecturerId = payload.lecturerName
        ? resolveLecturerId(payload.lecturerName)
        : null;

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
