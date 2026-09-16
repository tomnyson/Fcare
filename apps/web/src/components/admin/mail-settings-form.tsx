'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import {
  applyPreset,
  buildUpdatePayload,
  MAIL_PRESETS,
  matchingPreset,
  toFormValues,
  validateMailSettings,
  type MailPresetKey,
  type MailSettingsErrors,
  type MailSettingsFormValues,
  type MailSettingsView,
  type UpdateMailSettingsPayload,
} from '../../lib/mail-settings';
import { FormError, Input, Label } from '../ui/form';

interface MailSettingsFormProps {
  view: MailSettingsView;
  /** Báo lên trang mỗi lần giá trị đổi để panel "Gửi thử" dùng bản nháp. */
  onValuesChange: (values: MailSettingsFormValues) => void;
  /** Lưu xong — trang giữ thông báo vì form sẽ được mount lại theo `updatedAt`. */
  onSaved: () => void;
}

const CHECKBOX_CLASSES =
  'h-4 w-4 shrink-0 rounded border-border accent-fpt-orange ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange';

const PRESET_BASE_CLASSES =
  'rounded-full border px-3.5 py-1.5 text-xs font-semibold ' +
  'transition-colors duration-[var(--duration-fast)] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange';

const PRESET_STATE_CLASSES: Record<'on' | 'off', string> = {
  on: 'border-fpt-orange bg-fpt-orange-50 text-fpt-orange-600',
  off: 'border-border bg-white text-ink hover:border-fpt-orange/50 hover:bg-fpt-orange-50/60',
};

