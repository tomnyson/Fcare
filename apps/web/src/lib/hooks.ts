'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { AuthUser, Notification } from './types';

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

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => apiFetch<{ count: number }>('/notifications/unread-count'),
    // SSE (use-notification-stream) là kênh chính; polling thưa làm lưới an toàn.
    refetchInterval: 120_000,
  });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => apiFetch<Notification[]>('/notifications'),
    enabled,
  });
}
