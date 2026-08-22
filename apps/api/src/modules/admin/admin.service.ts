import {
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
  CreateStaffDto,
  ListStaffQuery,
  UpdateStaffDto,
} from './dto/staff.dto';

const staffSelect = {
  id: true,
  staffCode: true,
  fullName: true,
  departmentId: true,
  mustChangePassword: true,
  isActive: true,
  createdAt: true,
  // lecturerType/username: cột do Task 2 đưa vào schema (import T.Kê ghi vào),
  // Task 13 hiển thị lecturerType ở cột "Loại GV" trên /admin/users.
  lecturerType: true,
  username: true,
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
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
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
    const existing = await this.prisma.staff.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy nhân viên.');
    }

    const roleRecords = dto.roles ? await this.requireRoles(dto.roles) : null;

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
      metadata: { roles: dto.roles, isActive: dto.isActive },
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
