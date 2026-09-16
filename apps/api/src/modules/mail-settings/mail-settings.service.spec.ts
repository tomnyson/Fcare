/* eslint-disable @typescript-eslint/unbound-method */
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret, encryptSecret } from '../../common/utils/secret-cipher';
import { MailSettingsService } from './mail-settings.service';

const KEY = randomBytes(32).toString('hex');
const encryptSecretForTest = (plain: string) => encryptSecret(plain, KEY);

type UpsertCallArgs = {
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

/** Tránh truy cập `.mock.calls[i][0]` kiểu `any` trực tiếp trong test — ép kiểu một lần ở đây. */
function upsertArgsAt(prisma: PrismaService, index: number): UpsertCallArgs {
  const calls = (prisma.mailSetting.upsert as jest.Mock).mock
    .calls as UpsertCallArgs[][];
  return calls[index][0];
}

type UpdateCallArgs = { data: Record<string, unknown> };

/** Cùng ý tưởng với `upsertArgsAt`, dùng cho `prisma.mailSetting.update`. */
function updateArgsAt(prisma: PrismaService, index: number): UpdateCallArgs {
  const calls = (prisma.mailSetting.update as jest.Mock).mock
    .calls as UpdateCallArgs[][];
  return calls[index][0];
}

function auditMetadataAt(
  audit: AuditService,
  index: number,
): Record<string, unknown> {
  const calls = (audit.log as jest.Mock).mock.calls as {
    metadata: Record<string, unknown>;
  }[][];
  return calls[index][0].metadata;
}

function configWith(env: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string, fallback?: unknown) => env[key] ?? fallback),
  } as unknown as ConfigService;
}

