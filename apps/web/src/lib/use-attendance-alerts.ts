import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import { POLL_INTERVAL_MS } from './hooks';
import type { PendingAttendanceAlertsResult, PendingScope } from './types';

const STALE_MS = 30_000;

/**
 * Cảnh báo điểm danh đang chờ chăm sóc trong học kỳ `term`.
 * `owned` = chỉ lớp mình đứng lớp và mình chưa chăm sóc (hiện LIÊN TỤC trên dashboard);
 * `all` = mọi cảnh báo điểm danh trong phạm vi được xem (TBM rà bộ môn).
 * Làm mới theo chu kỳ polling chung; SSE `alertId` sẽ invalidate sớm hơn.
 */
export function usePendingAttendanceAlerts(
  term: string | null | undefined,
  scope: PendingScope = 'owned',
) {
  return useQuery({
    queryKey: ['attendance-alerts', term, scope],
    queryFn: () =>
      apiFetch<PendingAttendanceAlertsResult>(
        `/attendance-alerts/pending?term=${encodeURIComponent(term ?? '')}&scope=${scope}`,
      ),
    enabled: Boolean(term),
    staleTime: STALE_MS,
    refetchInterval: POLL_INTERVAL_MS,
  });
}
