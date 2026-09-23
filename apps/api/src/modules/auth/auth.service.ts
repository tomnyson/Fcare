import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';
import { getGoogleOAuthConfig } from './auth.config';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthMethod, Prisma } from '@prisma/client';
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

interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

const INVALID_CREDENTIALS_MESSAGE = 'Mã nhân viên hoặc mật khẩu không đúng.';
const GOOGLE_PROVIDER = 'google';
const GOOGLE_LINK_TTL_MS = 10 * 60 * 1000;

export interface GoogleLinkChallenge {
  challenge: string;
  expiresAt: number;
}

interface GoogleOAuthResult {
  session?: AuthSession;
  challenge?: GoogleLinkChallenge;
}

function signChallenge(
  subject: string,
  secret: string,
  expiresAt: number,
): string {
  const payload = `${subject}.${expiresAt}`;
  const digest = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${digest}`;
}

function verifyChallenge(challenge: string, secret: string): string {
  const [subject, expiryText, signature] = challenge.split('.');
  const expiresAt = Number(expiryText);
  if (
    !subject ||
    !signature ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < Date.now()
  ) {
    throw new UnauthorizedException('Liên kết Google đã hết hạn.');
  }
  const expected = createHmac('sha256', secret)
    .update(`${subject}.${expiresAt}`)
    .digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new UnauthorizedException('Yêu cầu liên kết không hợp lệ.');
  }
  return subject;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
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
    const user = this.toAuthUser(staff, {
      consented: false,
      authMethod: 'PASSWORD',
    });
    const refreshToken = await this.issueRefreshToken(
      staff.id,
      null,
      'PASSWORD',
    );
    const accessToken = this.signAccessToken(user);

    await this.auditService.log({
      staffId: staff.id,
      action: 'AUTH_LOGIN',
      entity: 'Staff',
      entityId: staff.id,
    });

    return { user, accessToken, refreshToken };
  }

  async googleCallback(idToken: string): Promise<GoogleOAuthResult> {
    const oauth = getGoogleOAuthConfig(this.config);
    if (!oauth) {
      throw new UnauthorizedException('Đăng nhập Google chưa được cấu hình.');
    }
    const ticket = await new OAuth2Client(oauth.clientId).verifyIdToken({
      idToken,
      audience: oauth.clientId,
    });
    const payload = ticket.getPayload();
    const googleEmail = payload?.email?.toLowerCase().trim() ?? '';
    const isAllowedGoogleDomain =
      googleEmail.endsWith('@fpt.edu.vn') || googleEmail.endsWith('@fe.edu.vn');
    if (
      !payload?.sub ||
      payload.iss !== 'https://accounts.google.com' ||
      !payload.email_verified ||
      !isAllowedGoogleDomain
    ) {
      throw new UnauthorizedException(
        'Tài khoản Google phải thuộc miền @fpt.edu.vn hoặc @fe.edu.vn.',
      );
    }
    const identity = await this.prisma.staffOAuthIdentity.findUnique({
      where: {
        provider_subject: { provider: GOOGLE_PROVIDER, subject: payload.sub },
      },
      include: { staff: { ...staffWithRoles } },
    });
    if (identity?.staff.isActive) {
      const user = this.toAuthUser(identity.staff, {
        consented: false,
        authMethod: 'GOOGLE',
      });
      return {
        session: await this.createSession(
          identity.staff,
          user,
          'AUTH_GOOGLE_LOGIN',
        ),
      };
    }

    const staffByEmail = await this.prisma.staff.findFirst({
      where: {
        email: { equals: googleEmail, mode: 'insensitive' },
        isActive: true,
      },
      ...staffWithRoles,
    });
    if (staffByEmail) {
      await this.prisma.staffOAuthIdentity.upsert({
        where: {
          staffId_provider: {
            staffId: staffByEmail.id,
            provider: GOOGLE_PROVIDER,
          },
        },
        create: {
          provider: GOOGLE_PROVIDER,
          subject: payload.sub,
          staffId: staffByEmail.id,
        },
        update: {
          subject: payload.sub,
        },
      });
      await this.auditService.log({
        staffId: staffByEmail.id,
        action: 'AUTH_GOOGLE_LINK',
        entity: 'Staff',
        entityId: staffByEmail.id,
      });
      const user = this.toAuthUser(staffByEmail, {
        consented: false,
        authMethod: 'GOOGLE',
      });
      return {
        session: await this.createSession(
          staffByEmail,
          user,
          'AUTH_GOOGLE_LOGIN',
        ),
      };
    }
    const secret =
      this.config.get<string>('JWT_ACCESS_SECRET') ??
      'dev-access-secret-change-me';
    const expiresAt = Date.now() + GOOGLE_LINK_TTL_MS;
    return {
      challenge: {
        challenge: signChallenge(payload.sub, secret, expiresAt),
        expiresAt,
      },
    };
  }

  async linkGoogle(
    challenge: string,
    staffCode: string,
    password: string,
  ): Promise<AuthSession> {
    const secret =
      this.config.get<string>('JWT_ACCESS_SECRET') ??
      'dev-access-secret-change-me';
    const subject = verifyChallenge(challenge, secret);
    const session = await this.login(staffCode, password);
    const staff = await this.requireStaff(session.user.id);
    await this.prisma.staffOAuthIdentity.upsert({
      where: {
        staffId_provider: { staffId: staff.id, provider: GOOGLE_PROVIDER },
      },
      create: { provider: GOOGLE_PROVIDER, subject, staffId: staff.id },
      update: { subject },
    });
    await this.auditService.log({
      staffId: staff.id,
      action: 'AUTH_GOOGLE_LINK',
      entity: 'Staff',
      entityId: staff.id,
    });
    return session;
  }

  /** Phiên đăng nhập Google — xem `toAuthUser` về cờ đổi mật khẩu. */
  private async createSession(
    staff: StaffWithRoles,
    user: AuthUser,
    action: string,
  ): Promise<AuthSession> {
    const refreshToken = await this.issueRefreshToken(staff.id, null, 'GOOGLE');
    const accessToken = this.signAccessToken(user);
    await this.auditService.log({
      staffId: staff.id,
      action,
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
    // Ký cam kết phát lại access token: phải giữ đúng cách đăng nhập của phiên,
    // nếu không phiên Google lại bị đẩy sang trang đổi mật khẩu tạm.
    const session = refreshTokenValue
      ? await this.prisma.refreshToken.findUnique({
          where: { tokenHash: hashToken(refreshTokenValue) },
          select: { authMethod: true },
        })
      : null;

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

    const user = this.toAuthUser(staff, {
      consented: true,
      authMethod: session?.authMethod ?? 'PASSWORD',
    });
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
      this.issueRefreshToken(
        record.staffId,
        record.consentLogId,
        record.authMethod,
      ),
    ]);

    const user = this.toAuthUser(record.staff, {
      consented: record.consentLogId !== null,
      authMethod: record.authMethod,
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
    authMethod: AuthMethod,
  ): Promise<string> {
    const value = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        staffId,
        consentLogId,
        authMethod,
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

  /**
   * Mật khẩu tạm chỉ bắt đổi khi đăng nhập BẰNG mật khẩu. Đăng nhập Google đã
   * xác thực qua tài khoản @fpt.edu.vn/@fe.edu.vn, và giảng viên import từ file
   * không hề biết mật khẩu tạm — bắt đổi là kẹt ở /change-password mãi.
   */
  private toAuthUser(
    staff: StaffWithRoles,
    options: { consented: boolean; authMethod: AuthMethod },
  ): AuthUser {
    return {
      id: staff.id,
      staffCode: staff.staffCode,
      fullName: staff.fullName,
      roles: staff.roles.map((staffRole) => staffRole.role.key as RoleKey),
      departmentId: staff.departmentId,
      consented: options.consented,
      mustChangePassword:
        options.authMethod === 'PASSWORD' && staff.mustChangePassword,
    };
  }
}

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
