export interface EffectiveMailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string } | null;
  fromName: string;
  fromEmail: string;
  enabled: boolean;
  source: 'DATABASE' | 'ENV';
  version: number;
}

export interface MailSettingsView {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  enabled: boolean;
  source: 'DATABASE' | 'ENV';
  encryptionReady: boolean;
  /** true khi .env bật NOTIFICATIONS_EXTERNAL_DISABLED — mọi mail/push bị chặn. */
  externalDisabled: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  updatedAt: string | null;
  updatedBy: { id: string; fullName: string } | null;
}

export interface UpdateMailSettingsInput {
  host: string;
  port: number;
  secure: boolean;
  username?: string | null;
  password?: string;
  clearPassword?: boolean;
  fromName: string;
  fromEmail: string;
  enabled: boolean;
}

export interface SendTestMailInput {
  to: string;
  /** Cấu hình đang nhập trên form, chưa lưu — nếu có thì dùng thay cho cấu hình đã lưu. */
  draft?: UpdateMailSettingsInput;
}

export interface SendTestMailResult {
  ok: true;
  sentAt: string;
  usingSaved: boolean;
}
