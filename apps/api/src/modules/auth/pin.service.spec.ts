/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { PinService } from './pin.service';

const SESSION = 'refresh-cookie-value';
const SESSION_HASH = createHash('sha256').update(SESSION).digest('hex');

interface StaffRow {
  id: string;
  pinHash: string | null;
  pinFailedCount: number;
}

function build(staff: StaffRow, session?: { lockedAt: Date | null }) {
  const state = { ...staff };
  const prisma = {
    staff: {
      findUnique: jest.fn(() => Promise.resolve({ ...state })),
      update: jest.fn(
        ({
          data,
        }: {
          data: {
            pinHash?: string | null;
            pinFailedCount?: number | { increment: number };
          };
        }) => {
          if (data.pinHash !== undefined) state.pinHash = data.pinHash;
          const count = data.pinFailedCount;
          if (typeof count === 'number') state.pinFailedCount = count;
          else if (count) state.pinFailedCount += count.increment;
          return Promise.resolve({ ...state });
        },
      ),
    },
    refreshToken: {
      findUnique: jest.fn().mockResolvedValue(
        session
          ? {
              staffId: staff.id,
              lockedAt: session.lockedAt,
              staff: { pinHash: state.pinHash },
            }
          : null,
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
  const audit = { log: jest.fn() } as unknown as AuditService;
  const config = {
    get: jest.fn(() => 'test-access-secret'),
  } as unknown as ConfigService;
  return {
    service: new PinService(prisma, audit, config),
    prisma,
    audit,
    state,
  };
}

async function withPin(pin: string, failed = 0): Promise<StaffRow> {
  return {
    id: 's1',
    pinHash: await bcrypt.hash(pin, 4),
    pinFailedCount: failed,
  };
}

function codeOf(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) return undefined;
  const body = error.getResponse() as { code?: string };
  return body.code;
}

describe('PinService.sessionState', () => {
  it('đọc PIN + khoá theo phiên (cookie refresh)', async () => {
    const { service, prisma } = build(await withPin('246813'), {
      lockedAt: new Date(),
    });
    await expect(service.sessionState('s1', SESSION)).resolves.toEqual({
      hasPin: true,
      locked: true,
    });
    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: SESSION_HASH } }),
    );
  });

  it('không có cookie (Bearer) → đọc PIN từ bảng staff, không khoá', async () => {
    const { service } = build({ id: 's1', pinHash: null, pinFailedCount: 0 });
    await expect(service.sessionState('s1', undefined)).resolves.toEqual({
      hasPin: false,
      locked: false,
    });
  });

  it('cookie thuộc người khác → bỏ qua cookie, không mượn trạng thái mở khoá', async () => {
    const { service, prisma } = build(await withPin('246813'));
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      staffId: 'someone-else',
      lockedAt: null,
      staff: { pinHash: 'x' },
    });
    await expect(service.sessionState('s1', SESSION)).resolves.toEqual({
      hasPin: true,
      locked: false,
    });
  });
});