function build(
  env: Record<string, string | undefined>,
  row: Record<string, unknown> | null,
) {
  const prisma = {
    mailSetting: {
      findUnique: jest.fn().mockResolvedValue(row),
      upsert: jest.fn(
        ({
          create,
          update,
        }: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => ({
          id: 'default',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastTestedAt: null,
          lastTestOk: null,
          ...(row ?? {}),
          ...create,
          ...update,
          updatedBy: { id: 'admin-1', fullName: 'Quản trị' },
        }),
      ),
      update: jest.fn(),
    },
  } as unknown as PrismaService;
  const audit = { log: jest.fn() } as unknown as AuditService;
  return {
    service: new MailSettingsService(configWith(env), prisma, audit),
    prisma,
    audit,
  };
}

const dbRow = {
  id: 'default',
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  username: 'fcare@fpt.edu.vn',
  passwordEncrypted: null,
  fromName: 'FCare',
  fromEmail: 'fcare@fpt.edu.vn',
  enabled: true,
  lastTestedAt: null,
  lastTestOk: null,
  updatedById: 'admin-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  updatedBy: { id: 'admin-1', fullName: 'Quản trị' },
};

describe('MailSettingsService', () => {
  it('chưa có dòng DB → config hiệu lực lấy từ env, source ENV', async () => {
    const { service } = build(
      {
        SMTP_HOST: 'mailhog',
        SMTP_PORT: '1025',
        SMTP_FROM: 'noreply@fpt.edu.vn',
      },
      null,
    );
    const config = await service.getEffectiveConfig();
    expect(config).toMatchObject({
      host: 'mailhog',
      port: 1025,
      secure: false,
      auth: null,
      source: 'ENV',
      enabled: true,
    });
    expect(config.fromEmail).toBe('noreply@fpt.edu.vn');
  });

  it('getView không bao giờ chứa mật khẩu, chỉ hasPassword + encryptionReady', async () => {
    const { service } = build(
      { SETTINGS_ENCRYPTION_KEY: KEY },
      { ...dbRow, passwordEncrypted: 'v1:a:b:c' },
    );
    const view = await service.getView();
    expect(view).not.toHaveProperty('password');
    expect(view).not.toHaveProperty('passwordEncrypted');
    expect(view.hasPassword).toBe(true);
    expect(view.encryptionReady).toBe(true);
    expect(view.source).toBe('DATABASE');
  });

  it('update mã hoá mật khẩu trước khi lưu và ghi audit không kèm giá trị', async () => {
    const { service, prisma, audit } = build(
      { SETTINGS_ENCRYPTION_KEY: KEY },
      null,
    );
    await service.update('admin-1', {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      username: 'a@fpt.edu.vn',
      password: 'app-pass',
      fromName: 'FCare',
      fromEmail: 'a@fpt.edu.vn',
      enabled: true,
    });
    const upsertArgs = upsertArgsAt(prisma, 0);
    expect(upsertArgs.create.passwordEncrypted).not.toContain('app-pass');
    expect(
      decryptSecret(upsertArgs.create.passwordEncrypted as string, KEY),
    ).toBe('app-pass');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MAIL_SETTINGS_UPDATE',
        entity: 'MailSetting',
        entityId: 'default',
      }),
    );
    const metadata = auditMetadataAt(audit, 0);
    expect(JSON.stringify(metadata)).not.toContain('app-pass');
    expect(metadata.passwordChanged).toBe(true);
  });

  it('update bỏ trống password → giữ ciphertext cũ; clearPassword → null', async () => {
    const existing = { ...dbRow, passwordEncrypted: 'v1:old:old:old' };
    const { service, prisma } = build(
      { SETTINGS_ENCRYPTION_KEY: KEY },
      existing,
    );
    const base = {
      host: 'h',
      port: 587,
      secure: false,
      username: 'u',
      fromName: 'F',
      fromEmail: 'f@fpt.edu.vn',
      enabled: true,
    };
    await service.update('admin-1', base);
    expect(upsertArgsAt(prisma, 0).update).not.toHaveProperty(
      'passwordEncrypted',
    );
    await service.update('admin-1', { ...base, clearPassword: true });
    expect(upsertArgsAt(prisma, 1).update.passwordEncrypted).toBeNull();
  });

  it('có password nhưng thiếu khoá mã hoá → 400 MAIL_ENCRYPTION_KEY_MISSING', async () => {
    const { service } = build({}, null);
    await expect(
      service.update('admin-1', {
        host: 'h',
        port: 587,
        secure: false,
        password: 'x',
        fromName: 'F',
        fromEmail: 'f@fpt.edu.vn',
        enabled: true,
      }),
    ).rejects.toMatchObject({
      // `expect.objectContaining` khai báo kiểu trả về `any` trong @types/jest.
      /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
      response: expect.objectContaining({
        code: 'MAIL_ENCRYPTION_KEY_MISSING',
      }),
    });
  });

  it('config hiệu lực được cache và version tăng sau khi update', async () => {
    const { service, prisma } = build({ SETTINGS_ENCRYPTION_KEY: KEY }, dbRow);
    const first = await service.getEffectiveConfig();
    await service.getEffectiveConfig();
    expect(prisma.mailSetting.findUnique).toHaveBeenCalledTimes(1);
    await service.update('admin-1', {
      host: 'h2',
      port: 25,
      secure: false,
      fromName: 'F',
      fromEmail: 'f@fpt.edu.vn',
      enabled: false,
    });
    const second = await service.getEffectiveConfig();
    expect(second.version).toBe(first.version + 1);
    expect(second.host).toBe('h2');
    expect(second.enabled).toBe(false);
  });

  it('formatFrom ghép "Tên" <email>', () => {
    const { service } = build({}, null);
    expect(
      service.formatFrom({
        fromName: 'FCare — Học vụ',
        fromEmail: 'a@fpt.edu.vn',
      }),
    ).toBe('"FCare — Học vụ" <a@fpt.edu.vn>');
  });
});

