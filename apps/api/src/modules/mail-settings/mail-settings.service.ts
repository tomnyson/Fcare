import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKey,
} from '../../common/utils/secret-cipher';
import { isAllowedStaffEmail } from '../../common/utils/staff-email';
import {
  createMailTransport,
  type MailTransportFactory,
} from './mail-transport.factory';
import type {
  EffectiveMailConfig,
  MailSettingsView,
  SendTestMailInput,
  SendTestMailResult,
  UpdateMailSettingsInput,
} from './mail-settings.types';
import { isExternalNotificationsDisabled } from '../../common/utils/external-notifications';

const SETTINGS_ID = 'default';
const CACHE_TTL_MS = 60_000;
const DEFAULT_FROM_NAME = 'FCare — Chăm sóc & Giám sát Học vụ';
const DEFAULT_FROM_EMAIL = 'fcare-noreply@fpt.edu.vn';

type MailSettingRow = NonNullable<
  Awaited<ReturnType<PrismaService['mailSetting']['findUnique']>>
> & { updatedBy: { id: string; fullName: string } | null };

@Injectable()
export class MailSettingsService {
  private readonly logger = new Logger(MailSettingsService.name);
  private cache: { config: EffectiveMailConfig; expiresAt: number } | null =
    null;
  private version = 1;
  private transportFactory: MailTransportFactory = createMailTransport;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get encryptionKey(): string {
    return this.config.get<string>('SETTINGS_ENCRYPTION_KEY', '');
  }

  private findRow(): Promise<MailSettingRow | null> {
    return this.prisma.mailSetting.findUnique({
      where: { id: SETTINGS_ID },
      include: { updatedBy: { select: { id: true, fullName: true } } },
    });
  }

  /** Cấu hình từ biến môi trường — fallback khi DB chưa có dòng nào. */
  private envConfig(): Omit<EffectiveMailConfig, 'version'> {
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const port = Number(this.config.get<string>('SMTP_PORT', '1025'));
    return {
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : null,
      fromName: this.config.get<string>('SMTP_FROM_NAME', DEFAULT_FROM_NAME),
      fromEmail: this.config.get<string>('SMTP_FROM', DEFAULT_FROM_EMAIL),
      enabled: true,
      source: 'ENV',
    };
  }

  async getView(): Promise<MailSettingsView> {
    const row = await this.findRow();
    const encryptionReady = parseEncryptionKey(this.encryptionKey) !== null;
    if (!row) {
      const env = this.envConfig();
      return {
        host: env.host,
        port: env.port,
        secure: env.secure,
        username: env.auth?.user ?? null,
        hasPassword: Boolean(env.auth),
        fromName: env.fromName,
        fromEmail: env.fromEmail,
        enabled: true,
        source: 'ENV',
        encryptionReady,
        externalDisabled: isExternalNotificationsDisabled(this.config),
        lastTestedAt: null,
        lastTestOk: null,
        updatedAt: null,
        updatedBy: null,
      };
    }
    return this.toView(row, encryptionReady);
  }

