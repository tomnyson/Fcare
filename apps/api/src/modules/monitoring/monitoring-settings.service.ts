import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKey,
} from '../../common/utils/secret-cipher';
import { isDiscordWebhookUrl } from './discord-report';
import type {
  EffectiveMonitoringConfig,
  MonitoringSettingsView,
  UpdateMonitoringSettingsInput,
} from './monitoring.types';

const SETTINGS_ID = 'default';
export const DEFAULT_RETENTION_DAYS = 30;

type MonitoringSettingRow = NonNullable<
  Awaited<ReturnType<PrismaService['monitoringSetting']['findUnique']>>
> & { updatedBy: { id: string; fullName: string } | null };

/**
 * Cấu hình giám sát lỗi: DB (singleton `default`) → fallback env
 * `DISCORD_WEBHOOK_URL`. URL webhook là bí mật: lưu mã hoá AES-256-GCM,
 * API chỉ trả `hasWebhook`.
 *
 * KHÔNG dùng `Logger` ở đây: lỗi giải mã ghi qua logger sẽ bị hook giám sát
 * bắt lại trong lúc đang chạy báo cáo — chỉ ghi stderr.
 */
@Injectable()
export class MonitoringSettingsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get encryptionKey(): string {
    return this.config.get<string>('SETTINGS_ENCRYPTION_KEY', '');
  }

  private envWebhook(): string | null {
    const url = this.config.get<string>('DISCORD_WEBHOOK_URL', '').trim();
    return url && isDiscordWebhookUrl(url) ? url : null;
  }

  private findRow(): Promise<MonitoringSettingRow | null> {
    return this.prisma.monitoringSetting.findUnique({
      where: { id: SETTINGS_ID },
      include: { updatedBy: { select: { id: true, fullName: true } } },
    });
  }

  private decryptOrNull(cipher: string | null): string | null {
    if (!cipher) return null;
    try {
      return decryptSecret(cipher, this.encryptionKey);
    } catch (error) {
      process.stderr.write(
        `[monitoring] Không giải mã được webhook Discord: ${(error as Error).message}\n`,
      );
      return null;
    }
  }

  async getEffectiveConfig(): Promise<EffectiveMonitoringConfig> {
    const row = await this.findRow();
    return {
      enabled: row?.enabled ?? true,
      webhookUrl:
        this.decryptOrNull(row?.webhookUrlEncrypted ?? null) ??
        this.envWebhook(),
      retentionDays: row?.retentionDays ?? DEFAULT_RETENTION_DAYS,
    };
  }

  async getView(): Promise<MonitoringSettingsView> {
    return this.toView(await this.findRow());
  }

  private toView(row: MonitoringSettingRow | null): MonitoringSettingsView {
    const webhookSource = row?.webhookUrlEncrypted
      ? 'DATABASE'
      : this.envWebhook()
        ? 'ENV'
        : null;
    return {
      enabled: row?.enabled ?? true,
      hasWebhook: webhookSource !== null,
      webhookSource,
      retentionDays: row?.retentionDays ?? DEFAULT_RETENTION_DAYS,
      encryptionReady: parseEncryptionKey(this.encryptionKey) !== null,
      lastReportAt: row?.lastReportAt?.toISOString() ?? null,
      lastReportOk: row?.lastReportOk ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  }

  async update(
    actorId: string,
    input: UpdateMonitoringSettingsInput,
  ): Promise<MonitoringSettingsView> {
    const existing = await this.findRow();
    const webhookPatch = this.buildWebhookPatch(input);
    const data = {
      enabled: input.enabled,
      retentionDays: input.retentionDays,
      updatedById: actorId,
    };
    const row = await this.prisma.monitoringSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data, ...webhookPatch },
      update: { ...data, ...webhookPatch },
      include: { updatedBy: { select: { id: true, fullName: true } } },
    });
    await this.audit.log({
      staffId: actorId,
      action: 'MONITORING_SETTINGS_UPDATE',
      entity: 'MonitoringSetting',
      entityId: SETTINGS_ID,
      metadata: {
        enabled: { from: existing?.enabled ?? null, to: input.enabled },
        retentionDays: {
          from: existing?.retentionDays ?? null,
          to: input.retentionDays,
        },
        webhookChanged: 'webhookUrlEncrypted' in webhookPatch,
        webhookCleared: webhookPatch.webhookUrlEncrypted === null,
      },
    });
    return this.toView(row);
  }

  /** `{}` = giữ nguyên; `{ webhookUrlEncrypted: null }` = xoá; chuỗi = đổi. */
  private buildWebhookPatch(input: UpdateMonitoringSettingsInput): {
    webhookUrlEncrypted?: string | null;
  } {
    if (input.clearWebhook) return { webhookUrlEncrypted: null };
    const url = input.webhookUrl?.trim();
    if (!url) return {};
    if (!isDiscordWebhookUrl(url)) {
      throw new BadRequestException({
        code: 'MONITORING_WEBHOOK_INVALID',
        message:
          'URL webhook phải có dạng https://discord.com/api/webhooks/<id>/<token>.',
      });
    }
    if (!parseEncryptionKey(this.encryptionKey)) {
      throw new BadRequestException({
        code: 'MONITORING_ENCRYPTION_KEY_MISSING',
        message:
          'Máy chủ chưa cấu hình SETTINGS_ENCRYPTION_KEY nên không thể lưu webhook Discord.',
      });
    }
    return { webhookUrlEncrypted: encryptSecret(url, this.encryptionKey) };
  }

  async recordReport(at: Date, ok: boolean): Promise<void> {
    await this.prisma.monitoringSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, lastReportAt: at, lastReportOk: ok },
      update: { lastReportAt: at, lastReportOk: ok },
    });
  }
}
