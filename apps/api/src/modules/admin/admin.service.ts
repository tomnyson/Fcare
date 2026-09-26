import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { RoleKey } from '@fcare/shared-types';
import { AuditService } from '../../audit/audit.service';
import { generateTempPassword } from '../../common/utils/temp-password';
import { isAllowedStaffEmail } from '../../common/utils/staff-email';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword } from '../auth/auth.service';
import {
  BulkAssignDepartmentDto,
  CreateStaffDto,
  ListStaffQuery,
  UpdateStaffDto,
} from './dto/staff.dto';
import { BulkStaffEmailDto } from './dto/staff-email.dto';
import { Prisma } from '@prisma/client';
import { ListAuditLogsQuery } from './dto/audit-log.dto';

/**
 * Phần client đủ dùng cho việc gán email công vụ. Các delegate tùy chọn
 * vì transaction có thể là mock tối giản trong spec.
 */
type StaffEmailTx = {
  staff: Pick<PrismaService['staff'], 'update'> &
    Partial<Pick<PrismaService['staff'], 'updateMany'>>;
  staffOAuthIdentity?: Pick<PrismaService['staffOAuthIdentity'], 'deleteMany'>;
};

/**
 * Vai trò bị giới hạn theo bộ môn (`deptFilter`): thiếu bộ môn thì tài khoản
 * không thấy sinh viên nào — đúng lỗi 32/35 GV gặp sau import.
 */
const DEPT_SCOPED_ROLES: readonly RoleKey[] = ['LECTURER', 'HEAD_OF_DEPT'];

