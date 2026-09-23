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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <SurfaceCard className="space-y-6 p-6 sm:p-8" aria-labelledby="monitoring-settings-heading">
        <div className="border-b border-border pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="monitoring-settings-heading"
                className="font-display text-xl font-bold text-fpt-blue-900"
              >
                Cấu hình thông báo & Báo cáo
              </h2>
              <p className="mt-1 text-sm text-muted">
                Thiết lập kênh Discord nhận tổng hợp lỗi máy chủ tự động mỗi sáng thứ Hai lúc 08:00.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={view.enabled ? 'success' : 'warning'}>
                {view.enabled ? 'Đang bật báo cáo tuần' : 'Đã tắt báo cáo tuần'}
              </Badge>
              <Badge tone={view.hasWebhook ? 'info' : 'neutral'}>
                {view.webhookSource === 'DATABASE'
                  ? 'Webhook tùy chỉnh'
                  : view.webhookSource === 'ENV'
                    ? 'Webhook từ ENV'
                    : 'Chưa có Webhook'}
              </Badge>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-surface px-3.5 py-2.5 text-sm">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[report.tone]}`}
            />
            <span className={`font-medium ${TONE_TEXT[report.tone]}`}>{report.text}</span>
          </div>
        </div>

        {notice ? (
          notice.ok ? (
            <FormSuccess>{notice.text}</FormSuccess>
          ) : (
            <FormError>{notice.text}</FormError>
          )
        ) : null}

        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <div className="space-y-2">
            <Label htmlFor="monitoring-webhook" className="text-sm font-semibold text-ink">
              URL Webhook Discord
            </Label>
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
              className="font-mono text-sm"
            />
            <FieldError id="monitoring-webhook-error">{errors.webhookUrl}</FieldError>
            {!errors.webhookUrl ? (
              <p id="monitoring-webhook-hint" className="text-xs text-muted">
                URL bắt đầu bằng <code className="font-semibold text-ink">https://discord.com/api/webhooks/…</code>. Giá trị được mã hoá an toàn trước khi lưu trữ.
              </p>
            ) : null}
            {view.webhookSource === 'DATABASE' ? (
              <label className="mt-2.5 flex min-h-8 items-center gap-2 text-xs font-medium text-muted hover:text-ink cursor-pointer">
                <input
                  type="checkbox"
                  className={CHECKBOX_CLASSES}
                  checked={values.clearWebhook}
                  onChange={(e) => setValues({ clearWebhook: e.target.checked, webhookUrl: '' })}
                />
                Xoá webhook đã lưu trong CSDL (sử dụng biến môi trường DISCORD_WEBHOOK_URL nếu có)
              </label>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-end border-t border-border pt-5">
            <div>
              <Label htmlFor="monitoring-retention" className="text-sm font-semibold text-ink">
                Thời gian giữ log (ngày)
              </Label>
              <Input
                id="monitoring-retention"
                inputMode="numeric"
                className="tabular-nums font-semibold"
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
              Tối thiểu {MIN_RETENTION_DAYS} ngày, tối đa {MAX_RETENTION_DAYS} ngày. Nhóm lỗi không tái diễn quá hạn này sẽ tự động được dọn lúc 03:00 hằng ngày.
            </p>
          </div>
          <FieldError id="monitoring-retention-error">{errors.retentionDays}</FieldError>

          <div className="border-t border-border pt-5">
            <label className="flex items-start gap-3 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                className={`mt-0.5 ${CHECKBOX_CLASSES}`}
                checked={values.enabled}
                onChange={(e) => setValues({ enabled: e.target.checked })}
              />
              <div>
                <span className="font-semibold text-ink">Gửi báo cáo tuần tự động</span>
                <span className="block text-xs text-muted mt-0.5">
                  Tự động tổng hợp và gửi vào kênh Discord lúc 08:00 sáng thứ Hai. Tuần không có lỗi vẫn gửi thông báo để xác nhận hệ thống vận hành bình thường.
                </span>
              </div>
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:flex-wrap sm:items-center">
            <Button type="submit" disabled={busy} className="sm:min-w-40 font-semibold">
              {saveMutation.isPending ? 'Đang lưu…' : 'Lưu cấu hình'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || !canSend}
              onClick={onTest}
              className="border border-border"
            >
              {testMutation.isPending ? 'Đang gửi thử…' : 'Gửi tin nhắn thử'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || !view.hasWebhook}
              title={view.hasWebhook ? undefined : 'Lưu webhook trước khi gửi báo cáo'}
              onClick={() => reportMutation.mutate()}
              className="border border-border"
            >
              {reportMutation.isPending ? 'Đang gửi báo cáo…' : 'Gửi báo cáo ngay'}
            </Button>
          </div>
        </form>
      </SurfaceCard>

      <div className="space-y-6">
        <SurfaceCard className="p-6 space-y-4">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted">
            Trạng thái vận hành
          </h3>
          <dl className="space-y-3 text-xs divide-y divide-border">
            <div className="flex items-center justify-between pt-2">
              <dt className="text-muted">Mã hoá bảo mật (AES)</dt>
              <dd>
                {view.encryptionReady ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    Sẵn sàng
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-danger">
                    <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                    Chưa có khoá
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between pt-3">
              <dt className="text-muted">Lịch báo cáo tuần</dt>
              <dd className="font-semibold text-ink">Thứ Hai · 08:00 (GMT+7)</dd>
            </div>
            <div className="flex items-center justify-between pt-3">
              <dt className="text-muted">Lịch dọn log quá hạn</dt>
              <dd className="font-semibold text-ink">Hằng ngày · 03:00</dd>
            </div>
            <div className="flex items-center justify-between pt-3">
              <dt className="text-muted">Báo cáo gần nhất</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {view.lastReportAt
                  ? `${new Date(view.lastReportAt).toLocaleDateString('vi-VN')} (${view.lastReportOk ? 'Thành công' : 'Lỗi'})`
                  : 'Chưa gửi'}
              </dd>
            </div>
            {view.updatedBy ? (
              <div className="flex items-center justify-between pt-3">
                <dt className="text-muted">Cập nhật lần cuối</dt>
                <dd className="font-semibold text-ink truncate max-w-[10rem]">
                  {view.updatedBy.fullName}
                </dd>
              </div>
            ) : null}
          </dl>
        </SurfaceCard>

        <SurfaceCard className="p-6 space-y-3 bg-fpt-blue-900/[0.02]">
          <h3 className="font-display text-sm font-bold text-fpt-blue-900 flex items-center gap-2">
            <span>💡</span>
            <span>Hướng dẫn lấy Discord Webhook</span>
          </h3>
          <ol className="space-y-2 text-xs text-muted leading-relaxed list-decimal list-inside">
            <li>
              Mở ứng dụng Discord, vào phần <strong className="text-ink">Cài đặt kênh (Channel Settings)</strong>.
            </li>
            <li>
              Chọn mục <strong className="text-ink">Tích hợp (Integrations)</strong> → <strong className="text-ink">Webhooks</strong>.
            </li>
            <li>
              Nhấn <strong className="text-ink">Tạo Webhook mới</strong>, đặt tên (ví dụ: FCare Bot).
            </li>
            <li>
              Nhấn <strong className="text-ink">Sao chép URL Webhook</strong> và dán vào ô cấu hình ở đây.
            </li>
          </ol>
        </SurfaceCard>
      </div>
    </div>
  );
}