function Fieldset({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      <div>
        <legend className="text-xs font-semibold tracking-wide text-muted uppercase">{legend}</legend>
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}

function FieldError({ children }: { children?: string }) {
  return children ? <p className="mt-1 text-xs text-danger">{children}</p> : null;
}

export function MailSettingsForm({ view, onValuesChange, onSaved }: MailSettingsFormProps) {
  const queryClient = useQueryClient();
  const [values, setValuesState] = useState<MailSettingsFormValues>(() => toFormValues(view));
  const [errors, setErrors] = useState<MailSettingsErrors>({});
  const [serverError, setServerError] = useState('');
  const activePreset = matchingPreset(values);

  function commit(next: MailSettingsFormValues) {
    setValuesState(next);
    onValuesChange(next);
  }

  function setValues(patch: Partial<MailSettingsFormValues>) {
    commit({ ...values, ...patch });
  }

  function choosePreset(key: MailPresetKey) {
    const preset = MAIL_PRESETS.find((p) => p.key === key);
    if (preset) commit(applyPreset(values, preset));
  }

  const saveMutation = useMutation({
    mutationFn: (payload: UpdateMailSettingsPayload) =>
      apiFetch<MailSettingsView>('/admin/mail-settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: async (next) => {
      setServerError('');
      setErrors({});
      const fresh = toFormValues(next);
      setValuesState(fresh);
      onValuesChange(fresh);
      onSaved();
      await queryClient.invalidateQueries({ queryKey: ['admin', 'mail-settings'] });
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra khi lưu cấu hình.');
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateMailSettings(values, view);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    saveMutation.mutate(buildUpdatePayload(values));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" aria-labelledby="mail-form-heading" noValidate>
      <div className="space-y-3">
        <h2 id="mail-form-heading" className="font-display text-lg font-semibold text-fpt-blue-900">
          Máy chủ gửi mail
        </h2>
        <FormError>{serverError}</FormError>
      </div>

      <Fieldset legend="Máy chủ SMTP" hint="Chọn mẫu nhanh hoặc nhập tay. Mẫu chỉ điền máy chủ, cổng và TLS.">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mẫu cấu hình nhanh">
          {MAIL_PRESETS.map((preset) => {
            const active = preset.key === activePreset;
            return (
              <button
                key={preset.key}
                type="button"
                aria-pressed={active}
                title={preset.hint}
                onClick={() => choosePreset(preset.key)}
                className={`${PRESET_BASE_CLASSES} ${PRESET_STATE_CLASSES[active ? 'on' : 'off']}`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
          <div>
            <Label htmlFor="mail-host">Máy chủ SMTP</Label>
            <Input
              id="mail-host"
              autoComplete="off"
              spellCheck={false}
              value={values.host}
              onChange={(e) => setValues({ host: e.target.value })}
              aria-invalid={Boolean(errors.host)}
              aria-describedby={errors.host ? 'mail-host-error' : undefined}
            />
            <span id="mail-host-error">
              <FieldError>{errors.host}</FieldError>
            </span>
          </div>
          <div>
            <Label htmlFor="mail-port">Cổng</Label>
            <Input
              id="mail-port"
              inputMode="numeric"
              className="tabular-nums"
              value={values.port}
              onChange={(e) => setValues({ port: e.target.value })}
              aria-invalid={Boolean(errors.port)}
              aria-describedby={errors.port ? 'mail-port-error' : undefined}
            />
            <span id="mail-port-error">
              <FieldError>{errors.port}</FieldError>
            </span>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink md:mt-7">
            <input
              type="checkbox"
              className={CHECKBOX_CLASSES}
              checked={values.secure}
              onChange={(e) => setValues({ secure: e.target.checked })}
            />
            TLS ngầm (465)
          </label>
        </div>
      </Fieldset>

      <Fieldset
        legend="Xác thực"
        hint="Bỏ trống tài khoản nếu máy chủ không cần đăng nhập (ví dụ MailHog)."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="mail-username">Tài khoản SMTP</Label>
            <Input
              id="mail-username"
              autoComplete="off"
              spellCheck={false}
              value={values.username}
              onChange={(e) => setValues({ username: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="mail-password">Mật khẩu SMTP</Label>
            <Input
              id="mail-password"
              type="password"
              autoComplete="new-password"
              placeholder={
                view.hasPassword ? '•••••••• (đã lưu — bỏ trống để giữ)' : 'Chưa có mật khẩu'
              }
              value={values.password}
              disabled={values.clearPassword}
              onChange={(e) => setValues({ password: e.target.value })}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'mail-password-error' : undefined}
            />
            <span id="mail-password-error">
              <FieldError>{errors.password}</FieldError>
            </span>
            {view.hasPassword ? (
              <label className="mt-2 flex min-h-8 items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  className={CHECKBOX_CLASSES}
                  checked={values.clearPassword}
                  onChange={(e) => setValues({ clearPassword: e.target.checked, password: '' })}
                />
                Xoá mật khẩu đã lưu
              </label>
            ) : null}
          </div>
        </div>
      </Fieldset>

      <Fieldset legend="Người gửi" hint="Hiện ở ô “From” trong hộp thư của giảng viên.">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="mail-from-name">Tên người gửi</Label>
            <Input
              id="mail-from-name"
              value={values.fromName}
              onChange={(e) => setValues({ fromName: e.target.value })}
              aria-invalid={Boolean(errors.fromName)}
              aria-describedby={errors.fromName ? 'mail-from-name-error' : undefined}
            />
            <span id="mail-from-name-error">
              <FieldError>{errors.fromName}</FieldError>
            </span>
          </div>
          <div>
            <Label htmlFor="mail-from-email">Email người gửi</Label>
            <Input
              id="mail-from-email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              value={values.fromEmail}
              onChange={(e) => setValues({ fromEmail: e.target.value })}
              aria-invalid={Boolean(errors.fromEmail)}
              aria-describedby={errors.fromEmail ? 'mail-from-email-error' : undefined}
            />
            <span id="mail-from-email-error">
              <FieldError>{errors.fromEmail}</FieldError>
            </span>
          </div>
        </div>
      </Fieldset>

      <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className={CHECKBOX_CLASSES}
            checked={values.enabled}
            onChange={(e) => setValues({ enabled: e.target.checked })}
          />
          <span>
            Bật gửi email từ hệ thống
            <span className="block text-xs text-muted">Tắt = chỉ thông báo trong ứng dụng.</span>
          </span>
        </label>
        <Button type="submit" disabled={saveMutation.isPending} className="sm:min-w-40">
          {saveMutation.isPending ? 'Đang lưu…' : 'Lưu cấu hình'}
        </Button>
      </div>
    </form>
  );
}