describe('PinService.setPin', () => {
  it('tạo PIN lần đầu: băm bcrypt, không lưu số thật, ghi audit', async () => {
    const { service, state, audit } = build({
      id: 's1',
      pinHash: null,
      pinFailedCount: 0,
    });
    await service.setPin('s1', SESSION, { pin: '246813' });
    expect(state.pinHash).not.toBe('246813');
    await expect(bcrypt.compare('246813', state.pinHash!)).resolves.toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_PIN_SET' }),
    );
  });

  it('PIN dễ đoán → 400 PIN_INVALID_FORMAT', async () => {
    const { service } = build({ id: 's1', pinHash: null, pinFailedCount: 0 });
    const error = await service
      .setPin('s1', SESSION, { pin: '123456' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(codeOf(error)).toBe('PIN_INVALID_FORMAT');
  });

  it('đổi PIN phải nhập đúng PIN cũ', async () => {
    const { service, state } = build(await withPin('246813'));
    const error = await service
      .setPin('s1', SESSION, { pin: '907315', currentPin: '111222' })
      .catch((e: unknown) => e);
    expect(codeOf(error)).toBe('PIN_INCORRECT');
    expect(state.pinFailedCount).toBe(1);

    await service.setPin('s1', SESSION, {
      pin: '907315',
      currentPin: '246813',
    });
    await expect(bcrypt.compare('907315', state.pinHash!)).resolves.toBe(true);
    expect(state.pinFailedCount).toBe(0);
  });
});

describe('PinService.verify — mở khoá', () => {
  it('đúng PIN → mở khoá phiên hiện tại + xoá đếm sai', async () => {
    const { service, prisma, state } = build(await withPin('246813', 3));
    await expect(
      service.verify('s1', SESSION, { pin: '246813' }),
    ).resolves.toEqual({ unlocked: true });
    expect(state.pinFailedCount).toBe(0);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: SESSION_HASH, staffId: 's1', revokedAt: null },
      data: { lockedAt: null },
    });
  });

  it('phiên đã bị thu hồi (vượt số lần sai) → đúng PIN cũng không mở lại, 401', async () => {
    const { service, prisma } = build(await withPin('246813'));
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValueOnce({
      count: 0,
    });
    const error = await service
      .verify('s1', SESSION, { pin: '246813', purpose: 'ALERT_DELETE' })
      .catch((e: unknown) => e);
    expect(codeOf(error)).toBe('SESSION_REVOKED');
    expect((error as HttpException).getStatus()).toBe(401);
  });

  it('sai PIN → 400 kèm số lần còn lại', async () => {
    const { service } = build(await withPin('246813', 1));
    const error = await service
      .verify('s1', SESSION, { pin: '000111' })
      .catch((e: unknown) => e);
    expect(codeOf(error)).toBe('PIN_INCORRECT');
    expect((error as Error).message).toMatch(/Còn 3 lần/);
  });

  it('sai lần thứ 5 → thu hồi MỌI phiên, reset đếm, 403 PIN_ATTEMPTS_EXCEEDED', async () => {
    const { service, prisma, state, audit } = build(await withPin('246813', 4));
    const error = await service
      .verify('s1', SESSION, { pin: '000111' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(codeOf(error)).toBe('PIN_ATTEMPTS_EXCEEDED');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { staffId: 's1', revokedAt: null },
      // Khoá luôn: access token còn hạn ≤15' cũng không dùng tiếp được.
      data: {
        revokedAt: expect.any(Date) as Date,
        lockedAt: expect.any(Date) as Date,
      },
    });
    expect(state.pinFailedCount).toBe(0);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_PIN_LOCKOUT' }),
    );
  });

  it('chưa có PIN (ADMIN vừa reset) → 403 PIN_SETUP_REQUIRED', async () => {
    const { service } = build({ id: 's1', pinHash: null, pinFailedCount: 0 });
    const error = await service
      .verify('s1', SESSION, { pin: '246813' })
      .catch((e: unknown) => e);
    expect(codeOf(error)).toBe('PIN_SETUP_REQUIRED');
  });

  it('kèm mục đích → cấp bằng chứng ngắn hạn chỉ dùng được cho đúng người + mục đích', async () => {
    const { service } = build(await withPin('246813'));
    const result = await service.verify('s1', SESSION, {
      pin: '246813',
      purpose: 'BACKUP_RESTORE',
    });
    expect(result.proof).toEqual(expect.any(String));
    expect(service.checkProof('s1', 'BACKUP_RESTORE', result.proof)).toBe(true);
    expect(service.checkProof('s1', 'ALERT_DELETE', result.proof)).toBe(false);
    expect(service.checkProof('s2', 'BACKUP_RESTORE', result.proof)).toBe(
      false,
    );
    expect(service.checkProof('s1', 'BACKUP_RESTORE', undefined)).toBe(false);
    expect(service.checkProof('s1', 'BACKUP_RESTORE', `${result.proof}x`)).toBe(
      false,
    );
  });

  it('bằng chứng hết hạn sau 2 phút', async () => {
    const { service } = build(await withPin('246813'));
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { proof } = await service.verify('s1', SESSION, {
      pin: '246813',
      purpose: 'ALERT_DELETE',
    });
    now.mockReturnValue(1_000_000 + 2 * 60_000 + 1);
    expect(service.checkProof('s1', 'ALERT_DELETE', proof)).toBe(false);
    now.mockRestore();
  });
});

describe('PinService.lock / resetPin', () => {
  it('khoá đúng phiên hiện tại, không đụng phiên đã thu hồi', async () => {
    const { service, prisma } = build(await withPin('246813'));
    await service.lock('s1', SESSION);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: SESSION_HASH,
        staffId: 's1',
        revokedAt: null,
        lockedAt: null,
      },
      data: { lockedAt: expect.any(Date) as Date },
    });
  });

  it('ADMIN reset → xoá PIN + đếm sai, ghi audit người bị reset', async () => {
    const { service, state, audit } = build(await withPin('246813', 2));
    await service.resetPin('admin-1', 's1');
    expect(state.pinHash).toBeNull();
    expect(state.pinFailedCount).toBe(0);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 'admin-1',
        action: 'AUTH_PIN_RESET',
        entityId: 's1',
      }),
    );
  });
});

describe('PinService.forgetPin — quên PIN, đăng nhập lại', () => {
  it('xoá PIN + đếm sai, thu hồi MỌI phiên và ghi audit của chính người dùng', async () => {
    const { service, state, prisma, audit } = build(await withPin('246813', 3));
    await service.forgetPin('s1');
    expect(state.pinHash).toBeNull();
    expect(state.pinFailedCount).toBe(0);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { staffId: 's1', revokedAt: null },
      data: {
        revokedAt: expect.any(Date) as Date,
        lockedAt: expect.any(Date) as Date,
      },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 's1',
        action: 'AUTH_PIN_FORGOT',
        entityId: 's1',
      }),
    );
  });
});
