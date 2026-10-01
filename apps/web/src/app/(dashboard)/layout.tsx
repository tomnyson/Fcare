'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AccessDenied } from '../../components/errors/error-screen';
import { LockOverlay } from '../../components/dashboard/lock-overlay';
import { ShellSkeleton } from '../../components/dashboard/shell-skeleton';
import { Sidebar } from '../../components/dashboard/sidebar';
import { Topbar } from '../../components/dashboard/topbar';
import { useMe } from '../../lib/hooks';
import { canAccessRoute } from '../../lib/route-access';
import { useMonitoringUser } from '../../lib/monitoring/use-monitoring-user';
import { usePushIdentity } from '../../lib/push/use-push-subscription';
import { usePinLock } from '../../lib/use-pin-lock';
import { useSessionKeepAlive } from '../../lib/use-session-keep-alive';

const DEFAULT_IDLE_LOCK_MINUTES = 15;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, isLoading } = useMe();
  useSessionKeepAlive();
  usePushIdentity(data?.user.id);
  useMonitoringUser(data?.user.id);
  const pinLock = usePinLock(
    data?.idleLockMinutes ?? DEFAULT_IDLE_LOCK_MINUTES,
    data?.locked ?? false,
  );
  const needsPinSetup = Boolean(data?.requiresPinSetup);

  useEffect(() => {
    if (needsPinSetup) router.replace('/setup-pin');
  }, [needsPinSetup, router]);

  if (isLoading || !data || needsPinSetup) {
    return <ShellSkeleton />;
  }

  return (
    <>
      <AppShell locked={pinLock.locked}>
        <Sidebar user={data.user} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={data.user} />
          <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-24">
            {canAccessRoute(pathname, data.user.roles) ? children : <AccessDenied />}
          </main>
        </div>
      </AppShell>
      {pinLock.locked ? (
        <LockOverlay fullName={data.user.fullName} onUnlocked={pinLock.unlock} />
      ) : null}
    </>
  );
}

/** Khi khoá: trang vẫn mounted nhưng `inert` — Tab không lọt ra sau màn khoá. */
function AppShell({ locked, children }: { locked: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface" inert={locked} aria-hidden={locked || undefined}>
      {children}
    </div>
  );
}
