'use client';

import { PIN_LENGTH } from '@fcare/shared-types';
import { Button } from '@fcare/ui-kit';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { FormError } from '../ui/form';
import { ForgotPin } from './forgot-pin';
import { PinCodeInput } from '../ui/pin-code-input';

interface LockOverlayProps {
  fullName: string;
  onUnlocked: () => void;
}

/**
 * Màn khoá phủ toàn bộ ứng dụng. Trang bên dưới vẫn giữ nguyên (không unmount)
 * để nội dung đang soạn không mất; bấm nền / Esc KHÔNG đóng — chỉ PIN đúng, đăng xuất hoặc "Quên mã PIN?" (đăng nhập lại rồi tạo PIN mới).
 */
export function LockOverlay({ fullName, onUnlocked }: LockOverlayProps) {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(value: string) {
    if (value.length !== PIN_LENGTH || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/auth/pin/verify', { method: 'POST', body: JSON.stringify({ pin: value }) });
      onUnlocked();
      // Các truy vấn hỏng vì APP_LOCKED trong lúc khoá → tải lại.
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể kết nối máy chủ.');
      setPin('');
    } finally {
      setSubmitting(false);
    }
  }

  async function onLogout() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/login';
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-fpt-blue-900/95 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-title"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(pin);
        }}
        className="w-full max-w-sm rounded-2xl border-t-4 border-fpt-orange bg-surface-raised p-8 shadow-2xl"
      >
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-fpt-orange/10">
            <svg
              className="h-7 w-7 text-fpt-orange"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2
            id="lock-title"
            className="font-[family-name:var(--font-display)] text-xl font-bold text-fpt-blue-900"
          >
            Ứng dụng đã khoá
          </h2>
          <p className="mt-1 text-sm text-muted">
            {fullName} — nhập mã PIN {PIN_LENGTH} số để tiếp tục. Nội dung bạn đang làm vẫn được
            giữ nguyên.
          </p>
        </div>

        <div className="mt-6">
          <PinCodeInput
            id="unlock-pin"
            label="Mã PIN mở khoá"
            value={pin}
            length={PIN_LENGTH}
            onChange={(next) => {
              setPin(next);
              if (error) setError('');
            }}
            onComplete={(value) => void submit(value)}
            invalid={Boolean(error)}
            disabled={submitting}
            autoFocus
          />
        </div>

        <div className="mt-4">
          <FormError>{error}</FormError>
        </div>

        <div className="mt-2">
          <ForgotPin disabled={submitting} />
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" type="button" onClick={onLogout} disabled={submitting}>
            Đăng xuất
          </Button>
          <Button type="submit" disabled={pin.length !== PIN_LENGTH || submitting}>
            {submitting ? 'Đang kiểm tra…' : 'Mở khoá'}
          </Button>
        </div>
      </form>
    </div>
  );
}
