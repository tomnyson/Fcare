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
  block: number | null;
  slot: string | null;
  room: string | null;
  capacity: number | null;
  startDate: string | null;
  lecturerUsername: string | null;
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

    const subjects = await tx.subject.findMany({
      where: { code: { in: payloads.map((p) => p.subjectCode) } },
      select: { id: true, code: true },
    });
    const subjectIdByCode = new Map(subjects.map((s) => [s.code, s.id]));

    // Cột "Giảng viên" chứa username nội bộ (vd "dungnth6"), KHÔNG phải email
    // (RULE 1). Khớp khoá chính xác với `Staff.username`, không suy đoán theo
    // họ tên. Bảng Staff nhỏ nên nạp một lần rồi so khớp ở JS: Postgres so
    // khớp phân biệt hoa/thường nên lọc bằng `in` sẽ bỏ sót "DungNTH6".
    const staff = await tx.staff.findMany({
      select: { id: true, username: true },
    });
    const staffIdByUsername = new Map(
      staff
        .filter(
          (s): s is typeof s & { username: string } => s.username !== null,
        )
        .map((s) => [s.username.trim().toLowerCase(), s.id]),
    );

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
      const subjectId = subjectIdByCode.get(payload.subjectCode);
      // Môn chưa có trong danh mục → bỏ qua; chạy importer danh mục trước.
      if (!subjectId || processedCodes.has(payload.code)) {
        skipped += 1;
        continue;
      }
      processedCodes.add(payload.code);

      const data = {
        subjectId,
        lecturerId: payload.lecturerUsername
          ? (staffIdByUsername.get(
              payload.lecturerUsername.trim().toLowerCase(),
            ) ?? null)
          : null,
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
