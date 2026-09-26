/**
 * Logic thuần cho trang /admin/mail: chuyển đổi view ↔ form, validate phía client
 * (API vẫn validate lại), preset SMTP phổ biến. Không gọi mạng để test được bằng Vitest.
 */
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
  /** .env bật NOTIFICATIONS_EXTERNAL_DISABLED — API chặn mọi email và push. */
  externalDisabled: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  updatedAt: string | null;
  updatedBy: { id: string; fullName: string } | null;
}

export interface MailSettingsFormValues {
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  clearPassword: boolean;
  fromName: string;
  fromEmail: string;
  enabled: boolean;
}

export interface UpdateMailSettingsPayload {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password?: string;
  clearPassword?: boolean;
  fromName: string;
  fromEmail: string;
  enabled: boolean;
}

export interface SendTestMailPayload {
  to: string;
  draft?: UpdateMailSettingsPayload;
}

export interface SendTestMailResult {
  ok: true;
  sentAt: string;
  usingSaved: boolean;
}

export type MailPresetKey = 'mailhog' | 'gmail' | 'office365';

interface MailPreset {
  key: MailPresetKey;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  hint: string;
}

export type MailSettingsErrors = Partial<Record<keyof MailSettingsFormValues, string>>;

export type TestStateTone = 'muted' | 'success' | 'danger';

export const MAIL_PRESETS: readonly MailPreset[] = [
  {
    key: 'mailhog',
    label: 'MailHog (dev)',
    host: 'localhost',
    port: 1025,
    secure: false,
    hint: 'Hộp thư giả lập, xem tại http://localhost:8025',
  },
  {
    key: 'gmail',
    label: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    hint: 'Dùng "Mật khẩu ứng dụng", không dùng mật khẩu tài khoản',
  },
  {
    key: 'office365',
    label: 'Microsoft 365',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    hint: 'STARTTLS cổng 587; tài khoản phải bật SMTP AUTH',
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_DOMAINS: readonly string[] = ['fpt.edu.vn', 'fe.edu.vn'];
const MIN_PORT = 1;
const MAX_PORT = 65535;

export function toFormValues(view: MailSettingsView): MailSettingsFormValues {
  return {
    host: view.host,
    port: String(view.port),
    secure: view.secure,
    username: view.username ?? '',
    password: '',
    clearPassword: false,
    fromName: view.fromName,
    fromEmail: view.fromEmail,
    enabled: view.enabled,
  };
}

/** Áp preset lên form hiện tại — chỉ đụng host/port/secure, giữ tài khoản và người gửi. */
export function applyPreset(
  values: MailSettingsFormValues,
  preset: MailPreset,
): MailSettingsFormValues {
  return {
    ...values,
    host: preset.host,
    port: String(preset.port),
    secure: preset.secure,
  };
}

/** Preset đang khớp với host/port/secure trên form (nếu có) — để tô sáng nút. */
export function matchingPreset(
  values: Pick<MailSettingsFormValues, 'host' | 'port' | 'secure'>,
): MailPresetKey | null {
  const found = MAIL_PRESETS.find(
    (p) =>
      p.host === values.host.trim() && p.port === Number(values.port) && p.secure === values.secure,
  );
  return found?.key ?? null;
}

export function validateMailSettings(
  values: MailSettingsFormValues,
  view: Pick<MailSettingsView, 'hasPassword' | 'encryptionReady'>,
): MailSettingsErrors {
  const errors: MailSettingsErrors = {};
  if (!values.host.trim()) {
    errors.host = 'Nhập địa chỉ máy chủ SMTP.';
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    errors.port = `Cổng phải là số từ ${MIN_PORT} đến ${MAX_PORT}.`;
  }
  if (!values.fromName.trim()) {
    errors.fromName = 'Nhập tên người gửi.';
  }
  if (!EMAIL_RE.test(values.fromEmail.trim())) {
    errors.fromEmail = 'Email người gửi không hợp lệ.';
  }
  const hasUser = values.username.trim().length > 0;
  const willHavePassword =
    values.password.length > 0 || (view.hasPassword && !values.clearPassword);
  if (hasUser && !willHavePassword) {
    errors.password = 'Tài khoản SMTP cần mật khẩu.';
  }
  if (values.password.length > 0 && !view.encryptionReady) {
    errors.password =
      'Máy chủ chưa có SETTINGS_ENCRYPTION_KEY — liên hệ kỹ thuật trước khi lưu mật khẩu.';
  }
  return errors;
}

export function buildUpdatePayload(values: MailSettingsFormValues): UpdateMailSettingsPayload {
  const base: UpdateMailSettingsPayload = {
    host: values.host.trim(),
    port: Number(values.port),
    secure: values.secure,
    username: values.username.trim() || null,
    fromName: values.fromName.trim(),
    fromEmail: values.fromEmail.trim(),
    enabled: values.enabled,
  };
  if (values.clearPassword) {
    return { ...base, clearPassword: true };
  }
  return values.password ? { ...base, password: values.password } : base;
}

export function isAllowedTestRecipient(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return ALLOWED_DOMAINS.includes(domain);
}

export function describeTestState(view: MailSettingsView): {
  tone: TestStateTone;
  text: string;
} {
  if (!view.lastTestedAt) {
    return { tone: 'muted', text: 'Chưa gửi mail thử với cấu hình đã lưu.' };
  }
  const when = new Date(view.lastTestedAt).toLocaleString('vi-VN');
  return view.lastTestOk
    ? { tone: 'success', text: `Gửi thử thành công lúc ${when}.` }
    : {
        tone: 'danger',
        text: `Gửi thử thất bại lúc ${when} — kiểm tra lại máy chủ/tài khoản.`,
      };
}
