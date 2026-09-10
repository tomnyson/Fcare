import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RoleKey } from '@fcare/shared-types';
import { AuditService } from '../../audit/audit.service';
import { generateTempPassword } from '../../common/utils/temp-password';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword } from '../auth/auth.service';
import {
  BulkAssignDepartmentDto,
  CreateStaffDto,
  ListStaffQuery,
  UpdateStaffDto,
} from './dto/staff.dto';

/**
 * Vai trò bị giới hạn theo bộ môn (`deptFilter`): thiếu bộ môn thì tài khoản
 * không thấy sinh viên nào — đúng lỗi 32/35 GV gặp sau import.
 */
const DEPT_SCOPED_ROLES: readonly RoleKey[] = ['LECTURER', 'HEAD_OF_DEPT'];

const staffSelect = {
  id: true,
  staffCode: true,
  fullName: true,
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
        departmentId: true,
        roles: { select: { role: { select: { key: true } } } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy nhân viên.');
    }
    this.assertNotSelfLockout(adminId, id, dto);

    const roleRecords = dto.roles ? await this.requireRoles(dto.roles) : null;
    // Kiểm tra trên trạng thái SAU khi cập nhật: đổi vai trò và đổi bộ môn có
    // thể đi riêng lẻ, chỉ ghép lại mới biết tài khoản có hợp lệ hay không.
    this.assertDepartmentForScopedRoles(
      dto.roles ?? existing.roles.map((entry) => entry.role.key as RoleKey),
      dto.departmentId ?? existing.departmentId,
    );

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
      return tx.staff.update({
        where: { id },
        data: {
          fullName: dto.fullName,
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
}
