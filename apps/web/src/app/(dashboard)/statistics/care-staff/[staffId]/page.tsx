import { Suspense } from 'react';
import { CareStaffLogsView } from '../../../../../components/statistics/care-staff-logs-view';

export default async function CareStaffLogsPage({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  const { staffId } = await params;
  return (
    <Suspense>
      <CareStaffLogsView staffId={staffId} />
    </Suspense>
  );
}
