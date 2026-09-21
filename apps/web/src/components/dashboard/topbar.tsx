'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatUnreadBadge } from '../../lib/discussion';
import { useDiscussionUnreadCount, useNotifications, useUnreadCount } from '../../lib/hooks';
import { ALERT_LEVEL_LABELS, formatDateTime } from '../../lib/labels';
import type { AuthUser } from '../../lib/types';
import {
  useDiscussionPollingFallback,
  useNotificationStream,
} from '../../lib/use-notification-stream';
import { ANALYSIS_RISK_LABELS } from '../students/student-analysis-helpers';

export function Topbar({ user }: { user: AuthUser }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  useNotificationStream();
  useDiscussionPollingFallback();
  const { data: unread } = useUnreadCount();
  const { data: discussionUnread } = useDiscussionUnreadCount();
  const { data: notifications } = useNotifications(open);

  async function onMarkAllRead() {
    await apiFetch('/notifications/read-all', { method: 'POST' });
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  async function onOpenNotification(notification: NonNullable<typeof notifications>[number]) {
    await apiFetch(`/notifications/${notification.id}/read`, { method: 'PATCH' }).catch(
      () => undefined,
    );
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setOpen(false);
    router.push(notification.targetUrl ?? (notification.alert ? '/alerts' : '/dashboard'));
  }

  const unreadCount = unread?.count ?? 0;
  // Badge tổng cho trao đổi nội bộ: cho biết "có luồng nào cần bạn xem" mà
  // không phải mở từng hồ sơ sinh viên. Không có trang hộp thư trao đổi nên
  // đây là chỉ báo, không phải nút bấm — bấm vào đâu cũng là đoán sai ý.
  const discussionBadge = formatUnreadBadge(discussionUnread?.count ?? 0);

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-white px-6 py-3">
      <p className="truncate text-sm font-semibold text-fpt-blue-900 max-sm:hidden">
        Xin chào, {user.fullName}
      </p>

      <div className="flex items-center gap-3">
        {discussionBadge ? (
          <p
            role="status"
            // LOW-G: tooltip `title` chỉ tồn tại cho chuột. Nhãn của vùng
            // live region phải nằm ở `aria-label` thì bàn phím và cảm ứng mới
            // nghe được; phần đếm vẫn nằm trong nội dung để đọc khi thay đổi.
            aria-label="Trao đổi nội bộ — mở hồ sơ sinh viên để đọc trao đổi"
            className="flex items-center gap-2 rounded-full border border-border bg-fpt-blue/5 py-1 pl-3 pr-1.5 text-xs font-semibold text-fpt-blue-700"
          >
            <span aria-hidden="true">💬</span>
            <span className="max-sm:sr-only">Trao đổi</span>
            <span
              aria-hidden="true"
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-fpt-blue px-1.5 text-[11px] font-bold text-white"
            >
              {discussionBadge}
            </span>
            <span className="sr-only">
              {`${discussionUnread?.count ?? 0} luồng trao đổi có tin chưa đọc`}
            </span>
          </p>
        ) : null}

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={`Thông báo (${unreadCount} chưa đọc)`}
            className={`relative rounded-md border border-border p-2 text-lg leading-none transition-colors hover:bg-fpt-orange-50 ${
              unreadCount > 0 ? 'motion-safe:animate-pulse motion-reduce:animate-none' : ''
            }`}
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
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => void onOpenNotification(notification)}
                      >
                        <p className="font-semibold text-ink">{notification.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-muted">{notification.body}</p>
                        <p className="mt-1 text-xs text-muted">
                          {notification.analysis?.riskLevel
                            ? `Rủi ro ${ANALYSIS_RISK_LABELS[notification.analysis.riskLevel]} · `
                            : notification.alert
                              ? `Mức ${ALERT_LEVEL_LABELS[notification.alert.level] ?? notification.alert.level} · `
                              : ''}
                          {formatDateTime(notification.createdAt)}
                        </p>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
