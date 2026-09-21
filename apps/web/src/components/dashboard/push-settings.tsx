'use client';

import { useState } from 'react';
import {
  playAlertSound,
  readSoundPreference,
  writeSoundPreference,
} from '../../lib/push/alert-sound';
import { isPushConfigured } from '../../lib/push/onesignal';
import { PUSH_STATE_COPY } from '../../lib/push/push-state';
import { usePushSubscription } from '../../lib/push/use-push-subscription';

/** Cuối dropdown chuông: bật/tắt push trình duyệt (OneSignal) + tiếng báo khi tab mở. */
export function PushSettings() {
  const { state, busy, enable, disable } = usePushSubscription();
  const [soundOn, setSoundOn] = useState(() => readSoundPreference());
  const copy = PUSH_STATE_COPY[state];
  const showPush = isPushConfigured() && state !== 'unsupported';

  function onToggleSound(next: boolean) {
    setSoundOn(next);
    writeSoundPreference(next);
    // Nghe thử ngay — cũng là thao tác người dùng giúp mở khoá âm thanh cho tab.
    if (next) playAlertSound();
  }

  return (
    <section
      aria-label="Cài đặt thông báo"
      className="space-y-3 border-t border-border bg-surface px-4 py-3 text-xs"
    >
      {showPush ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-ink">{copy.label}</p>
            {copy.hint ? <p className="mt-0.5 text-muted">{copy.hint}</p> : null}
          </div>
          {copy.action ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void (copy.action === 'enable' ? enable() : disable())}
              className={`shrink-0 rounded-md px-2.5 py-1 font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-fpt-blue disabled:opacity-50 ${
                copy.action === 'enable'
                  ? 'bg-fpt-blue text-white hover:bg-fpt-blue-700'
                  : 'border border-border text-ink hover:bg-fpt-orange-50'
              }`}
            >
              {busy ? 'Đang xử lý…' : copy.action === 'enable' ? 'Bật' : 'Tắt'}
            </button>
          ) : null}
        </div>
      ) : null}

      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block font-semibold text-ink">Âm thanh cảnh báo</span>
          <span className="block text-muted">
            Kêu khi có cảnh báo Cao/Khẩn cấp lúc tab đang mở.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={soundOn}
          onChange={(event) => onToggleSound(event.target.checked)}
          className="h-4 w-4 shrink-0 accent-fpt-blue"
        />
      </label>
    </section>
  );
}
