'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatNavBadge } from '../../lib/attendance-care';
import { resetPush } from '../../lib/push/onesignal';
import { BrandMark } from '../ui/brand-mark';
import { ROLE_LABELS } from '../../lib/labels';
import type { AuthUser, StatisticsOverview } from '../../lib/types';
import { IconChevron, IconLogout } from './nav-icons';
import {
  buildNavSections,
  isGroupOpen,
  isNavActive,
  type NavGroup,
  type NavLeaf,
  type NavNode,
  type NavSection,
} from './nav-tree';

/** Chữ cái đầu của họ và tên — ảnh đại diện chỉ là hai ký tự, không lưu ảnh. */
function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase() || '?';
}

export interface NavBadges {
  /** Tổng cảnh báo đang mở trong phạm vi của người đăng nhập. */
  openAlerts: string | null;
  /** Cảnh báo điểm danh ở lớp mình đứng lớp mà mình chưa chăm sóc — cần hành động. */
  attendancePending: string | null;
}

function useNavBadges(): NavBadges {
  const { data } = useQuery({
    queryKey: ['statistics', 'overview'],
    queryFn: () => apiFetch<StatisticsOverview>('/statistics/overview'),
    retry: false,
  });
  const total = (data?.openAlertsByLevel ?? []).reduce((sum, item) => sum + item.count, 0);
  return {
    openAlerts: formatNavBadge(total),
    attendancePending: formatNavBadge(data?.attendancePending),
  };
}

/** Pill cạnh mục "Cảnh báo": ưu tiên số việc đang chờ mình (cam đậm), không thì tổng đang mở. */
function AlertPill({ badge }: { badge: NavBadges }) {
  if (badge.attendancePending) {
    return (
      <span
        title={`${badge.attendancePending} cảnh báo điểm danh chờ bạn chăm sóc`}
        className="ml-auto rounded-full bg-fpt-orange px-2 py-0.5 text-[11px] font-bold tabular-nums text-white max-lg:hidden"
      >
        {badge.attendancePending}
      </span>
    );
  }
  if (badge.openAlerts) {
    return (
      <span className="ml-auto rounded-full bg-fpt-orange/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-fpt-orange max-lg:hidden">
        {badge.openAlerts}
      </span>
    );
  }
  return null;
}

const ROW_BASE =
  'group relative flex w-full items-center gap-3 rounded-lg py-2.5 pl-3 pr-2.5 text-left text-[13.5px] transition-colors max-lg:justify-center max-lg:px-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-orange/70';

function rowClass(active: boolean): string {
  return `${ROW_BASE} ${
    active
      ? 'bg-white/[0.09] font-semibold text-white'
      : 'font-medium text-white/60 hover:bg-white/[0.05] hover:text-white'
  }`;
}

/** Vạch cam ở mép trái đánh dấu mục đang mở. */
function ActiveBar({ active }: { active: boolean }) {
  if (!active) {
    return null;
  }
  return (
    <span
      aria-hidden="true"
      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-fpt-orange"
    />
  );
}

function RowIcon({ item, active }: { item: NavLeaf | NavGroup; active: boolean }) {
  const Icon = item.icon;
  // Cấp sâu nhất không có icon: bản thiết kế dùng dấu chấm cho các mục con này.
  if (!Icon) {
    return (
      <span
        aria-hidden="true"
        className={`ml-1 h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
          active ? 'bg-fpt-orange' : 'bg-white/30 group-hover:bg-white/60'
        }`}
      />
    );
  }
  return (
    <Icon
      className={`h-[18px] w-[18px] shrink-0 transition-colors ${
        active ? 'text-fpt-orange' : 'text-white/55 group-hover:text-white/85'
      }`}
    />
  );
}

function LeafLink({
  item,
  pathname,
  badge,
}: {
  item: NavLeaf;
  pathname: string;
  badge: NavBadges;
}) {
  const active = isNavActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      // Cấp sâu nhất (mục dấu chấm) chữ nhỏ hơn một nấc để tên dài như
      // "Quy tắc lớp → ngành" không bị cắt trong bề ngang còn lại.
      className={`${rowClass(active)} ${item.icon ? '' : 'text-[12.5px]'}`}
    >
      <ActiveBar active={active} />
      <RowIcon item={item} active={active} />
      <span className="truncate max-lg:hidden">{item.label}</span>
      {item.badge === 'openAlerts' ? <AlertPill badge={badge} /> : null}
    </Link>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <IconChevron
      className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
    />
  );
}

