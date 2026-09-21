'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { API_URL, redirectToLogin, refreshSession } from './api';
import { latestDiscussionMessageId } from './discussion';
import { useNotificationsPolling } from './hooks';
import { playAlertSound, readSoundPreference, shouldPlayAlertSound } from './push/alert-sound';

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

    function invalidate(event: MessageEvent<string>) {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      // Thông báo của tin trao đổi → làm mới luồng đang mở, không cần biết luồng nào.
      try {
        const payload = JSON.parse(event.data) as {
          discussionMessageId?: string | null;
          alertId?: string | null;
          alertLevel?: number | null;
        };
        // Cảnh báo cấp 3–4 → kêu để cán bộ đang làm việc khác trong tab vẫn biết.
        if (shouldPlayAlertSound(payload, readSoundPreference())) {
          playAlertSound();
        }
        if (payload.discussionMessageId) {
          void queryClient.invalidateQueries({ queryKey: ['discussions'] });
        }
        // Thông báo gắn cảnh báo (kể cả cảnh báo điểm danh tự động) → làm mới
        // bảng "cần chăm sóc" trên dashboard và badge sidebar mà không chờ polling.
        if (payload.alertId) {
          void queryClient.invalidateQueries({ queryKey: ['attendance-alerts'] });
          void queryClient.invalidateQueries({ queryKey: ['statistics', 'overview'] });
        }
      } catch {
        // Payload lạ thì bỏ qua — invalidate thông báo ở trên đã chạy rồi.
      }
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
          // Dùng chung lượt refresh với apiFetch: gọi riêng sẽ xoay token chồng
          // lên các request đang chạy và làm chúng rơi về /login.
          void refreshSession().then((result) => {
            if (result === 'unauthorized') redirectToLogin();
            else connect();
          });
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

/**
 * Lưới an toàn khi SSE rớt (proxy cắt kết nối, mạng chập chờn): danh sách thông
 * báo tự làm mới mỗi 120s, và nếu có tin trao đổi mới thì làm mới luôn khung
 * hội thoại — đúng việc mà nhánh SSE làm khi nhận `discussionMessageId`. Không
 * có nhánh này, chuông báo cập nhật nhưng luồng đứng im tới khi người dùng F5.
 */
export function useDiscussionPollingFallback(): void {
  const queryClient = useQueryClient();
  const { data } = useNotificationsPolling();
  const latestId = latestDiscussionMessageId(data);
  // `undefined` = chưa có lần tải nào; lần tải ĐẦU chỉ đặt mốc, không invalidate
  // (vừa mở trang thì luồng đã là dữ liệu mới).
  const seenRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (data === undefined) {
      return;
    }
    const previous = seenRef.current;
    seenRef.current = latestId;
    if (previous !== undefined && latestId !== null && latestId !== previous) {
      void queryClient.invalidateQueries({ queryKey: ['discussions'] });
    }
  }, [data, latestId, queryClient]);
}
