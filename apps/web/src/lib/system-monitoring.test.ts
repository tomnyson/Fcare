import { describe, expect, it } from 'vitest';
import {
  buildErrorGroupsQuery,
  buildMonitoringPayload,
  describeReportState,
  formatWeekRange,
  groupLocation,
  isDiscordWebhookUrl,
  parseMonitoringFilters,
  parseMonitoringTab,
  toMonitoringFormValues,
  validateMonitoringSettings,
  weekParamOf,
  type MonitoringSettingsView,
} from './system-monitoring';

const view: MonitoringSettingsView = {
  enabled: true,
  hasWebhook: false,
  webhookSource: null,
  retentionDays: 30,
  encryptionReady: true,
  lastReportAt: null,
  lastReportOk: null,
  updatedAt: null,
  updatedBy: null,
};

const HOOK = 'https://discord.com/api/webhooks/123/abc_DEF-x';

describe('parseMonitoringTab', () => {
  it('nhận tab settings khi truyền settings', () => {
    expect(parseMonitoringTab('settings')).toBe('settings');
  });

  it('mặc định là logs khi null hoặc giá trị khác', () => {
    expect(parseMonitoringTab(null)).toBe('logs');
    expect(parseMonitoringTab(undefined)).toBe('logs');
    expect(parseMonitoringTab('invalid')).toBe('logs');
    expect(parseMonitoringTab('logs')).toBe('logs');
  });
});

describe('parseMonitoringFilters', () => {
  it('đọc tuần, mức, trang hợp lệ', () => {
    const params = new URLSearchParams('week=2026-09-14&level=FATAL&page=3');
    expect(parseMonitoringFilters(params)).toEqual({ week: '2026-09-14', level: 'FATAL', page: 3 });
  });

  it('giá trị lạ bị bỏ, trang về 1', () => {
    const params = new URLSearchParams('week=14/09/2026&level=WARN&page=-2');
    expect(parseMonitoringFilters(params)).toEqual({ week: '', level: '', page: 1 });
  });
});

describe('buildErrorGroupsQuery', () => {
  it('chỉ gửi tham số có giá trị', () => {
    expect(buildErrorGroupsQuery({ week: '', level: '', page: 1 }, 20).toString()).toBe(
      'page=1&limit=20',
    );
    expect(
      buildErrorGroupsQuery({ week: '2026-09-14', level: 'ERROR', page: 2 }, 20).toString(),
    ).toBe('week=2026-09-14&level=ERROR&page=2&limit=20');
  });
});

describe('weekParamOf / formatWeekRange', () => {
  // Thứ Hai 21/09/2026 00:00 giờ VN
  const monday = '2026-09-20T17:00:00.000Z';

  it('đổi mốc UTC sang ngày VN', () => {
    expect(weekParamOf(monday)).toBe('2026-09-21');
  });

  it('hiện khoảng Thứ Hai – Chủ nhật theo giờ VN', () => {
    expect(formatWeekRange(monday)).toBe('21/09 – 27/09/2026');
  });

  it('tuần vắt năm vẫn đúng', () => {
    expect(formatWeekRange('2026-12-27T17:00:00.000Z')).toBe('28/12/2026 – 03/01/2027');
  });
});

describe('isDiscordWebhookUrl', () => {
  it.each([HOOK, 'https://ptb.discord.com/api/webhooks/1/t', 'https://discordapp.com/api/webhooks/1/t/'])(
    'nhận %s',
    (url) => expect(isDiscordWebhookUrl(url)).toBe(true),
  );

  it.each([
    'http://discord.com/api/webhooks/1/t',
    'https://discord.com.evil.io/api/webhooks/1/t',
    'https://discord.com:8443/api/webhooks/1/t',
    'https://discord.com/api/webhooks/abc/t',
    'không phải url',
  ])('từ chối %s', (url) => expect(isDiscordWebhookUrl(url)).toBe(false));
});

describe('validateMonitoringSettings', () => {
  const base = toMonitoringFormValues(view);

  it('mặc định hợp lệ', () => {
    expect(validateMonitoringSettings(base, view)).toEqual({});
  });

  it('webhook sai định dạng', () => {
    const errors = validateMonitoringSettings({ ...base, webhookUrl: 'https://evil.io/x' }, view);
    expect(errors.webhookUrl).toBeTruthy();
  });

  it('webhook đúng nhưng máy chủ chưa có khoá mã hoá', () => {
    const errors = validateMonitoringSettings(
      { ...base, webhookUrl: HOOK },
      { ...view, encryptionReady: false },
    );
    expect(errors.webhookUrl).toContain('SETTINGS_ENCRYPTION_KEY');
  });

  it.each(['6', '366', '12.5', 'abc', ''])('số ngày lưu %s bị từ chối', (retentionDays) => {
    expect(validateMonitoringSettings({ ...base, retentionDays }, view).retentionDays).toBeTruthy();
  });
});

describe('buildMonitoringPayload', () => {
  const base = toMonitoringFormValues({ ...view, retentionDays: 45 });

  it('không đổi webhook → không gửi trường webhook', () => {
    expect(buildMonitoringPayload(base)).toEqual({ enabled: true, retentionDays: 45 });
  });

  it('có URL mới → gửi URL đã trim', () => {
    expect(buildMonitoringPayload({ ...base, webhookUrl: `  ${HOOK} ` })).toEqual({
      enabled: true,
      retentionDays: 45,
      webhookUrl: HOOK,
    });
  });

  it('xoá webhook thắng URL mới', () => {
    expect(buildMonitoringPayload({ ...base, webhookUrl: HOOK, clearWebhook: true })).toEqual({
      enabled: true,
      retentionDays: 45,
      clearWebhook: true,
    });
  });
});

describe('describeReportState', () => {
  it('chưa gửi lần nào', () => {
    expect(describeReportState(view).tone).toBe('muted');
  });

  it('thành công / thất bại', () => {
    const at = '2026-09-21T01:00:00.000Z';
    expect(describeReportState({ ...view, lastReportAt: at, lastReportOk: true }).tone).toBe(
      'success',
    );
    expect(describeReportState({ ...view, lastReportAt: at, lastReportOk: false }).tone).toBe(
      'danger',
    );
  });
});

describe('groupLocation', () => {
  it('ưu tiên route → context → nhãn nguồn', () => {
    expect(groupLocation({ route: 'GET /api/x', context: 'Svc', source: 'HTTP' })).toBe(
      'GET /api/x',
    );
    expect(groupLocation({ route: null, context: 'Queue:backup', source: 'QUEUE' })).toBe(
      'Queue:backup',
    );
    expect(groupLocation({ route: null, context: null, source: 'PROCESS' })).toBe('Tiến trình');
  });
});
