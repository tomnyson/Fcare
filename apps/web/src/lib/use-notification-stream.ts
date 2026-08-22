'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { API_URL } from './api';

const RECONNECT_DELAY_MS = 5_000;

/**
 * Kênh realtime chính cho thông báo: SSE /notifications/stream (auth cookie).
 * Đứt kết nối (server restart, access token hết hạn) → refresh token rồi nối lại;
 * polling trong hooks.ts vẫn chạy thưa như lưới an toàn.
 */
export function useNotificationStream(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function invalidate() {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }

    function connect() {
      if (stopped) {
        return;
      }
      source = new EventSource(`${API_URL}/notifications/stream`, {
        withCredentials: true,
      });
      source.addEventListener('notification', invalidate);
      source.onerror = () => {
        source?.close();
        source = null;
        if (stopped) {
          return;
        }
        retryTimer = setTimeout(() => {
          void fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
          })
            .catch(() => undefined)
            .finally(connect);
        }, RECONNECT_DELAY_MS);
      };
    }

    connect();
    return () => {
      stopped = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      source?.close();
    };
  }, [queryClient]);
}