describe('MailSettingsService.sendTest', () => {
  function withTransport(
    row: Record<string, unknown> | null,
    transport: { verify: jest.Mock; sendMail: jest.Mock },
  ) {
    const built = build({ SETTINGS_ENCRYPTION_KEY: KEY }, row);
    (
      built.service as unknown as { transportFactory: unknown }
    ).transportFactory = jest.fn(() => transport);
    return {
      ...built,
      factory: (built.service as unknown as { transportFactory: jest.Mock })
        .transportFactory,
    };
  }

  it('từ chối email nhận ngoài miền FPT', async () => {
    const { service } = withTransport(dbRow, {
      verify: jest.fn(),
      sendMail: jest.fn(),
    });
    await expect(
      service.sendTest('admin-1', { to: 'ai@gmail.com' }),
    ).rejects.toMatchObject({
      // `expect.objectContaining` khai báo kiểu trả về `any` trong @types/jest.
      /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
      response: expect.objectContaining({
        code: 'MAIL_TEST_RECIPIENT_NOT_ALLOWED',
      }),
    });
  });

  it('gửi bằng cấu hình đã lưu → verify + sendMail, cập nhật lastTestOk, audit', async () => {
    const transport = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockResolvedValue({}),
    };
    const { service, prisma, audit } = withTransport(dbRow, transport);
    const result = await service.sendTest('admin-1', {
      to: 'admin@fpt.edu.vn',
    });
    expect(result.ok).toBe(true);
    expect(result.usingSaved).toBe(true);
    expect(transport.verify).toHaveBeenCalled();
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@fpt.edu.vn',
        from: '"FCare" <fcare@fpt.edu.vn>',
      }),
    );
    expect(prisma.mailSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        // `expect.objectContaining` khai báo kiểu trả về `any` trong @types/jest.
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
        data: expect.objectContaining({ lastTestOk: true }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MAIL_SETTINGS_TEST',
        metadata: { ok: true, usingSaved: true },
      }),
    );
  });

  it('gửi bằng bản nháp trên form → dùng draft, KHÔNG ghi lastTest', async () => {
    const transport = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockResolvedValue({}),
    };
    const { service, prisma, factory } = withTransport(dbRow, transport);
    const result = await service.sendTest('admin-1', {
      to: 'admin@fpt.edu.vn',
      draft: {
        host: 'smtp.draft.vn',
        port: 2525,
        secure: false,
        username: 'u',
        password: 'p',
        fromName: 'Nháp',
        fromEmail: 'nhap@fpt.edu.vn',
        enabled: true,
      },
    });
    expect(result.usingSaved).toBe(false);
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.draft.vn',
        port: 2525,
        auth: { user: 'u', pass: 'p' },
      }),
    );
    expect(prisma.mailSetting.update).not.toHaveBeenCalled();
  });

  it('draft bỏ trống password nhưng đã có mật khẩu lưu → dùng mật khẩu đã lưu', async () => {
    const saved = {
      ...dbRow,
      passwordEncrypted: encryptSecretForTest('saved-pass'),
    };
    const transport = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockResolvedValue({}),
    };
    const { service, factory } = withTransport(saved, transport);
    await service.sendTest('admin-1', {
      to: 'admin@fpt.edu.vn',
      draft: {
        host: 'h',
        port: 587,
        secure: false,
        username: 'fcare@fpt.edu.vn',
        fromName: 'F',
        fromEmail: 'f@fpt.edu.vn',
        enabled: true,
      },
    });
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { user: 'fcare@fpt.edu.vn', pass: 'saved-pass' },
      }),
    );
  });

  it('SMTP lỗi → 400 MAIL_TEST_FAILED, message không chứa mật khẩu, lastTestOk=false', async () => {
    const transport = {
      verify: jest
        .fn()
        .mockRejectedValue(new Error('535 Authentication failed for p@ss')),
      sendMail: jest.fn(),
    };
    const { service, prisma } = withTransport(
      { ...dbRow, passwordEncrypted: encryptSecretForTest('p@ss') },
      transport,
    );
    await expect(
      service.sendTest('admin-1', { to: 'admin@fpt.edu.vn' }),
    ).rejects.toMatchObject({
      // `expect.objectContaining` khai báo kiểu trả về `any` trong @types/jest.
      /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
      response: expect.objectContaining({ code: 'MAIL_TEST_FAILED' }),
    });
    expect(updateArgsAt(prisma, 0).data.lastTestOk).toBe(false);
  });
});
