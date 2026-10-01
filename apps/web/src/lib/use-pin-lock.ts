'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';
import {
  APP_LOCK_EVENT,
  IDLE_SETTING_SYNC_MS,
  isIdleExpired,
  LAST_ACTIVITY_KEY,
  parseStoredActivity,
  shouldRecordActivity,
} from './pin-lock';

/** Nhịp kiểm tra "đã đủ lâu không thao tác chưa". */
const CHECK_EVERY_MS = 15_000;

/** Chỉ thao tác thật của người dùng — polling/SSE không làm trễ việc khoá. */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;

function readStoredActivity(): number | null {
  try {
    return parseStoredActivity(window.localStorage.getItem(LAST_ACTIVITY_KEY));
  } catch {
    return null;
  }
}

function writeStoredActivity(at: number): void {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // Chế độ riêng tư / chặn lưu trữ: vẫn khoá theo mốc trong bộ nhớ của tab này.
  }
}

interface PinLockState {
  locked: boolean;
  unlock: () => void;
}

/**
 * Khoá ứng dụng sau `idleMinutes` không thao tác. Mốc thao tác chia sẻ giữa
 * các tab qua localStorage (tab này đang dùng thì tab kia không khoá). Việc
 * khoá được ghi ở server (`POST /auth/pin/lock`) nên F5 / đóng tab không thoát được.
 */
export function usePinLock(idleMinutes: number, lockedOnServer: boolean): PinLockState {
  const queryClient = useQueryClient();
  const [locked, setLocked] = useState(lockedOnServer);
  const lockedRef = useRef(lockedOnServer);
  const lastRecordedRef = useRef(0);

  const lock = useCallback(() => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    void apiFetch('/auth/pin/lock', { method: 'POST' }).catch(() => undefined);
  }, []);

  const recordActivity = useCallback((force = false) => {
    if (lockedRef.current) return;
    const now = Date.now();
    if (!force && !shouldRecordActivity(lastRecordedRef.current, now)) return;
    lastRecordedRef.current = now;
    writeStoredActivity(now);
  }, []);

  const unlock = useCallback(() => {
    lockedRef.current = false;
    setLocked(false);
    // Báo tab khác: mốc mới + tab đó tự hỏi lại server rồi gỡ màn khoá.
    recordActivity(true);
  }, [recordActivity]);

  useEffect(() => {
    if (lockedOnServer) {
      lockedRef.current = true;
      setLocked(true);
    }
  }, [lockedOnServer]);

  // Mốc "vừa mở ứng dụng" chỉ ghi lúc mount. KHÔNG ghi lại khi `idleMinutes`
  // đổi — admin đổi cấu hình không được làm mới đồng hồ của mọi người.
  useEffect(() => {
    recordActivity(true);
  }, [recordActivity]);

  // Kéo mốc khoá mới nhất từ server; refetch không phải thao tác người dùng
  // nên không làm trễ việc khoá.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (lockedRef.current || document.visibilityState !== 'visible') return;
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    }, IDLE_SETTING_SYNC_MS);
    return () => window.clearInterval(timer);
  }, [queryClient]);

  useEffect(() => {
    function check() {
      if (lockedRef.current) return;
      const last = Math.max(lastRecordedRef.current, readStoredActivity() ?? 0);
      if (isIdleExpired(last, Date.now(), idleMinutes)) lock();
    }

    function onActivity() {
      recordActivity();
    }

    async function onStorage(event: StorageEvent) {
      if (event.key !== LAST_ACTIVITY_KEY || !lockedRef.current) return;
      // Tab khác vừa mở khoá — hỏi server thay vì tin localStorage.
      const me = await apiFetch<{ locked: boolean }>('/auth/me').catch(() => null);
      if (me && !me.locked) {
        lockedRef.current = false;
        setLocked(false);
      }
    }

    // Mốc mới có thể đã quá hạn ngay (vd 15 → 3 phút sau 5 phút rảnh).
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const onLockEvent = () => {
      lockedRef.current = true;
      setLocked(true);
    };

    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, onActivity, { passive: true });
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener(APP_LOCK_EVENT, onLockEvent);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, onActivity);
      }
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(APP_LOCK_EVENT, onLockEvent);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [idleMinutes, lock, recordActivity]);

  return { locked, unlock };
}
