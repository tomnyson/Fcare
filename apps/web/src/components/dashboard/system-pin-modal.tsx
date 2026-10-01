'use client';

import { PIN_LENGTH } from '@fcare/shared-types';
import { Button } from '@fcare/ui-kit';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch, ApiError } from '../../lib/api';
import { FormError } from '../ui/form';
import { PinCodeInput } from '../ui/pin-code-input';

export interface SystemPinModalProps {
  open: boolean;
  /** href mà user muốn navigate — truyền về cho parent sau khi xác thực xong */
  targetHref: string | null;
  onSuccess: (href: string) => void;
  onCancel: () => void;
}

/**
 * Hỏi lại PIN cá nhân trước khi vào khu vực Hệ thống. PIN kiểm ở server (đếm
 * sai chung với màn khoá); bấm nền KHÔNG đóng — chỉ nút Huỷ hoặc Esc.
 */
export function SystemPinModal({ open, targetHref, onSuccess, onCancel }: SystemPinModalProps) {
  const [mounted, setMounted] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPin('');
    setError('');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  async function submit(value: string) {
    if (value.length !== PIN_LENGTH || submitting || !targetHref) return;
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/auth/pin/verify', { method: 'POST', body: JSON.stringify({ pin: value }) });
      onSuccess(targetHref);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không kiểm tra được mã PIN.');
      setPin('');
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-fpt-blue-900/60 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(pin);
        }}
        className="w-full max-w-sm rounded-2xl border-t-4 border-fpt-orange bg-surface-raised p-8 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-pin-title"
      >
        <div className="mb-6 text-center">
          <h2
            id="system-pin-title"
            className="font-[family-name:var(--font-display)] text-xl font-bold text-fpt-blue-900"
          >
            Xác thực bảo mật
          </h2>
          <p className="mt-1 text-sm text-muted">
            Nhập mã PIN {PIN_LENGTH} số của bạn để vào khu vực Hệ thống
          </p>
        </div>

        <PinCodeInput
          id="system-pin"
          label="Mã PIN vào khu vực Hệ thống"
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

        <div className="mt-4">
          <FormError>{error}</FormError>
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <Button variant="ghost" type="button" onClick={onCancel} disabled={submitting}>
            Huỷ
          </Button>
          <Button type="submit" disabled={pin.length !== PIN_LENGTH || submitting}>
            {submitting ? 'Đang kiểm tra…' : 'Xác nhận'}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
