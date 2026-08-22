'use client';

import { canUseExcelIo } from '@fcare/shared-types';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MASTER_DATA_TABS } from '../../lib/master-data-tabs';
import type { AuthUser } from '../../lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  visible: (user: AuthUser) => boolean;
}

const TOP_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Tổng quan', icon: '▦', visible: () => true },
  { href: '/students', label: 'Sinh viên', icon: '⛉', visible: () => true },
  { href: '/alerts', label: 'Cảnh báo', icon: '⚠', visible: () => true },
];

const TRAINING_ICONS: Record<string, string> = {
  departments: '◫',
  majors: '✦',
  subjects: '▤',
  'class-sections': '☰',
};

const BOTTOM_ITEMS: NavItem[] = [
  {
    href: '/import-export',
    label: 'Import / Export',
    icon: '⇅',
    visible: (user) => canUseExcelIo(user.roles),
  },
  {
    href: '/admin/users',
    label: 'Người dùng',
    icon: '⚙',
    visible: (user) => user.roles.includes('ADMIN'),
  },
];

function NavLink({
  href,
  label,
  icon,
  active,
  nested = false,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  nested?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors max-lg:justify-center max-lg:px-2 ${
        nested ? 'py-2 lg:ml-4 lg:text-[13px]' : ''
      } ${
        active
          ? 'border-l-4 border-fpt-orange bg-white/10 text-white'
          : 'border-l-4 border-transparent text-white/70 hover:bg-white/5 hover:text-white'
      }`}
    >
      <span aria-hidden className="text-base">
        {icon}
      </span>
      <span className="max-lg:hidden">{label}</span>
    </Link>
  );
}

export function Sidebar({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-fpt-blue-900 text-white max-lg:w-16">
      <Link href="/dashboard" className="flex items-center gap-3 px-5 py-5 max-lg:justify-center max-lg:px-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fpt-orange font-[family-name:var(--font-display)] text-lg font-extrabold">
          F
        </span>
        <span className="font-[family-name:var(--font-display)] text-lg font-bold max-lg:hidden">
          FCare
        </span>
      </Link>

      <nav aria-label="Điều hướng chính" className="mt-2 flex-1 space-y-1 px-3 max-lg:px-2">
        {TOP_ITEMS.filter((item) => item.visible(user)).map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(item.href)}
          />
        ))}

        <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-white/40 max-lg:hidden">
          Đào tạo
        </p>
        <div aria-hidden className="mx-3 mt-4 border-t border-white/10 lg:hidden" />
        {MASTER_DATA_TABS.map((tab) => (
          <NavLink
            key={tab.key}
            href={`/master-data/${tab.key}`}
            label={tab.label}
            icon={TRAINING_ICONS[tab.key] ?? '▪'}
            active={isActive(`/master-data/${tab.key}`)}
            nested
          />
        ))}

        <div aria-hidden className="mx-3 my-3 border-t border-white/10" />
        {BOTTOM_ITEMS.filter((item) => item.visible(user)).map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(item.href)}
          />
        ))}
      </nav>

      <p className="px-5 py-4 text-[11px] leading-relaxed text-white/40 max-lg:hidden">
        Dữ liệu sinh viên là bảo mật.
        <br />
        Không chia sẻ ra ngoài hệ thống.
      </p>
    </aside>
  );
}
