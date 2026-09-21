import Bugsnag, { type Event } from '@bugsnag/js';
import BugsnagPerformance from '@bugsnag/browser-performance';
import BugsnagPluginReact, { type BugsnagErrorBoundary } from '@bugsnag/plugin-react';
import React from 'react';
import { scrubBreadcrumb, scrubUrl, scrubUrlsInText } from './scrub';

const API_KEY = process.env.NEXT_PUBLIC_BUGSNAG_API_KEY ?? '';
const RELEASE_STAGE =
  process.env.NEXT_PUBLIC_BUGSNAG_RELEASE_STAGE ?? process.env.NODE_ENV ?? 'development';
// Performance SDK kêu nếu appVersion = undefined nên chỉ truyền khi có.
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION
  ? { appVersion: process.env.NEXT_PUBLIC_APP_VERSION }
  : {};
// Dev/test không gửi gì — muốn thử ở máy thì đặt NEXT_PUBLIC_BUGSNAG_RELEASE_STAGE=staging.
const ENABLED_RELEASE_STAGES = ['production', 'staging'];
// Khoá metadata có thể mang PII hoặc bí mật — Bugsnag thay giá trị bằng [REDACTED].
const REDACTED_KEYS = [/pass/i, /token/i, /secret/i, /email/i, /phone/i, /cccd|cmnd/i, /address/i];

let started = false;

function scrubEvent(event: Event): void {
  const { id } = event.getUser();
  event.setUser(id); // chỉ staff.id, không tên/email
  event.request.url = scrubUrl(event.request.url ?? null) ?? undefined;
  if (event.context) event.context = scrubUrlsInText(event.context);
}

/** Bật Bugsnag đúng một lần phía trình duyệt; thiếu API key → không làm gì. */
export function startMonitoring(): boolean {
  if (started) return true;
  if (!API_KEY || typeof window === 'undefined') return false;
  Bugsnag.start({
    apiKey: API_KEY,
    releaseStage: RELEASE_STAGE,
    enabledReleaseStages: ENABLED_RELEASE_STAGES,
    ...VERSION,
    plugins: [new BugsnagPluginReact()],
    collectUserIp: false,
    generateAnonymousId: false,
    redactedKeys: REDACTED_KEYS,
    onBreadcrumb: scrubBreadcrumb,
    onError: scrubEvent,
  });
  BugsnagPerformance.start({
    apiKey: API_KEY,
    releaseStage: RELEASE_STAGE,
    enabledReleaseStages: ENABLED_RELEASE_STAGES,
    ...VERSION,
    generateAnonymousId: false,
    sendPageAttributes: { url: false, title: false, referrer: false },
    networkRequestCallback: (info) => ({ ...info, url: scrubUrl(info.url) }),
  });
  started = true;
  return true;
}

export function getErrorBoundary(): BugsnagErrorBoundary | null {
  if (!started) return null;
  return Bugsnag.getPlugin('react')?.createErrorBoundary(React) ?? null;
}

/** Gắn lỗi với cán bộ — định danh duy nhất gửi đi là staff.id. */
export function setMonitoringUser(staffId: string | undefined): void {
  if (!started) return;
  Bugsnag.setUser(staffId);
}
