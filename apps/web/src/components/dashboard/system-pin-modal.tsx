'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { verifySystemPin } from '../../lib/system-pin';

export interface SystemPinModalProps {
  open: boolean;
  /** href mà user muốn navigate — truyền về cho parent sau khi xác thực xong */
  targetHref: string | null;
  onSuccess: (href: string) => void;
  onCancel: () => void;
}

const PIN_LENGTH = 6;
const MAX_ATTEMPTS = 5;

export function SystemPinModal({ open, targetHref, onSuccess, onCancel }: SystemPinModalProps) {
  const [mounted, setMounted] = useState(false);
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(PIN_LENGTH).fill(null));

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset khi modal mở
  useEffect(() => {
    if (open) {
      setDigits(Array(PIN_LENGTH).fill(''));
      setError('');
      // Focus ô đầu tiên
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  }, [open]);

  if (!open || !mounted) return null;

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      onCancel();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = '';
        setDigits(next);
      } else if (index > 0) {
        next[index - 1] = '';
        setDigits(next);
        inputRefs.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
      return;
    }
    if (e.key === 'ArrowRight' && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
      return;
    }
  }

  function handleInput(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    if (!digit) return;

    setError('');
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    } else {
      // Nhập đủ PIN — auto submit
      const pin = [...next].join('');
      submitPin(pin);
    }
  }

  function submitPin(pin: string) {
    if (pin.length < PIN_LENGTH) return;

    if (verifySystemPin(pin)) {
      setError('');
      if (targetHref) {
        onSuccess(targetHref);
      }
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      const remaining = MAX_ATTEMPTS - newAttempts;
      if (remaining > 0) {
        setError(`Mã PIN không đúng. Còn ${remaining} lần thử.`);
      } else {
        setError('Đã nhập sai nhiều lần. Vui lòng thử lại sau.');
      }
      // Reset digits
      const cleared = Array(PIN_LENGTH).fill('');
      setDigits(cleared);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  }

  const isBlocked = attempts >= MAX_ATTEMPTS;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-fpt-blue-900/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border-t-4 border-fpt-orange bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Nhập mã PIN hệ thống"
      >
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-fpt-orange/10">
            <svg
              className="h-7 w-7 text-fpt-orange"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-fpt-blue-900">
            Xác thực bảo mật
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Nhập mã PIN 6 chữ số để truy cập khu vực Hệ thống
          </p>
        </div>

        {/* PIN Inputs */}
        <div className="mb-4 flex justify-center gap-2">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              disabled={isBlocked}
              aria-label={`Chữ số thứ ${i + 1}`}
              className={`h-12 w-10 rounded-lg border-2 text-center text-xl font-bold tabular-nums transition-all focus:outline-none ${
                error
                  ? 'border-rose-400 bg-rose-50 text-rose-700'
                  : digit
                    ? 'border-fpt-orange bg-fpt-orange/5 text-fpt-blue-900'
                    : 'border-slate-200 bg-slate-50 text-fpt-blue-900 focus:border-fpt-orange focus:bg-white'
              } ${isBlocked ? 'cursor-not-allowed opacity-50' : ''}`}
              onChange={(e) => handleInput(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onFocus={(e) => e.target.select()}
            />
          ))}
        </div>

        {/* Error message */}
        {error && <p className="mb-4 text-center text-sm font-medium text-rose-600">{error}</p>}

        {/* Actions */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-6 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:border-slate-300"
          >
            Hủy
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Nhấn{' '}
          <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[10px]">
            Esc
          </kbd>{' '}
          để đóng
        </p>
      </div>
    </div>,
    document.body,
  );
}
