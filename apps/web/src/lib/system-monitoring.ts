/**
 * Logic thuần cho trang /admin/monitoring (giám sát lỗi hệ thống): kiểu dữ liệu
 * API, đọc bộ lọc từ URL, validate form cấu hình (API vẫn validate lại), định
 * dạng tuần theo giờ VN. Không gọi mạng để test được bằng Vitest.
 *
 * Đặt tên `system-monitoring` để không lẫn với `lib/monitoring/` (Bugsnag phía web).
 */
import { parsePageParam } from './pagination';

export type SystemErrorLevel = 'ERROR' | 'FATAL';
export type SystemErrorSource = 'HTTP' | 'QUEUE' | 'PROCESS' | 'APP';

export interface MonitoringSettingsView {
  enabled: boolean;
  hasWebhook: boolean;
  webhookSource: 'DATABASE' | 'ENV' | null;
  retentionDays: number;
  encryptionReady: boolean;
  lastReportAt: string | null;
  lastReportOk: boolean | null;
  updatedAt: string | null;
  updatedBy: { id: string; fullName: string } | null;
}

export interface ErrorGroupView {
  id: string;
  weekStart: string;
  level: SystemErrorLevel;
  source: SystemErrorSource;
  context: string | null;
  route: string | null;
  statusCode: number | null;
  message: string;
  stack: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface WeekSummary {
  weekStart: string;
  groupCount: number;
  totalEvents: number;
}

export interface WeeklyReportResult {
  sent: boolean;
  reason?: 'DISABLED' | 'NO_WEBHOOK';
  weekStart: string;
  totalEvents: number;
  groupCount: number;
}

export type MonitoringTab = 'logs' | 'settings';

export function parseMonitoringTab(value: string | null | undefined): MonitoringTab {
  return value === 'settings' ? 'settings' : 'logs';
}

export interface MonitoringFilters {
  /** `YYYY-MM-DD` (Thứ Hai, giờ VN) hoặc '' = mọi tuần còn lưu. */
  week: string;
  level: SystemErrorLevel | '';
  page: number;
}

export interface MonitoringFormValues {
  webhookUrl: string;
  clearWebhook: boolean;
  enabled: boolean;
  retentionDays: string;
}

export interface UpdateMonitoringPayload {
  enabled: boolean;
  retentionDays: number;
  webhookUrl?: string;
  clearWebhook?: true;
}

export type MonitoringFormErrors = Partial<Record<keyof MonitoringFormValues, string>>;

export const ERROR_GROUPS_PAGE_SIZE = 20;
export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 365;

export const LEVEL_LABEL: Record<SystemErrorLevel, string> = {
  ERROR: 'Lỗi',
  FATAL: 'Nghiêm trọng',
};

export const SOURCE_LABEL: Record<SystemErrorSource, string> = {
  HTTP: 'HTTP',
  QUEUE: 'Hàng đợi',
  PROCESS: 'Tiến trình',
  APP: 'Ứng dụng',
};

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEVELS: readonly SystemErrorLevel[] = ['ERROR', 'FATAL'];
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseMonitoringFilters(params: URLSearchParams): MonitoringFilters {
  const week = params.get('week') ?? '';
  const level = params.get('level') ?? '';
  return {
    week: WEEK_RE.test(week) ? week : '',
    level: (LEVELS as readonly string[]).includes(level) ? (level as SystemErrorLevel) : '',
    page: parsePageParam(params.get('page')),
  };
}

export function buildErrorGroupsQuery(filters: MonitoringFilters, limit: number): URLSearchParams {
  const query = new URLSearchParams();
  if (filters.week) query.set('week', filters.week);
  if (filters.level) query.set('level', filters.level);
  query.set('page', String(filters.page));
  query.set('limit', String(limit));
  return query;
}

/** Ngày lịch VN của một mốc UTC, dạng [năm, tháng, ngày] chuỗi 0-padded. */
function vnParts(time: number): [string, string, string] {
  const [year, month, day] = new Date(time + VN_OFFSET_MS).toISOString().slice(0, 10).split('-');
  return [year, month, day];
}

/** Mốc đầu tuần (ISO, UTC) → tham số URL `YYYY-MM-DD` theo lịch VN. */
export function weekParamOf(weekStartIso: string): string {
  return vnParts(Date.parse(weekStartIso)).join('-');
}

/** "21/09 – 27/09/2026"; tuần vắt năm ghi đủ năm cả hai đầu. */
export function formatWeekRange(weekStartIso: string): string {
  const start = Date.parse(weekStartIso);
  const [y1, m1, d1] = vnParts(start);
  const [y2, m2, d2] = vnParts(start + 6 * DAY_MS);
  const head = y1 === y2 ? `${d1}/${m1}` : `${d1}/${m1}/${y1}`;
  return `${head} – ${d2}/${m2}/${y2}`;
}

/** Cùng luật với API (chặn SSRF): https, host Discord chính thức, không port/user-info. */
export function isDiscordWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    /^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/.test(url.hostname) &&
    /^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname)
  );
}

