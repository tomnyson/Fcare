import { describe, expect, it } from 'vitest';
import {
  buildUpdatePayload,
  describeTestState,
  isAllowedTestRecipient,
  MAIL_PRESETS,
  toFormValues,
  validateMailSettings,
  type MailSettingsView,
} from './mail-settings';

const view: MailSettingsView = {
  host: 'localhost',
  port: 1025,
  secure: false,
  username: null,
  hasPassword: false,
  fromName: 'FCare',
  fromEmail: 'fcare-noreply@fpt.edu.vn',
  enabled: true,
  source: 'ENV',
  encryptionReady: true,
  externalDisabled: false,
  lastTestedAt: null,
  lastTestOk: null,
  updatedAt: null,
  updatedBy: null,
};

describe('toFormValues', () => {
  it('đổi số → chuỗi, null → rỗng, không mang mật khẩu', () => {
    expect(toFormValues(view)).toEqual({
      host: 'localhost',
      port: '1025',
      secure: false,
      username: '',
      password: '',
      clearPassword: false,
      fromName: 'FCare',
      fromEmail: 'fcare-noreply@fpt.edu.vn',
      enabled: true,
    });
  });
});

describe('validateMailSettings', () => {
  const ok = toFormValues(view);
  it('form từ view hợp lệ → không lỗi', () => {
    expect(validateMailSettings(ok, view)).toEqual({});
  });
  it('host rỗng, port không phải số 1..65535, fromEmail sai', () => {
    const errors = validateMailSettings({ ...ok, host: ' ', port: '99999', fromEmail: 'x' }, view);
    expect(Object.keys(errors).sort()).toEqual(['fromEmail', 'host', 'port']);
  });
  it('có username mà không có mật khẩu (mới lẫn đã lưu) → lỗi password', () => {
    expect(validateMailSettings({ ...ok, username: 'u' }, view)).toHaveProperty('password');
    expect(validateMailSettings({ ...ok, username: 'u' }, { ...view, hasPassword: true })).toEqual(
      {},
    );
    expect(
      validateMailSettings(
        { ...ok, username: 'u', clearPassword: true },
        { ...view, hasPassword: true },
      ),
    ).toHaveProperty('password');
  });
  it('nhập mật khẩu khi máy chủ chưa có khoá mã hoá → lỗi password', () => {
    expect(
      validateMailSettings(
        { ...ok, username: 'u', password: 'p' },
        { ...view, encryptionReady: false },
      ),
    ).toHaveProperty('password');
  });
});

describe('buildUpdatePayload', () => {
  it('port thành số, password rỗng bị bỏ, username rỗng → null', () => {
    const payload = buildUpdatePayload(toFormValues(view));
    expect(payload.port).toBe(1025);
    expect(payload).not.toHaveProperty('password');
    expect(payload.username).toBeNull();
    expect(payload.clearPassword).toBeUndefined();
  });
  it('clearPassword=true được gửi, password bị bỏ', () => {
    const payload = buildUpdatePayload({
      ...toFormValues(view),
      password: 'abc',
      clearPassword: true,
    });
    expect(payload.clearPassword).toBe(true);
    expect(payload).not.toHaveProperty('password');
  });
});

describe('MAIL_PRESETS', () => {
  it('có MailHog/Gmail/Office 365 với cổng chuẩn', () => {
    expect(MAIL_PRESETS.map((p) => [p.key, p.port, p.secure])).toEqual([
      ['mailhog', 1025, false],
      ['gmail', 465, true],
      ['office365', 587, false],
    ]);
  });
});

describe('isAllowedTestRecipient', () => {
  it('chỉ miền FPT/FE', () => {
    expect(isAllowedTestRecipient('a@fpt.edu.vn')).toBe(true);
    expect(isAllowedTestRecipient('A@FE.EDU.VN')).toBe(true);
    expect(isAllowedTestRecipient('a@gmail.com')).toBe(false);
  });
});

describe('describeTestState', () => {
  it('chưa thử / thành công / thất bại', () => {
    expect(describeTestState(view).tone).toBe('muted');
    expect(
      describeTestState({
        ...view,
        lastTestedAt: '2026-09-16T01:00:00Z',
        lastTestOk: true,
      }).tone,
    ).toBe('success');
    expect(
      describeTestState({
        ...view,
        lastTestedAt: '2026-09-16T01:00:00Z',
        lastTestOk: false,
      }).tone,
    ).toBe('danger');
  });
});
