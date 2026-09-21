'use client';

import type { ReactNode } from 'react';
import { ShellSkeleton } from '../../components/dashboard/shell-skeleton';
import { Sidebar } from '../../components/dashboard/sidebar';
import { Topbar } from '../../components/dashboard/topbar';
import { useMe } from '../../lib/hooks';
import { useMonitoringUser } from '../../lib/monitoring/use-monitoring-user';
import { usePushIdentity } from '../../lib/push/use-push-subscription';
import { useSessionKeepAlive } from '../../lib/use-session-keep-alive';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { data, isLoading } = useMe();
  useSessionKeepAlive();
  usePushIdentity(data?.user.id);
  useMonitoringUser(data?.user.id);

  if (isLoading || !data) {
    return <ShellSkeleton />;
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar user={data.user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={data.user} />
        <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-24">{children}</main>
      </div>
    </div>
  );
}
