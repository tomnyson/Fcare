export interface EffectiveMailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string } | null;
  fromName: string;
  fromEmail: string;
  enabled: boolean;
  source: 'DATABASE' | 'ENV';
  /** Gốc link trong email (DB → WEB_BASE_URL → WEB_ORIGIN), không có `/` cuối. */
  publicWebUrl: string;
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
  /** Địa chỉ web ADMIN đặt (null = dùng biến môi trường). */
  publicWebUrl: string | null;
  /** Giá trị dự phòng từ biến môi trường — hiển thị để ADMIN biết đang dùng gì. */
  envPublicWebUrl: string;
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
  /** Chuỗi rỗng/null → xoá, quay về biến môi trường. */
  publicWebUrl?: string | null;
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
