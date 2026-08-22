import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import type { RoleKey } from '@fcare/shared-types';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../../audit/audit.service';
import type {
  AccessTokenPayload,
  AuthUser,
} from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 phút

const staffWithRoles = {
  include: { roles: { include: { role: true } } },
} satisfies Prisma.StaffDefaultArgs;

type StaffWithRoles = Prisma.StaffGetPayload<typeof staffWithRoles>;

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

const INVALID_CREDENTIALS_MESSAGE = 'Mã nhân viên hoặc mật khẩu không đúng.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async login(staffCode: string, password: string): Promise<AuthSession> {
    const staff = await this.prisma.staff.findUnique({
      where: { staffCode },
      ...staffWithRoles,
    });
    if (!staff || !staff.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(password, staff.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // Cam kết bảo mật là bắt buộc với MỖI lần đăng nhập → consented luôn false ở đây.
    const user = this.toAuthUser(staff, { consented: false });
    const refreshToken = await this.issueRefreshToken(staff.id, null);
    const accessToken = this.signAccessToken(user);

    await this.auditService.log({
      staffId: staff.id,
      action: 'AUTH_LOGIN',
      entity: 'Staff',
      entityId: staff.id,
    });

    return { user, accessToken, refreshToken };
  }

  /** Ghi nhận cam kết không chia sẻ dữ liệu và gắn vào phiên hiện tại. */
  async recordConsent(
    userId: string,
    refreshTokenValue: string | undefined,
    userAgent: string | undefined,
  ): Promise<{ user: AuthUser; accessToken: string }> {
    const staff = await this.requireStaff(userId);

    const consentLog = await this.prisma.consentLog.create({
      data: { staffId: userId, userAgent: userAgent?.slice(0, 255) },
    });

    if (refreshTokenValue) {
      await this.prisma.refreshToken.updateMany({
        where: {
          staffId: userId,
          tokenHash: hashToken(refreshTokenValue),
          revokedAt: null,
        },
        data: { consentLogId: consentLog.id },
      });
    }

    const user = this.toAuthUser(staff, { consented: true });
    return { user, accessToken: this.signAccessToken(user) };
  }

  async refresh(refreshTokenValue: string): Promise<AuthSession> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshTokenValue) },
      include: { staff: { include: staffWithRoles.include } },
    });

    if (
      !record ||
      record.revokedAt ||
      record.expiresAt < new Date() ||
      !record.staff.isActive
    ) {
      throw new UnauthorizedException(
        'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
      );
    }

    // Xoay vòng refresh token: thu hồi token cũ, giữ liên kết cam kết đã ký.
    const [, refreshToken] = await Promise.all([
      this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      }),
      this.issueRefreshToken(record.staffId, record.consentLogId),
    ]);

    const user = this.toAuthUser(record.staff, {
      consented: record.consentLogId !== null,
    });
    return { user, accessToken: this.signAccessToken(user), refreshToken };
  }

  async logout(refreshTokenValue: string | undefined): Promise<void> {
    if (!refreshTokenValue) {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshTokenValue), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const staff = await this.requireStaff(userId);

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      staff.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng.');
    }

    await this.prisma.$transaction([
      this.prisma.staff.update({
        where: { id: userId },
        data: {
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: false,
        },
      }),
      // Thu hồi mọi phiên cũ — người dùng phải đăng nhập lại bằng mật khẩu mới.
      this.prisma.refreshToken.updateMany({
        where: { staffId: userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.auditService.log({
      staffId: userId,
      action: 'AUTH_CHANGE_PASSWORD',
      entity: 'Staff',
      entityId: userId,
    });
  }

  private async requireStaff(userId: string): Promise<StaffWithRoles> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: userId },
      ...staffWithRoles,
    });
    if (!staff || !staff.isActive) {
      throw new UnauthorizedException('Tài khoản không còn hiệu lực.');
    }
    return staff;
  }

  private async issueRefreshToken(
    staffId: string,
    consentLogId: string | null,
  ): Promise<string> {
    const value = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        staffId,
        consentLogId,
        tokenHash: hashToken(value),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return value;
  }

  private signAccessToken(user: AuthUser): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      staffCode: user.staffCode,
      fullName: user.fullName,
      roles: user.roles,
      departmentId: user.departmentId,
      consented: user.consented,
      mustChangePassword: user.mustChangePassword,
    };
    return this.jwtService.sign(payload);
  }

  private toAuthUser(
    staff: StaffWithRoles,
    options: { consented: boolean },
  ): AuthUser {
    return {
      id: staff.id,
      staffCode: staff.staffCode,
      fullName: staff.fullName,
      roles: staff.roles.map((staffRole) => staffRole.role.key as RoleKey),
      departmentId: staff.departmentId,
      consented: options.consented,
      mustChangePassword: staff.mustChangePassword,
    };
  }
}

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
