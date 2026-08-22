'use client';

import type { ReactNode } from 'react';
import { Sidebar } from '../../components/dashboard/sidebar';
import { Topbar } from '../../components/dashboard/topbar';
import { useMe } from '../../lib/hooks';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { data, isLoading } = useMe();

  if (isLoading || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface">
        <p className="text-sm text-muted" role="status">
          Đang tải phiên làm việc…
        </p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar user={data.user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={data.user} />
        <main className="min-w-0 flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
