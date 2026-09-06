'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { AuthUser, DiscussionThread, Notification } from './types';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{ user: AuthUser; requiresConsent: boolean; mustChangePassword: boolean }>(
        '/auth/me',
      ),
    staleTime: 5 * 60_000,
  });
}

/** SSE (use-notification-stream) là kênh chính; polling thưa làm lưới an toàn. */
const POLL_INTERVAL_MS = 120_000;

const NOTIFICATIONS_LIST_KEY = ['notifications', 'list'];

const fetchNotifications = () => apiFetch<Notification[]>('/notifications');

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => apiFetch<{ count: number }>('/notifications/unread-count'),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: NOTIFICATIONS_LIST_KEY,
    queryFn: fetchNotifications,
    enabled,
  });
}

/**
 * Cùng cache với `useNotifications` (một queryKey → một lượt gọi) nhưng luôn
 * bật và tự làm mới: đây là nguồn dữ liệu cho lưới an toàn khi SSE rớt, nên
 * không được phụ thuộc vào việc người dùng có mở hộp thông báo hay không.
 */
export function useNotificationsPolling() {
  return useQuery({
    queryKey: NOTIFICATIONS_LIST_KEY,
    queryFn: fetchNotifications,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * Số LUỒNG trao đổi đang có tin chưa đọc, cho badge tổng trên thanh trên cùng.
 * Đặt dưới tiền tố `['discussions']` để mọi lệnh invalidate luồng (SSE, polling,
 * đánh dấu đã đọc khi mở tab) cũng làm mới badge này.
 */
export function useDiscussionUnreadCount() {
  return useQuery({
    queryKey: ['discussions', 'unread-count'],
    queryFn: () => apiFetch<{ count: number }>('/discussions/unread-count'),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * Một luồng trao đổi. Cả trang hồ sơ (vẽ badge chưa đọc trên nhãn tab) lẫn
 * `DiscussionTab` (vẽ hội thoại) dùng chung queryKey này, nên TanStack Query
 * gộp thành một lượt gọi — badge phải hiện được TRƯỚC khi người dùng mở tab,
 * mà tab thì chỉ mount khi đã mở.
 */
export function useDiscussion(studentId: string) {
  return useQuery({
    queryKey: ['discussions', studentId],
    queryFn: () => apiFetch<DiscussionThread>(`/discussions/${studentId}/messages`),
  });
}
