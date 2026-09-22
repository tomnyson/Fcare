import { notFound } from 'next/navigation';
import { StatisticsView } from '../../../../components/statistics/statistics-view';
import { isStatisticsTabKey } from '../../../../lib/statistics-view';

export default async function StatisticsTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!isStatisticsTabKey(tab)) {
    notFound();
  }
  return <StatisticsView tab={tab} />;
}
