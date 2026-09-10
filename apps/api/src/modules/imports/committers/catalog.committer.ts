import type {
  CommitResult,
  ImportCommitter,
  ImportContext,
  ParsedRow,
  PrismaTx,
} from '../types';
import { aliasKey, loadDepartmentByAlias } from './department-lookup';

interface CatalogPayload {
  code: string;
  name: string;
  credits: number;
  deptAlias: string;
  subjectGroup: string | null;
  hoursTotal: number | null;
  learningMethod: string | null;
  maxStudents: number | null;
  examForm: string | null;
  attendanceRateRequired: number | null;
}

export class CatalogCommitter implements ImportCommitter {
  async commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    ctx: ImportContext,
  ): Promise<CommitResult> {
    // Committer chỉ tra alias + upsert theo mã môn, không dùng term/user —
    // chỉ giữ tham số để khớp chữ ký ImportCommitter.commit.
    void ctx;
    const departmentByAlias = await loadDepartmentByAlias(tx);

    const codes = rows.map(
      (row) => (row.payload as unknown as CatalogPayload).code,
    );
    const existing = await tx.subject.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const idByCode = new Map(existing.map((s) => [s.code, s.id]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const payload = row.payload as unknown as CatalogPayload;
      const departmentId = departmentByAlias.get(aliasKey(payload.deptAlias));

      // Alias chưa ánh xạ → bỏ qua. KHÔNG đoán bộ môn: gán sai sẽ phá
      // deptFilter và cho giảng viên thấy sinh viên bộ môn khác (RULE 2).
      if (!departmentId) {
        skipped += 1;
        continue;
      }

      const data = {
        name: payload.name,
        credits: payload.credits,
        departmentId,
        subjectGroup: payload.subjectGroup,
        hoursTotal: payload.hoursTotal,
        learningMethod: payload.learningMethod,
        maxStudents: payload.maxStudents,
        examForm: payload.examForm,
        attendanceRateRequired: payload.attendanceRateRequired,
      };

      const existingId = idByCode.get(payload.code);
      if (existingId) {
        await tx.subject.update({ where: { id: existingId }, data });
        updated += 1;
      } else {
        await tx.subject.create({ data: { code: payload.code, ...data } });
        created += 1;
      }
    }

    return { created, updated, skipped };
  }
}
