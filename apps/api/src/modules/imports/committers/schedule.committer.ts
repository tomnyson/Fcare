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

    const lecturerNames = payloads
      .map((p) => p.lecturerName)
      .filter((name): name is string => name !== null);
    const staff =
      lecturerNames.length > 0
        ? await tx.staff.findMany({
            where: { fullName: { in: lecturerNames } },
            select: { id: true, fullName: true },
          })
        : [];
    const staffIdByName = new Map(
      staff.map((s) => [nameKey(s.fullName), s.id]),
    );

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

    for (const payload of payloads) {
      const subjectId = subjectIdByCode.get(payload.subjectCode);
      const parsed = parseClassCode(payload.classCode);
      // Môn chưa có trong danh mục → bỏ qua. Chạy importer danh mục trước.
      if (!subjectId || !parsed) {
        skipped += 1;
        continue;
      }

      const code = buildSectionCode(payload.subjectCode, parsed, ctx.term);
      // Tên không khớp Staff nào → để trống. KHÔNG tự tạo tài khoản giảng viên
      // từ một chuỗi tên: đó là việc của importer T.Kê.
      const lecturerId = payload.lecturerName
        ? (staffIdByName.get(nameKey(payload.lecturerName)) ?? null)
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
