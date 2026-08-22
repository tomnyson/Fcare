'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useNotifications, useUnreadCount } from '../../lib/hooks';
import { ALERT_LEVEL_LABELS, formatDateTime, ROLE_LABELS } from '../../lib/labels';
import type { AuthUser } from '../../lib/types';
import { useNotificationStream } from '../../lib/use-notification-stream';

export function Topbar({ user }: { user: AuthUser }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  useNotificationStream();
  const { data: unread } = useUnreadCount();
  const { data: notifications } = useNotifications(open);

  async function onLogout() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    queryClient.clear();
    router.push('/login');
  }

  async function onMarkAllRead() {
    await apiFetch('/notifications/read-all', { method: 'POST' });
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  const unreadCount = unread?.count ?? 0;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-white px-6 py-3">
      <p className="text-sm text-muted max-sm:hidden">
        Xin chào, <strong className="text-ink">{user.fullName}</strong>
        <span className="ml-2 rounded-full bg-fpt-orange-50 px-2.5 py-0.5 text-xs font-semibold text-fpt-orange">
          {user.roles.map((role) => ROLE_LABELS[role]).join(', ')}
        </span>
      </p>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={`Thông báo (${unreadCount} chưa đọc)`}
            className="relative rounded-md border border-border p-2 text-lg leading-none transition-colors hover:bg-fpt-orange-50"
          >
            🔔
            {unreadCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </button>

          {open ? (
            <div className="absolute right-0 z-40 mt-2 w-96 max-w-[85vw] rounded-[var(--radius-card)] border border-border bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-bold text-fpt-blue-900">Thông báo</h2>
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="text-xs font-semibold text-fpt-blue hover:underline"
                >
                  Đánh dấu đã đọc tất cả
                </button>
              </div>
              <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                {(notifications ?? []).length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-muted">Chưa có thông báo.</li>
                ) : (
                  (notifications ?? []).map((notification) => (
                    <li
                      key={notification.id}
                      className={`px-4 py-3 text-sm ${notification.readAt ? 'opacity-60' : 'bg-fpt-orange-50/40'}`}
                    >
                      <p className="font-semibold text-ink">{notification.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-muted">{notification.body}</p>
                      <p className="mt-1 text-xs text-muted">
                        {notification.alert
                          ? `Mức ${ALERT_LEVEL_LABELS[notification.alert.level] ?? notification.alert.level} · `
                          : ''}
                        {formatDateTime(notification.createdAt)}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-danger hover:bg-danger/5 hover:text-danger"
        >
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