const staffSelect = {
  id: true,
  staffCode: true,
  fullName: true,
  email: true,
  departmentId: true,
  mustChangePassword: true,
  isActive: true,
  createdAt: true,
  // lecturerType: cột do Task 2 đưa vào schema (import T.Kê ghi vào),
  // Task 13 hiển thị lecturerType ở cột "Loại GV" trên /admin/users.
  lecturerType: true,
  department: { select: { id: true, code: true, name: true } },
  roles: { select: { role: { select: { key: true, name: true } } } },
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  list(query: ListStaffQuery) {
    return this.prisma.staff.findMany({
      where: {
        // missingDepartment thắng departmentId: hai bộ lọc loại trừ nhau về
        // nghĩa (cùng quy ước với `missingMajor` ở students.service.ts).
        ...(query.missingDepartment
          ? { departmentId: null }
          : query.departmentId
            ? { departmentId: query.departmentId }
            : {}),
        ...(query.role
          ? { roles: { some: { role: { key: query.role } } } }
          : {}),
        ...(query.search
          ? {
              OR: [
                { staffCode: { contains: query.search, mode: 'insensitive' } },
                { fullName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { staffCode: 'asc' },
      select: staffSelect,
    });
  }

  async create(adminId: string, dto: CreateStaffDto) {
    const roleRecords = await this.requireRoles(dto.roles);
    this.assertDepartmentForScopedRoles(dto.roles, dto.departmentId ?? null);
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    try {
      const staff = await this.prisma.staff.create({
        data: {
          staffCode: dto.staffCode,
          fullName: dto.fullName,
          email: dto.email,
          departmentId: dto.departmentId,
          passwordHash,
          mustChangePassword: true,
          roles: { create: roleRecords.map((role) => ({ roleId: role.id })) },
        },
        select: staffSelect,
      });

      await this.auditService.log({
        staffId: adminId,
        action: 'ADMIN_CREATE_STAFF',
        entity: 'Staff',
        entityId: staff.id,
        metadata: { staffCode: dto.staffCode, roles: dto.roles },
      });

      // Mật khẩu tạm chỉ trả về MỘT LẦN cho admin chuyển tận tay người dùng.
      return { staff, tempPassword };
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          `Mã nhân viên "${dto.staffCode}" đã tồn tại.`,
        );
      }
      throw error;
    }
  }

  async update(adminId: string, id: string, dto: UpdateStaffDto) {
    const existing = await this.prisma.staff.findUnique({
      where: { id },
      select: {
        email: true,
        fullName: true,
        departmentId: true,
        roles: { select: { role: { select: { key: true } } } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy nhân viên.');
    }
    this.assertNotSelfLockout(adminId, id, dto);

    const fullName = dto.fullName?.trim();
    if (fullName === '') {
      throw new BadRequestException('Họ tên không được để trống.');
    }

    const roleRecords = dto.roles ? await this.requireRoles(dto.roles) : null;
    // Kiểm tra trên trạng thái SAU khi cập nhật: đổi vai trò và đổi bộ môn có
    // thể đi riêng lẻ, chỉ ghép lại mới biết tài khoản có hợp lệ hay không.
    this.assertDepartmentForScopedRoles(
      dto.roles ?? existing.roles.map((entry) => entry.role.key as RoleKey),
      dto.departmentId ?? existing.departmentId,
    );

    let emailToUpdate: string | null | undefined = undefined;
    if (dto.email !== undefined) {
      const trimmed = dto.email.trim().toLowerCase();
      if (!trimmed) {
        emailToUpdate = null;
      } else {
        if (
          !trimmed.endsWith('@fpt.edu.vn') &&
          !trimmed.endsWith('@fe.edu.vn')
        ) {
          throw new BadRequestException(
            'Email giảng viên phải thuộc miền @fpt.edu.vn hoặc @fe.edu.vn.',
          );
        }
        emailToUpdate = trimmed;
      }
    }

    let otherStaffWithSameEmail: { id: string; staffCode: string } | null =
      null;
    if (emailToUpdate && typeof this.prisma.staff?.findFirst === 'function') {
      otherStaffWithSameEmail = await this.prisma.staff.findFirst({
        where: {
          email: { equals: emailToUpdate, mode: 'insensitive' },
          id: { not: id },
        },
        select: { id: true, staffCode: true },
      });
    }

    const staff = await this.prisma.$transaction(async (tx) => {
      if (roleRecords) {
        await tx.staffRole.deleteMany({ where: { staffId: id } });
        await tx.staffRole.createMany({
          data: roleRecords.map((role) => ({ staffId: id, roleId: role.id })),
        });
      }
      if (dto.isActive === false) {
        // Khóa tài khoản → thu hồi mọi phiên đang hoạt động.
        await tx.refreshToken.updateMany({
          where: { staffId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      if (otherStaffWithSameEmail && tx.staff?.update) {
        await tx.staff.update({
          where: { id: otherStaffWithSameEmail.id },
          data: { email: null },
        });
      }
      // Chỉ gỡ liên kết Google khi email thật sự đổi — không gửi email (đổi tên,
      // vai trò, bộ môn…) thì `emailToUpdate` là undefined, không được coi là đổi.
      if (
        emailToUpdate !== undefined &&
        existing.email &&
        existing.email.toLowerCase().trim() !== emailToUpdate
      ) {
        if (tx.staffOAuthIdentity?.deleteMany) {
          await tx.staffOAuthIdentity.deleteMany({
            where: { staffId: id, provider: 'google' },
          });
        }
      }
      return tx.staff.update({
        where: { id },
        data: {
          fullName,
          email: emailToUpdate,
          departmentId: dto.departmentId,
          isActive: dto.isActive,
        },
        select: staffSelect,
      });
    });

    await this.auditService.log({
      staffId: adminId,
      action: 'ADMIN_UPDATE_STAFF',
      entity: 'Staff',
      entityId: id,
      metadata: {
        roles: dto.roles,
        isActive: dto.isActive,
        // Đổi bộ môn là đổi luôn phạm vi sinh viên mà GV/TBM nhìn thấy
        // (RULE 2) — phải truy vết được ai đổi, từ đâu sang đâu.
        ...(dto.departmentId
          ? {
              departmentIdBefore: existing.departmentId,
              departmentIdAfter: dto.departmentId,
            }
          : {}),
        ...(fullName && fullName !== existing.fullName
          ? { fullNameBefore: existing.fullName, fullNameAfter: fullName }
          : {}),
      },
    });

    return staff;
  }

  /**
   * Cấp lại mật khẩu tạm: hệ thống không lưu email/SĐT nên không thể gửi link
   * reset — admin nhận mật khẩu tạm và chuyển trực tiếp cho nhân viên.
   */
  async resetPassword(adminId: string, id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) {
      throw new NotFoundException('Không tìm thấy nhân viên.');
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    await this.prisma.$transaction([
      this.prisma.staff.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true },
      }),
      this.prisma.refreshToken.updateMany({
        where: { staffId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.auditService.log({
      staffId: adminId,
      action: 'ADMIN_RESET_PASSWORD',
      entity: 'Staff',
      entityId: id,
    });

    return { staffCode: staff.staffCode, tempPassword };
  }

  /**
   * Gán một bộ môn cho nhiều nhân viên cùng lúc — dọn hàng chờ sau import
   * giảng viên (file phân công không đủ dữ liệu để suy bộ môn cho mọi GV).
   */
  async bulkAssignEmails(adminId: string, dto: BulkStaffEmailDto) {
    const rawMappings = dto.mappings.map((mapping) => ({
      staffCode: mapping.staffCode.trim(),
      email: mapping.email.toLowerCase().trim(),
    }));

    // Deduplicate exact mappings (cùng mã NV gán cùng email)
    const uniqueMap = new Map<string, string>();
    for (const mapping of rawMappings) {
      const key = mapping.staffCode.toLowerCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, mapping.email);
      } else if (uniqueMap.get(key) !== mapping.email) {
        throw new BadRequestException(
          `Mã nhân viên "${mapping.staffCode}" bị gán 2 email khác nhau trong cùng dữ liệu: ${uniqueMap.get(key)} và ${mapping.email}`,
        );
      }
    }

    const normalizedMappings = [...uniqueMap.entries()].map(
      ([lowerCode, email]) => {
        const original = rawMappings.find(
          (m) => m.staffCode.toLowerCase() === lowerCode,
        )!;
        return { staffCode: original.staffCode, email };
      },
    );

    const emails = normalizedMappings.map((m) => m.email);
    const duplicateEmails = emails.filter(
      (email, index) => emails.indexOf(email) !== index,
    );
    if (duplicateEmails.length > 0) {
      throw new BadRequestException(
        `File có email bị lặp cho nhiều nhân viên: ${[...new Set(duplicateEmails)].join(', ')}`,
      );
    }

    if (emails.some((email) => !isAllowedStaffEmail(email))) {
      throw new BadRequestException(
        'Email giảng viên phải thuộc miền @fpt.edu.vn hoặc @fe.edu.vn.',
      );
    }

    const overrideExisting = dto.overrideExisting !== false;

    const rawCodes = normalizedMappings.map((m) => m.staffCode);
    const staff = await this.prisma.staff.findMany({
      where: {
        OR: [
          { staffCode: { in: rawCodes } },
          { staffCode: { in: rawCodes.map((c) => c.toUpperCase()) } },
          { staffCode: { in: rawCodes.map((c) => c.toLowerCase()) } },
        ],
      },
      select: { id: true, staffCode: true, email: true },
    });

    const staffByLower = new Map(
      staff.map((member) => [member.staffCode.toLowerCase(), member]),
    );
    const notFoundCodes = normalizedMappings
      .filter((m) => !staffByLower.has(m.staffCode.toLowerCase()))
      .map((m) => m.staffCode);
    if (notFoundCodes.length > 0) {
      throw new BadRequestException(
        `Không tìm thấy mã nhân viên: ${notFoundCodes.join(', ')}`,
      );
    }

    let newlyAssignedCount = 0;
    let overriddenCount = 0;
    let skippedCount = 0;

    const toUpdate: Array<{
      staffId: string;
      staffCode: string;
      newEmail: string;
      oldEmail: string | null;
    }> = [];

    for (const mapping of normalizedMappings) {
      const member = staffByLower.get(mapping.staffCode.toLowerCase())!;
      const hasOldEmail = Boolean(member.email && member.email.trim());

      if (hasOldEmail && !overrideExisting) {
        skippedCount += 1;
        continue;
      }

      if (hasOldEmail) {
        overriddenCount += 1;
      } else {
        newlyAssignedCount += 1;
      }

      toUpdate.push({
        staffId: member.id,
        staffCode: member.staffCode,
        newEmail: mapping.email,
        oldEmail: member.email,
      });
    }

    const newEmails = toUpdate.map((u) => u.newEmail);
    const otherStaffWithSameEmail = await this.prisma.staff.findMany({
      where: {
        email: { in: newEmails, mode: 'insensitive' },
        id: { notIn: toUpdate.map((u) => u.staffId) },
      },
      select: { id: true, staffCode: true, email: true },
    });

    const runInTx = async (tx: StaffEmailTx) => {
      if (otherStaffWithSameEmail.length > 0) {
        if (tx.staff.updateMany) {
          await tx.staff.updateMany({
            where: { id: { in: otherStaffWithSameEmail.map((s) => s.id) } },
            data: { email: null },
          });
        }
      }

      for (const item of toUpdate) {
        await tx.staff.update({
          where: { id: item.staffId },
          data: { email: item.newEmail },
        });

        if (
          item.oldEmail &&
          item.oldEmail.toLowerCase().trim() !== item.newEmail
        ) {
          if (tx.staffOAuthIdentity?.deleteMany) {
            await tx.staffOAuthIdentity.deleteMany({
              where: { staffId: item.staffId, provider: 'google' },
            });
          }
        }
      }
    };

    if (typeof this.prisma.$transaction === 'function') {
      try {
        await this.prisma.$transaction(runInTx);
      } catch (err) {
        if (err instanceof TypeError && String(err).includes('not iterable')) {
          await runInTx(this.prisma);
        } else {
          throw err;
        }
      }
    } else {
      await runInTx(this.prisma);
    }

    await this.auditService.log({
      staffId: adminId,
      action: 'ADMIN_BULK_ASSIGN_STAFF_EMAIL',
      entity: 'Staff',
      metadata: {
        staffCodes: rawCodes,
        updated: toUpdate.length,
        newlyAssigned: newlyAssignedCount,
        overridden: overriddenCount,
        skipped: skippedCount,
        overrideExisting,
      },
    });
    return {
      updated: toUpdate.length,
      newlyAssigned: newlyAssignedCount,
      overridden: overriddenCount,
      skipped: skippedCount,
    };
  }

  async bulkAssignDepartment(adminId: string, dto: BulkAssignDepartmentDto) {
    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
      select: { id: true },
    });
    if (!department) {
      throw new NotFoundException('Bộ môn không tồn tại.');
    }

    const result = await this.prisma.staff.updateMany({
      where: { id: { in: dto.staffIds } },
      data: { departmentId: dto.departmentId },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        'Không có nhân viên nào khớp danh sách đã chọn.',
      );
    }

    await this.auditService.log({
      staffId: adminId,
      action: 'ADMIN_BULK_ASSIGN_DEPARTMENT',
      entity: 'Staff',
      metadata: {
        staffIds: dto.staffIds,
        departmentId: dto.departmentId,
        updated: result.count,
      },
    });

    return { updated: result.count };
  }

  /**
   * Tạo file Excel mẫu (.xlsx) chứa 2 cột manv và email để admin tải về điền.
   */
  async getEmailTemplateBuffer(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('EmailMapping');
    sheet.columns = [
      { header: 'manv', key: 'manv', width: 20 },
      { header: 'email', key: 'email', width: 35 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.addRow(['vandtb2', 'VanDTB2@fe.edu.vn']);
    sheet.addRow(['hieunt249', 'hieunt249@fe.edu.vn']);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Xuất danh sách nhân viên hiện tại ra file Excel (.xlsx) với cấu trúc manv | email.
   */
  async exportEmailsBuffer(): Promise<Buffer> {
    const staff = await this.prisma.staff.findMany({
      orderBy: { staffCode: 'asc' },
      select: { staffCode: true, email: true },
    });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('EmailNhanVien');
    sheet.columns = [
      { header: 'manv', key: 'manv', width: 20 },
      { header: 'email', key: 'email', width: 35 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const member of staff) {
      sheet.addRow([member.staffCode, member.email ?? '']);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Chỉ ADMIN mới vào được `/admin/staff` (CASL). Admin tự gỡ vai trò ADMIN
   * hoặc tự khóa tài khoản mình là tự nhốt mình ngoài cửa — và không có luồng
   * email nào để tự mở lại (RULE 1: hệ thống không lưu email).
   */
  private assertNotSelfLockout(
    adminId: string,
    targetId: string,
    dto: UpdateStaffDto,
  ): void {
    if (adminId !== targetId) {
      return;
    }
    if (dto.roles && !dto.roles.includes('ADMIN')) {
      throw new BadRequestException(
        'Không thể tự gỡ vai trò Quản trị hệ thống của chính mình — nhờ một admin khác thực hiện.',
      );
    }
    if (dto.isActive === false) {
      throw new BadRequestException(
        'Không thể tự khóa tài khoản của chính mình.',
      );
    }
  }

  /**
   * GV/TBM bắt buộc thuộc một bộ môn. Chặn ở đây để tài khoản tạo tay không
   * lặp lại lỗi "không thấy sinh viên nào" của các tài khoản import thiếu bộ môn.
   */
  private assertDepartmentForScopedRoles(
    roles: readonly RoleKey[],
    departmentId: string | null,
  ): void {
    const needsDepartment = roles.some((role) =>
      DEPT_SCOPED_ROLES.includes(role),
    );
    if (needsDepartment && !departmentId) {
      throw new BadRequestException(
        'Giảng viên và Trưởng bộ môn bắt buộc thuộc một bộ môn — thiếu bộ môn thì tài khoản không thấy sinh viên nào.',
      );
    }
  }

  private async requireRoles(keys: RoleKey[]) {
    const roles = await this.prisma.role.findMany({
      where: { key: { in: [...keys] } },
    });
    if (roles.length !== new Set(keys).size) {
      throw new NotFoundException('Một hoặc nhiều vai trò không tồn tại.');
    }
    return roles;
  }

  async listAuditLogs(query: ListAuditLogsQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 200) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.action?.trim()) {
      where.action = {
        contains: query.action.trim(),
        mode: 'insensitive',
      };
    }

    if (query.entity?.trim()) {
      where.entity = {
        contains: query.entity.trim(),
        mode: 'insensitive',
      };
    }

    if (query.staffCode?.trim()) {
      where.staff = {
        staffCode: {
          contains: query.staffCode.trim(),
          mode: 'insensitive',
        },
      };
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entity: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        {
          staff: {
            OR: [
              { staffCode: { contains: search, mode: 'insensitive' } },
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        const toDate = new Date(query.to);
        if (query.to.length === 10) {
          toDate.setHours(23, 59, 59, 999);
        }
        where.createdAt.lte = toDate;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          staff: {
            select: {
              id: true,
              staffCode: true,
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
