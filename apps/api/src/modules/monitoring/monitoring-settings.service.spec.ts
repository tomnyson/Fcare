/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret, encryptSecret } from '../../common/utils/secret-cipher';
import { MonitoringSettingsService } from './monitoring-settings.service';

const KEY = randomBytes(32).toString('hex');
const DB_HOOK = 'https://discord.com/api/webhooks/111/db-token';
const ENV_HOOK = 'https://discord.com/api/webhooks/222/env-token';

type Row = Record<string, unknown> | null;

function build(env: Record<string, string | undefined>, row: Row) {
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => env[key] ?? fallback),
  } as unknown as ConfigService;
  const upsert = jest.fn(
    ({ create, update }: { create: object; update: object }) => ({
      id: 'default',
      enabled: true,
      retentionDays: 30,
      webhookUrlEncrypted: null,
      lastReportAt: null,
      lastReportOk: null,
      updatedAt: new Date('2026-09-21T00:00:00Z'),
      updatedBy: { id: 's1', fullName: 'Quản trị' },
      ...(row ?? {}),
      ...(row ? update : create),
    }),
  );
  const prisma = {
    monitoringSetting: {
      findUnique: jest.fn().mockResolvedValue(row),
      upsert,
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  const audit = { log: jest.fn() } as unknown as AuditService;
  return {
    service: new MonitoringSettingsService(config, prisma, audit),
    prisma,
    audit,
    upsert,
  };
}

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'default',
    enabled: true,
    retentionDays: 45,
    webhookUrlEncrypted: encryptSecret(DB_HOOK, KEY),
    lastReportAt: null,
    lastReportOk: null,
    updatedAt: new Date('2026-09-20T00:00:00Z'),
    updatedBy: null,
    ...overrides,
  };
}

describe('MonitoringSettingsService', () => {
  describe('getEffectiveConfig', () => {
    it('chưa có dòng DB → dùng env, mặc định 30 ngày', async () => {
      const { service } = build({ DISCORD_WEBHOOK_URL: ENV_HOOK }, null);
      await expect(service.getEffectiveConfig()).resolves.toEqual({
        enabled: true,
        webhookUrl: ENV_HOOK,
        retentionDays: 30,
      });
    });

    it('DB có webhook → giải mã và ưu tiên hơn env', async () => {
      const { service } = build(
        { SETTINGS_ENCRYPTION_KEY: KEY, DISCORD_WEBHOOK_URL: ENV_HOOK },
        dbRow(),
      );
      await expect(service.getEffectiveConfig()).resolves.toEqual({
        enabled: true,
        webhookUrl: DB_HOOK,
        retentionDays: 45,
      });
    });

    it('DB chưa có webhook → fallback env', async () => {
      const { service } = build(
        { SETTINGS_ENCRYPTION_KEY: KEY, DISCORD_WEBHOOK_URL: ENV_HOOK },
        dbRow({ webhookUrlEncrypted: null }),
      );
      expect((await service.getEffectiveConfig()).webhookUrl).toBe(ENV_HOOK);
    });

    it('env không phải webhook Discord hợp lệ → coi như chưa cấu hình', async () => {
      const { service } = build(
        { DISCORD_WEBHOOK_URL: 'https://evil.io/hook' },
        null,
      );
      expect((await service.getEffectiveConfig()).webhookUrl).toBeNull();
    });

    it('không giải mã được (đổi khoá) → null, không ném', async () => {
      const { service } = build(
        { SETTINGS_ENCRYPTION_KEY: randomBytes(32).toString('hex') },
        dbRow(),
      );
      const stderr = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      expect((await service.getEffectiveConfig()).webhookUrl).toBeNull();
      stderr.mockRestore();
    });
  });

  describe('getView', () => {
    it('không bao giờ trả URL webhook, chỉ hasWebhook + nguồn', async () => {
      const { service } = build({ SETTINGS_ENCRYPTION_KEY: KEY }, dbRow());
      const view = await service.getView();
      expect(view).toMatchObject({
        hasWebhook: true,
        webhookSource: 'DATABASE',
        retentionDays: 45,
        encryptionReady: true,
      });
      expect(JSON.stringify(view)).not.toContain('db-token');
    });

    it('chỉ có env → nguồn ENV', async () => {
      const { service } = build({ DISCORD_WEBHOOK_URL: ENV_HOOK }, null);
      expect(await service.getView()).toMatchObject({
        hasWebhook: true,
        webhookSource: 'ENV',
        encryptionReady: false,
      });
    });
  });

  describe('update', () => {
    it('mã hoá webhook mới, ghi audit KHÔNG chứa URL', async () => {
      const { service, upsert, audit } = build(
        { SETTINGS_ENCRYPTION_KEY: KEY },
        null,
      );
      await service.update('s1', {
        webhookUrl: `  ${DB_HOOK}  `,
        enabled: false,
        retentionDays: 14,
      });
      const { create } = upsert.mock.calls[0][0] as {
        create: { webhookUrlEncrypted: string; enabled: boolean };
      };
      expect(decryptSecret(create.webhookUrlEncrypted, KEY)).toBe(DB_HOOK);
      expect(create.enabled).toBe(false);
      const auditCall = (audit.log as jest.Mock).mock.calls[0][0];
      expect(auditCall).toMatchObject({
        staffId: 's1',
        action: 'MONITORING_SETTINGS_UPDATE',
        entity: 'MonitoringSetting',
        metadata: { webhookChanged: true },
      });
      expect(JSON.stringify(auditCall)).not.toContain('db-token');
    });

    it('không gửi webhookUrl → giữ nguyên webhook cũ', async () => {
      const { service, upsert } = build(
        { SETTINGS_ENCRYPTION_KEY: KEY },
        dbRow(),
      );
      await service.update('s1', { enabled: true, retentionDays: 30 });
      const { update } = upsert.mock.calls[0][0] as { update: object };
      expect(update).not.toHaveProperty('webhookUrlEncrypted');
    });

    it('clearWebhook → xoá webhook trong DB', async () => {
      const { service, upsert } = build(
        { SETTINGS_ENCRYPTION_KEY: KEY },
        dbRow(),
      );
      await service.update('s1', {
        clearWebhook: true,
        enabled: true,
        retentionDays: 30,
      });
      const { update } = upsert.mock.calls[0][0] as {
        update: { webhookUrlEncrypted: unknown };
      };
      expect(update.webhookUrlEncrypted).toBeNull();
    });

    it('thiếu khoá mã hoá → 400 MONITORING_ENCRYPTION_KEY_MISSING', async () => {
      const { service } = build({}, null);
      const error = await service
        .update('s1', { webhookUrl: DB_HOOK, enabled: true, retentionDays: 30 })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'MONITORING_ENCRYPTION_KEY_MISSING',
      });
    });

    it('URL không phải webhook Discord → 400', async () => {
      const { service } = build({ SETTINGS_ENCRYPTION_KEY: KEY }, null);
      await expect(
        service.update('s1', {
          webhookUrl: 'https://evil.io/api/webhooks/1/x',
          enabled: true,
          retentionDays: 30,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('recordReport lưu thời điểm + kết quả gửi', async () => {
    const { service, prisma } = build({}, null);
    const at = new Date('2026-09-21T01:00:00Z');
    await service.recordReport(at, false);
    expect(prisma.monitoringSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { lastReportAt: at, lastReportOk: false },
      }),
    );
  });
});
