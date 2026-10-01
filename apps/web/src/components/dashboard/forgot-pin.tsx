'use client';

import { Button } from '@fcare/ui-kit';
import { useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { FormError } from '../ui/form';

interface ForgotPinProps {
  disabled?: boolean;
}

/**
 * "Quên mã PIN?" — server xoá PIN + thu hồi mọi phiên, người dùng đăng nhập lại
 * bằng mật khẩu/Google rồi tạo PIN mới. Cố ý KHÔNG có OTP qua email (rule 4).
 */
export function ForgotPin({ disabled }: ForgotPinProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function reset() {
    setPending(true);
    setError('');
    try {
      await apiFetch('/auth/pin/forgot', { method: 'POST' });
      window.location.href = '/login';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể kết nối máy chủ.');
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <p className="text-center">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={disabled}
          className="rounded text-sm font-medium text-fpt-blue underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-orange/60 disabled:opacity-60"
        >
          Quên mã PIN?
        </button>
      </p>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby="forgot-pin-title"
      aria-describedby="forgot-pin-desc"
      className="rounded-[var(--radius-card)] border border-fpt-orange/40 bg-fpt-orange/10 p-4 text-left"
    >
      <p id="forgot-pin-title" className="text-sm font-semibold text-fpt-blue-900">
        Đặt lại mã PIN?
      </p>
      <p id="forgot-pin-desc" className="mt-1 text-sm text-muted">
        Bạn sẽ bị đăng xuất khỏi mọi thiết bị. Đăng nhập lại bằng mật khẩu hoặc Google, sau đó tạo
        mã PIN mới. Nội dung đang soạn chưa lưu sẽ mất.
      </p>
      <FormError>{error}</FormError>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={() => setConfirming(false)} disabled={pending}>
          Huỷ
        </Button>
        <Button type="button" onClick={() => void reset()} disabled={pending}>
          {pending ? 'Đang đăng xuất…' : 'Đăng xuất & đặt lại'}
        </Button>
      </div>
    </div>
  );
}
