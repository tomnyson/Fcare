'use client';

import { useEffect } from 'react';
import { getLastSessionRefreshAt, redirectToLogin, refreshSession } from './api';
import { shouldKeepAlive } from './session-refresh';

/** Nhịp kiểm tra — ngắn để bắt kịp sau khi máy ngủ dậy hoặc tab bị trình duyệt làm chậm timer. */
const CHECK_EVERY_MS = 60 * 1000;

/**
 * Tự làm mới phiên TRƯỚC khi access token hết hạn khi người dùng đang mở tab,
 * để đang làm việc (soạn nhận xét, nhật ký…) không bị đá ra. Tab ẩn thì chờ
 * tới lúc quay lại mới làm mới — refresh token còn 7 ngày nên vẫn kịp.
 */
export function useSessionKeepAlive(): void {
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (document.visibilityState !== 'visible') return;
      if (!shouldKeepAlive(getLastSessionRefreshAt(), Date.now())) return;
      const result = await refreshSession();
      if (!cancelled && result === 'unauthorized') redirectToLogin();
    }

    const timer = window.setInterval(() => void tick(), CHECK_EVERY_MS);
    const onVisible = () => void tick();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
}
