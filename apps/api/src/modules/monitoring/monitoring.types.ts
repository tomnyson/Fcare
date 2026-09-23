import type { SystemErrorLevel, SystemErrorSource } from '@prisma/client';

/** Một lần lỗi đã bắt từ log (đã che PII), chờ gom nhóm và ghi DB. */
export interface CapturedError {
  level: SystemErrorLevel;
  source: SystemErrorSource;
  context: string | null;
  route: string | null;
  statusCode: number | null;
  message: string;
  stack: string | null;
  at: Date;
}

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

export interface UpdateMonitoringSettingsInput {
  webhookUrl?: string;
  clearWebhook?: boolean;
  enabled: boolean;
  retentionDays: number;
}

export interface EffectiveMonitoringConfig {
  enabled: boolean;
  webhookUrl: string | null;
  retentionDays: number;
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
