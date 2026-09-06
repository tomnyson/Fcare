'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useMe } from '../../../lib/hooks';
import { canViewTrainingArea } from '../../../lib/master-data-tabs';
import { PageSkeleton } from '../../../components/dashboard/shell-skeleton';

export default function MasterDataLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, isLoading } = useMe();
  const canView = data ? canViewTrainingArea(data.user.roles) : false;

  useEffect(() => {
    if (!isLoading && data && !canView) {
      router.replace('/dashboard');
    }
  }, [canView, data, isLoading, router]);

  if (isLoading || !data || !canView) {
    return (
      <div role="status" aria-busy aria-label="Đang chuyển trang">
        <PageSkeleton />
      </div>
    );
  }

  return children;
}
