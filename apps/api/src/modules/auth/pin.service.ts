import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MAX_PIN_ATTEMPTS,
  validatePinFormat,
  type PinProofPurpose,
} from '@fcare/shared-types';
import * as bcrypt from 'bcryptjs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { getAccessTokenSecret } from './auth.config';
import { hashToken } from './auth.service';

/** Bằng chứng "vừa nhập lại PIN" chỉ sống 2 phút — đủ cho 1 thao tác phá huỷ. */
const PROOF_TTL_MS = 2 * 60_000;
const PIN_BCRYPT_COST = 10;

export interface PinSessionState {
  hasPin: boolean;
  locked: boolean;
}

export interface VerifyPinResult {
  unlocked: true;
  proof?: string;
}

/**
 * Khoá ứng dụng bằng PIN cá nhân. Trạng thái khoá gắn vào phiên
 * (`RefreshToken.lockedAt`) nên đóng tab / F5 / xoá localStorage không mở khoá được.
 * Sai PIN trả 400 (không phải 401) để web không tự refresh token rồi thử lại.
 */
@Injectable()
export class PinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async sessionState(
    userId: string,
    refreshCookie: string | undefined,
  ): Promise<PinSessionState> {
    if (refreshCookie) {
      const session = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(refreshCookie) },
        select: {
          staffId: true,
          lockedAt: true,
          staff: { select: { pinHash: true } },
        },
      });
      if (session && session.staffId === userId) {
        return {
          hasPin: Boolean(session.staff.pinHash),
          locked: Boolean(session.lockedAt),
        };
      }
    }
    const staff = await this.prisma.staff.findUnique({
      where: { id: userId },
      select: { pinHash: true },
    });
    return { hasPin: Boolean(staff?.pinHash), locked: false };
  }

  async setPin(
    userId: string,
    refreshCookie: string | undefined,
    input: { pin: string; currentPin?: string },
  ): Promise<{ hasPin: true }> {
    const formatError = validatePinFormat(input.pin);
    if (formatError) {
      throw new BadRequestException({
        code: 'PIN_INVALID_FORMAT',
        message: formatError,
      });
    }
    const staff = await this.loadPinState(userId);
    const isChange = Boolean(staff.pinHash);
    if (staff.pinHash) {
      await this.assertPinMatches(
        userId,
        staff.pinHash,
        input.currentPin ?? '',
      );
    }
    await this.prisma.staff.update({
      where: { id: userId },
      data: {
        pinHash: await bcrypt.hash(input.pin, PIN_BCRYPT_COST),
        pinFailedCount: 0,
      },
    });
    await this.unlockSession(userId, refreshCookie);
    await this.audit.log({
      staffId: userId,
      action: isChange ? 'AUTH_PIN_CHANGE' : 'AUTH_PIN_SET',
      entity: 'Staff',
      entityId: userId,
    });
    return { hasPin: true };
  }

  async verify(
    userId: string,
    refreshCookie: string | undefined,
    input: { pin: string; purpose?: PinProofPurpose },
  ): Promise<VerifyPinResult> {
    const staff = await this.loadPinState(userId);
    if (!staff.pinHash) {
      throw new ForbiddenException({
        code: 'PIN_SETUP_REQUIRED',
        message: 'Bạn cần tạo mã PIN trước khi tiếp tục.',
      });
    }
    await this.assertPinMatches(userId, staff.pinHash, input.pin);
    if (staff.pinFailedCount > 0) {
      await this.prisma.staff.update({
        where: { id: userId },
        data: { pinFailedCount: 0 },
      });
    }
    const unlocked = await this.unlockSession(userId, refreshCookie);
    if (refreshCookie && !unlocked) {
      // Phiên đã bị thu hồi (vượt số lần sai / đăng xuất) — PIN đúng cũng không hồi sinh.
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
      });
    }
    return input.purpose
      ? { unlocked: true, proof: this.issueProof(userId, input.purpose) }
      : { unlocked: true };
  }

  async lock(userId: string, refreshCookie: string | undefined): Promise<void> {
    if (!refreshCookie) return;
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashToken(refreshCookie),
        staffId: userId,
        revokedAt: null,
        lockedAt: null,
      },
      data: { lockedAt: new Date() },
    });
  }

  async resetPin(adminId: string, staffId: string): Promise<void> {
    await this.prisma.staff.update({
      where: { id: staffId },
      data: { pinHash: null, pinFailedCount: 0 },
    });
    await this.audit.log({
      staffId: adminId,
      action: 'AUTH_PIN_RESET',
      entity: 'Staff',
      entityId: staffId,
    });
  }

  /**
   * Người dùng quên PIN: xoá PIN và thu hồi MỌI phiên. Muốn dùng tiếp phải đăng
   * nhập lại bằng mật khẩu/Google rồi tạo PIN mới — không có luồng email (rule 4).
   * Kẻ đứng trước máy đang khoá bấm nút này cũng chỉ đăng xuất được, không vào được.
   */
  async forgetPin(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.refreshToken.updateMany({
      where: { staffId: userId, revokedAt: null },
      // Khoá luôn để access token còn hạn cũng bị PinGuard chặn.
      data: { revokedAt: now, lockedAt: now },
    });
    await this.prisma.staff.update({
      where: { id: userId },
      data: { pinHash: null, pinFailedCount: 0 },
    });
    await this.audit.log({
      staffId: userId,
      action: 'AUTH_PIN_FORGOT',
      entity: 'Staff',
      entityId: userId,
    });
  }

  checkProof(
    userId: string,
    purpose: PinProofPurpose,
    proof: string | undefined,
  ): boolean {
    if (!proof) return false;
    const [expText, signature] = proof.split('.');
    const exp = Number(expText);
    if (!signature || !Number.isInteger(exp) || exp < Date.now()) return false;
    const expected = Buffer.from(this.sign(userId, purpose, exp));
    const actual = Buffer.from(signature);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private async loadPinState(userId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: userId },
      select: { pinHash: true, pinFailedCount: true },
    });
    return staff ?? { pinHash: null, pinFailedCount: 0 };
  }

  /** So PIN; sai thì tăng đếm nguyên tử, tới ngưỡng thì thu hồi mọi phiên. */
  private async assertPinMatches(
    userId: string,
    pinHash: string,
    pin: string,
  ): Promise<void> {
    if (await bcrypt.compare(pin, pinHash)) return;
    const { pinFailedCount } = await this.prisma.staff.update({
      where: { id: userId },
      data: { pinFailedCount: { increment: 1 } },
      select: { pinFailedCount: true },
    });
    if (pinFailedCount >= MAX_PIN_ATTEMPTS) {
      await this.prisma.refreshToken.updateMany({
        where: { staffId: userId, revokedAt: null },
        // Khoá luôn để access token còn hạn cũng bị PinGuard chặn.
        data: { revokedAt: new Date(), lockedAt: new Date() },
      });
      await this.prisma.staff.update({
        where: { id: userId },
        data: { pinFailedCount: 0 },
      });
      await this.audit.log({
        staffId: userId,
        action: 'AUTH_PIN_LOCKOUT',
        entity: 'Staff',
        entityId: userId,
      });
      throw new ForbiddenException({
        code: 'PIN_ATTEMPTS_EXCEEDED',
        message: `Nhập sai PIN ${MAX_PIN_ATTEMPTS} lần. Vui lòng đăng nhập lại bằng mật khẩu.`,
      });
    }
    throw new BadRequestException({
      code: 'PIN_INCORRECT',
      message: `Mã PIN không đúng. Còn ${MAX_PIN_ATTEMPTS - pinFailedCount} lần thử.`,
    });
  }

  /** Trả về false nếu không có phiên còn hiệu lực nào để mở khoá. */
  private async unlockSession(
    userId: string,
    refreshCookie: string | undefined,
  ): Promise<boolean> {
    if (!refreshCookie) return false;
    const { count } = await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashToken(refreshCookie),
        staffId: userId,
        revokedAt: null,
      },
      data: { lockedAt: null },
    });
    return count > 0;
  }

  private issueProof(userId: string, purpose: PinProofPurpose): string {
    const exp = Date.now() + PROOF_TTL_MS;
    return `${exp}.${this.sign(userId, purpose, exp)}`;
  }

  private sign(userId: string, purpose: PinProofPurpose, exp: number): string {
    return createHmac(
      'sha256',
      `pin-proof:${getAccessTokenSecret(this.config)}`,
    )
      .update(`${userId}.${purpose}.${exp}`)
      .digest('base64url');
  }
}