export function toMonitoringFormValues(view: MonitoringSettingsView): MonitoringFormValues {
  return {
    webhookUrl: '',
    clearWebhook: false,
    enabled: view.enabled,
    retentionDays: String(view.retentionDays),
  };
}

export function validateMonitoringSettings(
  values: MonitoringFormValues,
  view: Pick<MonitoringSettingsView, 'encryptionReady'>,
): MonitoringFormErrors {
  const errors: MonitoringFormErrors = {};
  const url = values.webhookUrl.trim();
  if (url && !values.clearWebhook) {
    if (!isDiscordWebhookUrl(url)) {
      errors.webhookUrl = 'URL phải có dạng https://discord.com/api/webhooks/<id>/<token>.';
    } else if (!view.encryptionReady) {
      errors.webhookUrl =
        'Máy chủ chưa có SETTINGS_ENCRYPTION_KEY — liên hệ kỹ thuật trước khi lưu webhook.';
    }
  }
  const days = Number(values.retentionDays);
  if (
    values.retentionDays.trim() === '' ||
    !Number.isInteger(days) ||
    days < MIN_RETENTION_DAYS ||
    days > MAX_RETENTION_DAYS
  ) {
    errors.retentionDays = `Số ngày lưu phải là số nguyên từ ${MIN_RETENTION_DAYS} đến ${MAX_RETENTION_DAYS}.`;
  }
  return errors;
}

export function buildMonitoringPayload(values: MonitoringFormValues): UpdateMonitoringPayload {
  const base: UpdateMonitoringPayload = {
    enabled: values.enabled,
    retentionDays: Number(values.retentionDays),
  };
  if (values.clearWebhook) return { ...base, clearWebhook: true };
  const url = values.webhookUrl.trim();
  return url ? { ...base, webhookUrl: url } : base;
}

export function describeReportState(view: MonitoringSettingsView): {
  tone: 'muted' | 'success' | 'danger';
  text: string;
} {
  if (!view.lastReportAt) {
    return { tone: 'muted', text: 'Chưa gửi báo cáo nào lên Discord.' };
  }
  const when = new Date(view.lastReportAt).toLocaleString('vi-VN');
  return view.lastReportOk
    ? { tone: 'success', text: `Báo cáo gần nhất gửi thành công lúc ${when}.` }
    : { tone: 'danger', text: `Báo cáo lúc ${when} thất bại — kiểm tra lại webhook.` };
}

/** Nơi xảy ra lỗi để hiện ở cột đầu bảng. */
export function groupLocation(
  group: Pick<ErrorGroupView, 'route' | 'context' | 'source'>,
): string {
  return group.route ?? group.context ?? SOURCE_LABEL[group.source];
}
