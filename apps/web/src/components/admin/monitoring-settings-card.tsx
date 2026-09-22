'use client';

import { Badge, Button, SurfaceCard } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import {
  buildMonitoringPayload,
  describeReportState,
  formatWeekRange,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  toMonitoringFormValues,
  validateMonitoringSettings,
  type MonitoringFormErrors,
  type MonitoringFormValues,
  type MonitoringSettingsView,
  type UpdateMonitoringPayload,
  type WeeklyReportResult,
} from '../../lib/system-monitoring';
import { FormError, FormSuccess, Input, Label } from '../ui/form';

export const MONITORING_SETTINGS_KEY = ['admin', 'monitoring', 'settings'] as const;

const CHECKBOX_CLASSES =
  'h-4 w-4 shrink-0 rounded border-border accent-fpt-orange ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange';

const TONE_TEXT: Record<'muted' | 'success' | 'danger', string> = {
  muted: 'text-muted',
  success: 'text-success',
  danger: 'text-danger',
};

const TONE_DOT: Record<'muted' | 'success' | 'danger', string> = {
  muted: 'bg-border',
  success: 'bg-success',
  danger: 'bg-danger',
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function FieldError({ id, children }: { id: string; children?: string }) {
  return children ? (
    <p id={id} className="mt-1 text-xs text-danger">
      {children}
    </p>
  ) : null;
}

function webhookPlaceholder(view: MonitoringSettingsView): string {
  if (view.webhookSource === 'DATABASE') return '•••••••• (đã lưu — bỏ trống để giữ)';
  if (view.webhookSource === 'ENV') return 'Đang dùng DISCORD_WEBHOOK_URL — dán URL để ghi đè';
  return 'https://discord.com/api/webhooks/…';
}

/**
 * Cấu hình báo cáo lỗi hằng tuần lên Discord + hai hành động gửi ngay.
 * Webhook là bí mật: API chỉ trả `webhookSource`, không bao giờ trả URL.
 */
export function MonitoringSettingsCard({ view }: { view: MonitoringSettingsView }) {
  const queryClient = useQueryClient();
  const [values, setValuesState] = useState<MonitoringFormValues>(() =>
    toMonitoringFormValues(view),
  );
  const [errors, setErrors] = useState<MonitoringFormErrors>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const report = describeReportState(view);

  function setValues(patch: Partial<MonitoringFormValues>) {
    setValuesState({ ...values, ...patch });
    setNotice(null);
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: MONITORING_SETTINGS_KEY });

  const saveMutation = useMutation({
    mutationFn: (payload: UpdateMonitoringPayload) =>
      apiFetch<MonitoringSettingsView>('/admin/monitoring/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: async (next) => {
      setValuesState(toMonitoringFormValues(next));
      setErrors({});
      setNotice({ ok: true, text: 'Đã lưu cấu hình giám sát.' });
      await invalidate();
    },
    onError: (err) => setNotice({ ok: false, text: errorMessage(err, 'Không lưu được cấu hình.') }),
  });

  const testMutation = useMutation({
    mutationFn: (webhookUrl?: string) =>
      apiFetch<{ sent: true }>('/admin/monitoring/test', {
        method: 'POST',
        body: JSON.stringify(webhookUrl ? { webhookUrl } : {}),
      }),
    onSuccess: () => setNotice({ ok: true, text: 'Đã gửi tin nhắn thử — kiểm tra kênh Discord.' }),
    onError: (err) => setNotice({ ok: false, text: errorMessage(err, 'Gửi thử thất bại.') }),
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      apiFetch<WeeklyReportResult>('/admin/monitoring/report', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: async (result) => {
      setNotice({
        ok: true,
        text: `Đã gửi báo cáo tuần ${formatWeekRange(result.weekStart)}: ${result.totalEvents} lần lỗi, ${result.groupCount} nhóm.`,
      });
      await invalidate();
    },
    onError: (err) => setNotice({ ok: false, text: errorMessage(err, 'Gửi báo cáo thất bại.') }),
  });

  const busy = saveMutation.isPending || testMutation.isPending || reportMutation.isPending;
  const draftUrl = values.clearWebhook ? '' : values.webhookUrl.trim();
  const canSend = view.hasWebhook || draftUrl.length > 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validateMonitoringSettings(values, view);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saveMutation.mutate(buildMonitoringPayload(values));
  }

  function onTest() {
    const next = validateMonitoringSettings(values, { encryptionReady: true });
    if (next.webhookUrl) {
      setErrors(next);
      return;
    }
    testMutation.mutate(draftUrl || undefined);
  }

  return (
    <SurfaceCard className="space-y-6 p-6" aria-labelledby="monitoring-settings-heading">
      <div className="space-y-3">
        <h2
          id="monitoring-settings-heading"
          className="font-display text-lg font-semibold text-fpt-blue-900"
        >
          Báo cáo Discord
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={view.enabled ? 'success' : 'warning'}>
            {view.enabled ? 'Gửi mỗi thứ Hai 08:00' : 'Đã tắt báo cáo tuần'}
          </Badge>
          <Badge tone={view.hasWebhook ? 'info' : 'neutral'}>
            {view.webhookSource === 'DATABASE'
              ? 'Webhook lưu trong hệ thống'
              : view.webhookSource === 'ENV'
                ? 'Webhook từ biến môi trường'
                : 'Chưa có webhook'}
          </Badge>
          {!view.encryptionReady ? <Badge tone="danger">Thiếu khoá mã hoá</Badge> : null}
        </div>
        <p className={`flex items-start gap-2 text-sm ${TONE_TEXT[report.tone]}`}>
          <span
            aria-hidden="true"
            className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${TONE_DOT[report.tone]}`}
          />
          <span>{report.text}</span>
        </p>
      </div>

      {notice ? (
        notice.ok ? (
          <FormSuccess>{notice.text}</FormSuccess>
        ) : (
          <FormError>{notice.text}</FormError>
        )
      ) : null}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <Label htmlFor="monitoring-webhook">URL webhook Discord</Label>
          <Input
            id="monitoring-webhook"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={webhookPlaceholder(view)}
            value={values.webhookUrl}
            disabled={values.clearWebhook}
            onChange={(e) => setValues({ webhookUrl: e.target.value })}
            aria-invalid={Boolean(errors.webhookUrl)}
            aria-describedby={errors.webhookUrl ? 'monitoring-webhook-error' : 'monitoring-webhook-hint'}
          />
          <FieldError id="monitoring-webhook-error">{errors.webhookUrl}</FieldError>
          {!errors.webhookUrl ? (
            <p id="monitoring-webhook-hint" className="mt-1 text-xs text-muted">
              Discord → Cài đặt kênh → Tích hợp → Webhook. URL được mã hoá khi lưu.
            </p>
          ) : null}
          {view.webhookSource === 'DATABASE' ? (
            <label className="mt-2 flex min-h-8 items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                className={CHECKBOX_CLASSES}
                checked={values.clearWebhook}
                onChange={(e) => setValues({ clearWebhook: e.target.checked, webhookUrl: '' })}
              />
              Xoá webhook đã lưu (quay về biến môi trường nếu có)
            </label>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:items-end">
          <div>
            <Label htmlFor="monitoring-retention">Giữ log lỗi (ngày)</Label>
            <Input
              id="monitoring-retention"
              inputMode="numeric"
              className="tabular-nums"
              value={values.retentionDays}
              onChange={(e) => setValues({ retentionDays: e.target.value })}
              aria-invalid={Boolean(errors.retentionDays)}
              aria-describedby={
                errors.retentionDays
                  ? "monitoring-retention-error monitoring-retention-hint"
                  : "monitoring-retention-hint"
              }
            />
          </div>
          <p id="monitoring-retention-hint" className="pb-2.5 text-xs text-muted">
            {MIN_RETENTION_DAYS}–{MAX_RETENTION_DAYS} ngày. Nhóm lỗi không tái diễn quá hạn này bị
            dọn tự động lúc 03:00 hằng ngày.
          </p>
        </div>
        <FieldError id="monitoring-retention-error">{errors.retentionDays}</FieldError>

        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className={CHECKBOX_CLASSES}
            checked={values.enabled}
            onChange={(e) => setValues({ enabled: e.target.checked })}
          />
          <span>
            Gửi báo cáo tuần tự động
            <span className="block text-xs text-muted">
              Tuần không có lỗi vẫn gửi “✅ Không có lỗi” để biết hệ thống còn sống.
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:flex-wrap sm:items-center">
          <Button type="submit" disabled={busy} className="sm:min-w-36">
            {saveMutation.isPending ? 'Đang lưu…' : 'Lưu cấu hình'}
          </Button>
          <Button type="button" variant="ghost" disabled={busy || !canSend} onClick={onTest}>
            {testMutation.isPending ? 'Đang gửi…' : 'Gửi thử'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !view.hasWebhook}
            title={view.hasWebhook ? undefined : 'Lưu webhook trước khi gửi báo cáo'}
            onClick={() => reportMutation.mutate()}
          >
            {reportMutation.isPending ? 'Đang gửi…' : 'Gửi báo cáo tuần này'}
          </Button>
        </div>
      </form>
    </SurfaceCard>
  );
}
