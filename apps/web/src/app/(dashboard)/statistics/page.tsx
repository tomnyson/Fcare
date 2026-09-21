import { redirect } from 'next/navigation';
import { parseStatisticsView, statisticsTabHref } from '../../../lib/statistics-view';

/**
 * Link cũ dạng `/statistics?tab=care&term=FA26` vẫn dùng được: chuyển sang
 * route con `/statistics/care?term=FA26`, giữ nguyên học kỳ.
 */
export default async function StatisticsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const { tab, term } = parseStatisticsView(params);
  redirect(statisticsTabHref(tab, term));
}
