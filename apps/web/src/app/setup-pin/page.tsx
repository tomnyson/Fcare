'use client';

import { PIN_LENGTH, validatePinFormat } from '@fcare/shared-types';
import { Button, SurfaceCard } from '@fcare/ui-kit';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FormError, Label } from '../../components/ui/form';
import { PinCodeInput } from '../../components/ui/pin-code-input';
import { apiFetch, ApiError } from '../../lib/api';

/**
 * Bước bắt buộc sau đổi mật khẩu tạm + ký cam kết: tạo PIN 6 số để mở khoá
 * ứng dụng khi rời máy, và để xác nhận thao tác phá huỷ (phục hồi, xoá cảnh báo).
 */
export default function SetupPinPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const formatError = pin.length === PIN_LENGTH ? validatePinFormat(pin) : null;
  const mismatch = confirm.length === PIN_LENGTH && confirm !== pin;
  const canSubmit =
    pin.length === PIN_LENGTH && confirm === pin && !formatError && !submitting;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      await apiFetch('/auth/pin', { method: 'POST', body: JSON.stringify({ pin }) });
      // `me` còn cache requiresPinSetup=true → phải bỏ trước khi vào dashboard.
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể kết nối máy chủ.');
      setConfirm('');
      setSubmitting(false);
    }
  }

  async function onLogout() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fpt-blue-900 p-6">
      <SurfaceCard className="w-full max-w-md border-t-4 border-t-fpt-orange">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-fpt-blue-900">
          Tạo mã PIN cá nhân
        </h1>
        <p className="mt-2 text-sm text-muted">
          Hệ thống tự khoá khi bạn rời máy một lúc. Mã PIN {PIN_LENGTH} số dùng để mở khoá nhanh và
          xác nhận các thao tác quan trọng. Không dùng dãy liên tiếp hay lặp một số.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-5">
          <div>
            <Label htmlFor="new-pin-0" className="text-center">
              Mã PIN mới
            </Label>
            <div className="mt-2">
              <PinCodeInput
                id="new-pin"
                label="Mã PIN mới"
                value={pin}
                length={PIN_LENGTH}
                onChange={(next) => {
                  setPin(next);
                  setError('');
                }}
                invalid={Boolean(formatError)}
                disabled={submitting}
                autoFocus
              />
            </div>
            {formatError ? <FormError>{formatError}</FormError> : null}
          </div>

          <div>
            <Label htmlFor="confirm-pin-0" className="text-center">
              Nhập lại mã PIN
            </Label>
            <div className="mt-2">
              <PinCodeInput
                id="confirm-pin"
                label="Nhập lại mã PIN"
                value={confirm}
                length={PIN_LENGTH}
                onChange={(next) => {
                  setConfirm(next);
                  setError('');
                }}
                invalid={mismatch}
                disabled={submitting || pin.length < PIN_LENGTH || Boolean(formatError)}
              />
            </div>
            {mismatch ? <FormError>Hai lần nhập không khớp.</FormError> : null}
          </div>

          <FormError>{error}</FormError>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={onLogout}>
              Đăng xuất
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Đang lưu…' : 'Lưu mã PIN'}
            </Button>
          </div>
        </form>
      </SurfaceCard>
    </main>
  );
}
