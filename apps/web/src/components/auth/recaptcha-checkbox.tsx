'use client';

import { useEffect, useRef, useState } from 'react';
import { recaptcha, whenLaidOut } from '../../lib/recaptcha';

interface RecaptchaCheckboxProps {
  /** Token khi tick xong; null khi hết hạn hoặc bị bỏ tick. */
  onTokenChange: (token: string | null) => void;
  /** Tăng lên để bỏ tick (token đã dùng cho một lần gửi). */
  resetSignal: number;
}

type Status = 'loading' | 'ready' | 'unavailable';

/** Ô tick reCAPTCHA v2 "Tôi không phải người máy". */
export function RecaptchaCheckbox({ onTokenChange, resetSignal }: RecaptchaCheckboxProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<number | null>(null);
  const onTokenRef = useRef(onTokenChange);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    onTokenRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    // Mỗi lần mount một ô mới: grecaptcha không cho render hai lần vào cùng phần tử
    // (StrictMode chạy effect hai lần ở dev).
    const slot = document.createElement('div');
    host.appendChild(slot);
    // Đo bề rộng khi form đã hiện (form bị `hidden` lúc kiểm tra phiên → 0 → compact nhầm).
    const stopWaiting = whenLaidOut(host, (width) => {
      if (cancelled) return;
      recaptcha
        .mount(slot, width, {
          onToken: (token) => onTokenRef.current(token),
          onExpired: () => onTokenRef.current(null),
        })
        .then((widgetId) => {
          if (cancelled) return;
          widgetRef.current = widgetId;
          setStatus('ready');
        })
        .catch(() => {
          if (!cancelled) setStatus('unavailable');
        });
    });
    return () => {
      cancelled = true;
      stopWaiting();
      widgetRef.current = null;
      slot.remove();
    };
  }, []);

  useEffect(() => {
    if (resetSignal === 0 || widgetRef.current === null) return;
    recaptcha.reset(widgetRef.current);
  }, [resetSignal]);

  return (
    <div className="relative">
      <div
        ref={hostRef}
        data-recaptcha="true"
        className={status === 'unavailable' ? 'hidden' : 'flex min-h-[78px] justify-center'}
      />
      {status === 'loading' ? (
        <p
          role="status"
          className="absolute inset-0 mx-auto flex max-w-[304px] animate-pulse items-center justify-center rounded-md border border-border bg-surface-raised text-xs text-muted motion-reduce:animate-none"
        >
          Đang tải xác minh “Tôi không phải người máy”…
        </p>
      ) : null}
      {status === 'unavailable' ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-1 rounded-md border border-danger/30 bg-danger/5 px-3 pt-3 text-center text-xs text-danger"
        >
          <p>Không tải được reCAPTCHA của Google. Kiểm tra mạng hoặc tắt trình chặn quảng cáo.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-sm px-2 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange"
          >
            Tải lại trang
          </button>
        </div>
      ) : null}
    </div>
  );
}
