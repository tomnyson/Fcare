import { redirect } from 'next/navigation';
import { StatisticsView } from '../../../../components/statistics/statistics-view';
import {
  DEFAULT_STATISTICS_TAB,
  isStatisticsTabKey,
  statisticsTabHref,
} from '../../../../lib/statistics-view';

export default async function StatisticsTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!isStatisticsTabKey(tab)) {
    redirect(statisticsTabHref(DEFAULT_STATISTICS_TAB, ''));
  }
  return <StatisticsView tab={tab} />;
}
