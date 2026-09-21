import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { AuthService, hashPassword } from './auth.service';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

const GOOGLE_PAYLOAD = {
  sub: 'google-sub-1',
  iss: 'https://accounts.google.com',
  email: 'gv.a@fpt.edu.vn',
  email_verified: true,
};

/** Giảng viên vừa import: đang dùng mật khẩu tạm nên cờ bắt đổi mật khẩu bật. */
function makeStaff(passwordHash = 'hash') {
  return {
    id: 'staff-1',
    staffCode: 'GV001',
    fullName: 'Giảng viên A',
    departmentId: 'bm-1',
    isActive: true,
    mustChangePassword: true,
    passwordHash,
    roles: [{ role: { key: 'LECTURER' } }],
  };
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeService(staff = makeStaff()) {
  const prisma = {
    staff: {
      findUnique: jest.fn().mockResolvedValue(staff),
      findFirst: jest.fn().mockResolvedValue(staff),
    },
    staffOAuthIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    consentLog: { create: jest.fn().mockResolvedValue({ id: 'consent-1' }) },
  };
  const jwt = new JwtService({ secret: 'test-secret' });
  const config = new ConfigService({
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REDIRECT_URI: 'http://localhost/cb',
    JWT_ACCESS_SECRET: 'test-secret',
  });
  const audit = { log: jest.fn() } as unknown as AuditService;
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    audit,
    config,
  );
  return { service, prisma, jwt };
}

function createdAuthMethod(prisma: ReturnType<typeof makeService>['prisma']) {
  const calls = prisma.refreshToken.create.mock.calls as [
    { data: { authMethod?: string } },
  ][];
  return calls[0][0].data.authMethod;
}

describe('AuthService — đăng nhập Google không bắt đổi mật khẩu tạm', () => {
  beforeEach(() => {
    verifyIdToken.mockResolvedValue({ getPayload: () => GOOGLE_PAYLOAD });
  });

  it('đăng nhập Google (đã liên kết) không bị bắt đổi mật khẩu dù tài khoản còn mật khẩu tạm', async () => {
    const { service, prisma, jwt } = makeService();
    prisma.staffOAuthIdentity.findUnique.mockResolvedValue({
      staff: makeStaff(),
    });

    const result = await service.googleCallback('id-token');

    expect(result.session?.user.mustChangePassword).toBe(false);
    const payload = jwt.decode<{ mustChangePassword: boolean }>(
      result.session?.accessToken ?? '',
    );
    expect(payload.mustChangePassword).toBe(false);
    expect(createdAuthMethod(prisma)).toBe('GOOGLE');
  });

  it('đăng nhập Google lần đầu (khớp email) cũng không bắt đổi mật khẩu', async () => {
    const { service, prisma } = makeService();

    const result = await service.googleCallback('id-token');

    expect(result.session?.user.mustChangePassword).toBe(false);
    expect(createdAuthMethod(prisma)).toBe('GOOGLE');
  });

  it('đăng nhập bằng mật khẩu tạm vẫn bắt đổi mật khẩu như cũ', async () => {
    const { service, prisma } = makeService(
      makeStaff(await hashPassword('Tam@123')),
    );

    const session = await service.login('GV001', 'Tam@123');

    expect(session.user.mustChangePassword).toBe(true);
    expect(createdAuthMethod(prisma)).toBe('PASSWORD');
  });

  it('ký cam kết sau khi đăng nhập Google không bật lại cờ đổi mật khẩu', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({ authMethod: 'GOOGLE' });

    const result = await service.recordConsent('staff-1', 'rt-google', 'ua');

    expect(result.user.mustChangePassword).toBe(false);
    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hash('rt-google') } }),
    );
  });

  it('ký cam kết trong phiên đăng nhập mật khẩu tạm vẫn giữ cờ đổi mật khẩu', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      authMethod: 'PASSWORD',
    });

    const result = await service.recordConsent('staff-1', 'rt-pass', 'ua');

    expect(result.user.mustChangePassword).toBe(true);
  });

  it('thiếu refresh token khi ký cam kết thì coi như đăng nhập mật khẩu (an toàn)', async () => {
    const { service } = makeService();

    const result = await service.recordConsent('staff-1', undefined, 'ua');

    expect(result.user.mustChangePassword).toBe(true);
  });

  it('làm mới token của phiên Google giữ nguyên cách đăng nhập, không bật lại cờ', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      staffId: 'staff-1',
      consentLogId: 'consent-1',
      authMethod: 'GOOGLE',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      staff: makeStaff(),
    });

    const session = await service.refresh('rt-google');

    expect(session.user.mustChangePassword).toBe(false);
    expect(session.user.consented).toBe(true);
    expect(createdAuthMethod(prisma)).toBe('GOOGLE');
  });

  it('làm mới token của phiên mật khẩu tạm vẫn giữ cờ đổi mật khẩu', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      staffId: 'staff-1',
      consentLogId: null,
      authMethod: 'PASSWORD',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      staff: makeStaff(),
    });

    const session = await service.refresh('rt-pass');

    expect(session.user.mustChangePassword).toBe(true);
    expect(createdAuthMethod(prisma)).toBe('PASSWORD');
  });
});