function Group({
  group,
  pathname,
  collapsed,
  onToggle,
  badge,
}: {
  group: NavGroup;
  pathname: string;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
  badge: NavBadges;
}) {
  const open = isGroupOpen(group, pathname, collapsed);
  const active = group.href ? isNavActive(pathname, group.href) : false;
  const panelId = `nav-group-${group.id}`;
  const toggleLabel = `${open ? 'Thu gọn' : 'Mở rộng'} ${group.label}`;

  return (
    <li>
      <div className="relative flex items-center">
        {group.href ? (
          <>
            <Link
              href={group.href}
              aria-current={active ? 'page' : undefined}
              className={`${rowClass(active)} pr-9`}
            >
              <ActiveBar active={active} />
              <RowIcon item={group} active={active} />
              <span className="truncate max-lg:hidden">{group.label}</span>
            </Link>
            <button
              type="button"
              onClick={() => onToggle(group.id)}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={toggleLabel}
              className="absolute right-1 rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-orange/70 max-lg:hidden"
            >
              <Chevron open={open} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onToggle(group.id)}
            aria-expanded={open}
            aria-controls={panelId}
            className={rowClass(false)}
          >
            <RowIcon item={group} active={false} />
            <span className="truncate max-lg:hidden">{group.label}</span>
            <span className="ml-auto max-lg:hidden">
              <Chevron open={open} />
            </span>
          </button>
        )}
      </div>

      <ul
        id={panelId}
        hidden={!open}
        className="mt-0.5 space-y-0.5 lg:ml-4 lg:border-l lg:border-white/10 lg:pl-2"
      >
        {group.children.map((child) => (
          <NavItem
            key={child.kind === 'group' ? child.id : child.href}
            node={child}
            pathname={pathname}
            collapsed={collapsed}
            onToggle={onToggle}
            badge={badge}
          />
        ))}
      </ul>
    </li>
  );
}

function NavItem({
  node,
  pathname,
  collapsed,
  onToggle,
  badge,
}: {
  node: NavNode;
  pathname: string;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
  badge: NavBadges;
}) {
  if (node.kind === 'group') {
    return (
      <Group
        group={node}
        pathname={pathname}
        collapsed={collapsed}
        onToggle={onToggle}
        badge={badge}
      />
    );
  }
  return (
    <li>
      <LeafLink item={node} pathname={pathname} badge={badge} />
    </li>
  );
}

function Section({
  section,
  pathname,
  collapsed,
  onToggle,
  badge,
}: {
  section: NavSection;
  pathname: string;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
  badge: NavBadges;
}) {
  return (
    <div className="mt-5 first:mt-0 max-lg:border-t max-lg:border-white/10 max-lg:pt-3 max-lg:first:border-0 max-lg:first:pt-0">
      <p className="mb-2 flex items-center gap-3 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35 max-lg:hidden">
        {section.label}
        <span aria-hidden="true" className="h-px flex-1 bg-white/10" />
      </p>
      <ul className="space-y-0.5">
        {section.items.map((node) => (
          <NavItem
            key={node.kind === 'group' ? node.id : node.href}
            node={node}
            pathname={pathname}
            collapsed={collapsed}
            onToggle={onToggle}
            badge={badge}
          />
        ))}
      </ul>
    </div>
  );
}

function SidebarFooter({ user }: { user: AuthUser }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function onLogout() {
    // Gỡ định danh push trước — máy dùng chung không nhận cảnh báo của người trước.
    await resetPush();
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    queryClient.clear();
    router.push('/login');
  }

  return (
    <div className="mt-auto border-t border-white/10 px-3 py-3">
      <div className="flex items-center gap-3 rounded-lg px-1 py-1 max-lg:flex-col max-lg:gap-2 max-lg:px-0">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-bold tracking-wide text-white"
        >
          {initials(user.fullName)}
        </span>
        <span className="min-w-0 flex-1 max-lg:hidden">
          <span className="block truncate text-[13px] font-semibold text-white">
            {user.fullName}
          </span>
          <span className="block truncate text-[11px] text-white/45">
            {user.roles.map((role) => ROLE_LABELS[role]).join(', ')}
          </span>
        </span>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Đăng xuất"
          className="shrink-0 rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-orange/70"
        >
          <IconLogout className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set<string>());
  const badge = useNavBadges();
  const sections = buildNavSections(user);

  function onToggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <aside className="sticky top-0 flex h-[100dvh] w-64 shrink-0 flex-col self-start bg-fpt-blue-900 text-white max-lg:w-16">
      <Link
        href="/dashboard"
        className="flex items-center gap-3 px-4 py-5 max-lg:justify-center max-lg:px-0"
      >
        <BrandMark size={40} priority />
        <span className="min-w-0 max-lg:hidden">
          <span className="block font-[family-name:var(--font-display)] text-lg font-bold leading-tight">
            FCare
          </span>
          <span className="block truncate text-[11px] text-white/45">Quản lý đào tạo</span>
        </span>
      </Link>

      <nav aria-label="Điều hướng chính" className="flex-1 overflow-y-auto px-3 pb-4 max-lg:px-2">
        {sections.map((section) => (
          <Section
            key={section.id}
            section={section}
            pathname={pathname}
            collapsed={collapsed}
            onToggle={onToggle}
            badge={badge}
          />
        ))}
      </nav>

      <SidebarFooter user={user} />
    </aside>
  );
}
