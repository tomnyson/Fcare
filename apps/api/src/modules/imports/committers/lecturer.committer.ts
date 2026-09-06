import { generateTempPassword } from '../../../common/utils/temp-password';
import { hashPassword } from '../../auth/auth.service';
import type {
  CommitResult,
  ImportCommitter,
  ImportContext,
  ParsedRow,
  PrismaTx,
} from '../types';

interface LecturerPayload {
  username: string;
  fullName: string;
  lecturerType: 'FULL' | 'PART' | null;
  /** Mã bộ môn suy từ sheet phân công lớp; null khi chưa suy được. */
  deptAlias: string | null;
}

/** Khoá tra alias: cắt khoảng trắng + hạ chữ thường (giống catalog.committer). */
function aliasKey(raw: string): string {
  return raw.trim().toLowerCase();
}

export class LecturerCommitter implements ImportCommitter {
  async commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    ctx: ImportContext,
  ): Promise<CommitResult> {
    // Committer chỉ tạo/cập nhật giảng viên theo username, không dùng
    // term/user — chỉ giữ tham số để khớp chữ ký ImportCommitter.commit.
    void ctx;
    const payloads = rows.map(
      (row) => row.payload as unknown as LecturerPayload,
    );
    const usernames = payloads.map((payload) => payload.username);
    const staffCodes = payloads.map((payload) =>
      payload.username.toUpperCase(),
    );

    // Nạp một lần cho cả lô — tránh N+1.
    const aliases = await tx.departmentAlias.findMany({
      select: { alias: true, departmentId: true },
    });
    const departmentByAlias = new Map(
      aliases.map((entry) => [aliasKey(entry.alias), entry.departmentId]),
    );

    const existing = await tx.staff.findMany({
      where: {
        OR: [
          { username: { in: usernames } },
          { staffCode: { in: staffCodes } },
        ],
      },
      select: {
        id: true,
        username: true,
        staffCode: true,
        departmentId: true,
      },
    });
    const byUsername = new Map(
      existing
        .filter((staff) => staff.username !== null)
        .map((staff) => [staff.username as string, staff]),
    );
    const byStaffCode = new Map(
      existing.map((staff) => [staff.staffCode, staff.id]),
    );

    const lecturerRole = await tx.role.findUniqueOrThrow({
      where: { key: 'LECTURER' },
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const payload of payloads) {
      // Alias chưa ánh xạ → để trống. KHÔNG đoán bộ môn: gán sai sẽ phá
      // deptFilter và cho giảng viên thấy sinh viên bộ môn khác (RULE 2).
      const departmentId = payload.deptAlias
        ? (departmentByAlias.get(aliasKey(payload.deptAlias)) ?? null)
        : null;

      const existingStaff = byUsername.get(payload.username);
      if (existingStaff) {
        // Tài khoản đã có: KHÔNG đụng vào mật khẩu hay vai trò.
        await tx.staff.update({
          where: { id: existingStaff.id },
          data: {
            fullName: payload.fullName,
            lecturerType: payload.lecturerType,
            // Chỉ điền khi đang trống: bộ môn admin gán tay là nguồn sự thật,
            // không để suy đoán từ file ghi đè.
            ...(departmentId && existingStaff.departmentId === null
              ? { departmentId }
              : {}),
          },
        });
        updated += 1;
        continue;
      }

      const staffCode = payload.username.toUpperCase();
      // Mã NV đã thuộc về tài khoản khác (không cùng username) → không ghi đè.
      if (byStaffCode.has(staffCode)) {
        skipped += 1;
        continue;
      }

      const passwordHash = await hashPassword(generateTempPassword());
      const staff = await tx.staff.create({
        data: {
          staffCode,
          username: payload.username,
          fullName: payload.fullName,
          lecturerType: payload.lecturerType,
          departmentId,
          passwordHash,
          mustChangePassword: true,
        },
        select: { id: true },
      });
      await tx.staffRole.createMany({
        data: [{ staffId: staff.id, roleId: lecturerRole.id }],
        skipDuplicates: true,
      });
      byStaffCode.set(staffCode, staff.id);
      created += 1;
    }

    return { created, updated, skipped };
  }
}
