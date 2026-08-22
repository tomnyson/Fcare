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

    const existing = await tx.staff.findMany({
      where: {
        OR: [
          { username: { in: usernames } },
          { staffCode: { in: staffCodes } },
        ],
      },
      select: { id: true, username: true, staffCode: true },
    });
    const byUsername = new Map(
      existing
        .filter((staff) => staff.username !== null)
        .map((staff) => [staff.username as string, staff.id]),
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
      const existingId = byUsername.get(payload.username);
      if (existingId) {
        // Tài khoản đã có: KHÔNG đụng vào mật khẩu hay vai trò.
        await tx.staff.update({
          where: { id: existingId },
          data: {
            fullName: payload.fullName,
            lecturerType: payload.lecturerType,
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