  private toView(
    row: MailSettingRow,
    encryptionReady: boolean,
  ): MailSettingsView {
    return {
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      hasPassword: Boolean(row.passwordEncrypted),
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      enabled: row.enabled,
      source: 'DATABASE',
      encryptionReady,
      externalDisabled: isExternalNotificationsDisabled(this.config),
      lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
      lastTestOk: row.lastTestOk,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }

  async update(
    actorId: string,
    input: UpdateMailSettingsInput,
  ): Promise<MailSettingsView> {
    const existing = await this.findRow();
    const passwordPatch = this.buildPasswordPatch(input);
    const data = {
      host: input.host.trim(),
      port: input.port,
      secure: input.secure,
      username: input.username?.trim() || null,
      fromName: input.fromName.trim(),
      fromEmail: input.fromEmail.trim().toLowerCase(),
      enabled: input.enabled,
      updatedById: actorId,
    };
    const row = await this.prisma.mailSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data, ...passwordPatch },
      update: { ...data, ...passwordPatch },
      include: { updatedBy: { select: { id: true, fullName: true } } },
    });
    this.primeCacheFromRow(row);
    await this.audit.log({
      staffId: actorId,
      action: 'MAIL_SETTINGS_UPDATE',
      entity: 'MailSetting',
      entityId: SETTINGS_ID,
      metadata: {
        changedFields: this.changedFields(existing, data),
        passwordChanged: 'passwordEncrypted' in passwordPatch,
      },
    });
    return this.toView(row, parseEncryptionKey(this.encryptionKey) !== null);
  }

  /** `{}` = giữ nguyên; `{ passwordEncrypted: null }` = xoá; `{ passwordEncrypted: 'v1:…' }` = đổi. */
  private buildPasswordPatch(input: UpdateMailSettingsInput): {
    passwordEncrypted?: string | null;
  } {
    if (input.clearPassword) return { passwordEncrypted: null };
    if (!input.password) return {};
    if (!parseEncryptionKey(this.encryptionKey)) {
      throw new BadRequestException({
        code: 'MAIL_ENCRYPTION_KEY_MISSING',
        message:
          'Máy chủ chưa cấu hình SETTINGS_ENCRYPTION_KEY nên không thể lưu mật khẩu SMTP.',
      });
    }
    return {
      passwordEncrypted: encryptSecret(input.password, this.encryptionKey),
    };
  }

  private changedFields(
    existing: MailSettingRow | null,
    data: Record<string, unknown>,
  ): string[] {
    if (!existing) return Object.keys(data);
    return Object.keys(data).filter(
      (key) =>
        key !== 'updatedById' &&
        (existing as Record<string, unknown>)[key] !== data[key],
    );
  }

  invalidate(): void {
    this.cache = null;
    this.version += 1;
  }

  /** Sau khi ghi DB thành công, nạp thẳng bản ghi mới vào cache thay vì chỉ xoá cache —
   * tránh việc gọi lại getEffectiveConfig() ngay sau update() đọc phải dữ liệu cũ
   * (ví dụ do độ trễ replica đọc). */
  private primeCacheFromRow(row: MailSettingRow): void {
    this.version += 1;
    this.cache = {
      config: { ...this.fromRow(row), version: this.version },
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  }

  async getEffectiveConfig(): Promise<EffectiveMailConfig> {
    if (this.cache && this.cache.expiresAt > Date.now())
      return this.cache.config;
    const row = await this.findRow();
    const config: EffectiveMailConfig = row
      ? { ...this.fromRow(row), version: this.version }
      : { ...this.envConfig(), version: this.version };
    this.cache = { config, expiresAt: Date.now() + CACHE_TTL_MS };
    return config;
  }

  private fromRow(row: MailSettingRow): Omit<EffectiveMailConfig, 'version'> {
    return {
      host: row.host,
      port: row.port,
      secure: row.secure,
      auth:
        row.username && row.passwordEncrypted
          ? {
              user: row.username,
              pass: this.decryptOrWarn(row.passwordEncrypted),
            }
          : null,
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      enabled: row.enabled,
      source: 'DATABASE',
    };
  }

  private decryptOrWarn(cipher: string): string {
    try {
      return decryptSecret(cipher, this.encryptionKey);
    } catch (error) {
      this.logger.warn(
        `Không giải mã được mật khẩu SMTP: ${(error as Error).message}`,
      );
      return '';
    }
  }

  formatFrom(
    config: Pick<EffectiveMailConfig, 'fromName' | 'fromEmail'>,
  ): string {
    const name = config.fromName.replace(/"/g, '');
    return name ? `"${name}" <${config.fromEmail}>` : config.fromEmail;
  }

  async sendTest(
    actorId: string,
    input: SendTestMailInput,
  ): Promise<SendTestMailResult> {
    if (isExternalNotificationsDisabled(this.config)) {
      throw new BadRequestException({
        code: 'MAIL_EXTERNAL_DISABLED',
        message:
          'Hệ thống đang chặn gửi email ra ngoài (NOTIFICATIONS_EXTERNAL_DISABLED). Tắt biến này rồi thử lại.',
      });
    }
    const to = input.to.trim().toLowerCase();
    if (!isAllowedStaffEmail(to)) {
      throw new BadRequestException({
        code: 'MAIL_TEST_RECIPIENT_NOT_ALLOWED',
        message: 'Email nhận thử phải thuộc miền @fpt.edu.vn hoặc @fe.edu.vn.',
      });
    }
    const usingSaved = !input.draft;
    const config = input.draft
      ? await this.draftConfig(input.draft)
      : await this.getEffectiveConfig();
    const transport = this.transportFactory(config);
    const sentAt = new Date();
    try {
      await transport.verify();
      await transport.sendMail({
        from: this.formatFrom(config),
        to,
        subject: '[FCare] Mail thử cấu hình SMTP',
        text: `Hệ thống FCare đã gửi mail thử thành công lúc ${sentAt.toLocaleString('vi-VN')}. Máy chủ: ${config.host}:${config.port}.`,
      });
    } catch (error) {
      await this.recordTest(usingSaved, sentAt, false);
      await this.audit.log({
        staffId: actorId,
        action: 'MAIL_SETTINGS_TEST',
        entity: 'MailSetting',
        entityId: SETTINGS_ID,
        metadata: { ok: false, usingSaved },
      });
      throw new BadRequestException({
        code: 'MAIL_TEST_FAILED',
        message: this.sanitizeSmtpError(error, config),
      });
    }
    await this.recordTest(usingSaved, sentAt, true);
    await this.audit.log({
      staffId: actorId,
      action: 'MAIL_SETTINGS_TEST',
      entity: 'MailSetting',
      entityId: SETTINGS_ID,
      metadata: { ok: true, usingSaved },
    });
    return { ok: true, sentAt: sentAt.toISOString(), usingSaved };
  }

  /** Cấu hình từ form chưa lưu; password trống → mượn mật khẩu đã lưu (nếu có). */
  private async draftConfig(
    draft: UpdateMailSettingsInput,
  ): Promise<EffectiveMailConfig> {
    const saved = await this.findRow();
    const pass =
      draft.password ??
      (draft.clearPassword
        ? undefined
        : saved?.passwordEncrypted
          ? this.decryptOrWarn(saved.passwordEncrypted)
          : undefined);
    const user = draft.username?.trim();
    return {
      host: draft.host.trim(),
      port: draft.port,
      secure: draft.secure,
      auth: user && pass ? { user, pass } : null,
      fromName: draft.fromName.trim(),
      fromEmail: draft.fromEmail.trim().toLowerCase(),
      enabled: draft.enabled,
      source: 'DATABASE',
      version: this.version,
    };
  }

  private async recordTest(
    usingSaved: boolean,
    at: Date,
    ok: boolean,
  ): Promise<void> {
    if (!usingSaved) return;
    const row = await this.findRow();
    if (!row) return; // đang dùng env: không có dòng để ghi
    await this.prisma.mailSetting.update({
      where: { id: SETTINGS_ID },
      data: { lastTestedAt: at, lastTestOk: ok },
    });
  }

  private sanitizeSmtpError(
    error: unknown,
    config: EffectiveMailConfig,
  ): string {
    const raw = error instanceof Error ? error.message : 'Lỗi không xác định';
    const hidden = config.auth?.pass
      ? raw.split(config.auth.pass).join('***')
      : raw;
    return `Không gửi được mail thử: ${hidden.slice(0, 200)}`;
  }
}
