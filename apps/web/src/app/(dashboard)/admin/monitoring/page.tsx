'use client';

import { Button, SurfaceCard } from '@fcare/ui-kit';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { ErrorGroupsTable } from '../../../../components/admin/error-groups-table';
import {
  MONITORING_SETTINGS_KEY,
  MonitoringSettingsCard,
} from '../../../../components/admin/monitoring-settings-card';
import { FormError, FormSuccess, Label, Select } from '../../../../components/ui/form';
import { Modal } from '../../../../components/ui/modal';
import { PageHeader } from '../../../../components/ui/page-header';
import { Pagination } from '../../../../components/ui/pagination';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useMe } from '../../../../lib/hooks';
import { pageCount } from '../../../../lib/pagination';
import {
  buildErrorGroupsQuery,
  ERROR_GROUPS_PAGE_SIZE,
  formatWeekRange,
  LEVEL_LABEL,
  parseMonitoringFilters,
  weekParamOf,
  type ErrorGroupView,
  type MonitoringSettingsView,
  type WeekSummary,
} from '../../../../lib/system-monitoring';

interface Paginated<T> {
  items: T[];
  meta: { total: number; page: number; limit: number };
}

const WEEKS_KEY = ['admin', 'monitoring', 'weeks'] as const;
const ERRORS_KEY = ['admin', 'monitoring', 'errors'] as const;

function LockedCard() {
  return (
    <SurfaceCard className="mx-auto max-w-lg p-8 text-center">
      <p className="text-4xl" aria-hidden="true">
        🔒
      </p>
      <p className="mt-3 font-display text-lg font-semibold text-fpt-blue-900">
        Chỉ quản trị viên mới xem được nhật ký lỗi hệ thống.
      </p>
      <p className="mt-1 text-sm text-muted">Gặp sự cố? Liên hệ quản trị viên FCare.</p>
    </SurfaceCard>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <SurfaceCard className="mx-auto max-w-lg p-8 text-center">
      <p className="text-4xl" aria-hidden="true">
        ⚠️
      </p>
      <p className="mt-3 font-medium text-ink">Không tải được cấu hình giám sát.</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md px-4 py-2 text-sm font-semibold text-fpt-blue underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange"
      >
        Thử tải lại
      </button>
    </SurfaceCard>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải trang giám sát">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="h-72 animate-pulse rounded-[var(--radius-card)] bg-border/60 motion-reduce:animate-none" />
        <div className="h-[28rem] animate-pulse rounded-[var(--radius-card)] bg-border/60 motion-reduce:animate-none" />
      </div>
      <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-border/60 motion-reduce:animate-none" />
    </div>
  );
}

interface WeeksCardProps {
  weeks: WeekSummary[];
  selectedWeek: string;
  onSelectWeek: (week: string) => void;
  retentionDays: number;
  onPurge: () => void;
}

/** Số liệu tuần đang xem + cột theo 12 tuần gần nhất (bấm cột để lọc tuần). */
function WeeksCard({ weeks, selectedWeek, onSelectWeek, retentionDays, onPurge }: WeeksCardProps) {
  const selected = weeks.find((w) => weekParamOf(w.weekStart) === selectedWeek) ?? null;
  const totals = selected
    ? { events: selected.totalEvents, groups: selected.groupCount }
    : weeks.reduce(
        (acc, w) => ({ events: acc.events + w.totalEvents, groups: acc.groups + w.groupCount }),
        { events: 0, groups: 0 },
      );
  const max = Math.max(1, ...weeks.map((w) => w.totalEvents));
  const bars = [...weeks].reverse();

  return (
    <SurfaceCard className="flex flex-col gap-6 p-6" aria-labelledby="monitoring-weeks-heading">
      <div>
        <h2
          id="monitoring-weeks-heading"
          className="text-xs font-semibold tracking-wide text-muted uppercase"
        >
          {selected ? `Tuần ${formatWeekRange(selected.weekStart)}` : 'Toàn bộ log đang lưu'}
        </h2>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
          <span className="font-display text-5xl font-bold text-fpt-blue-900 tabular-nums">
            {totals.events.toLocaleString('vi-VN')}
          </span>
          <span className="text-sm text-muted">
            lần lỗi · <span className="font-semibold text-ink tabular-nums">{totals.groups}</span>{' '}
            nhóm
          </span>
        </p>
      </div>

      {bars.length > 0 ? (
        <div>
          <div
            className="flex h-28 items-end gap-1.5 border-b border-border"
            role="group"
            aria-label="Số lần lỗi theo tuần — chọn một tuần để lọc"
          >
            {bars.map((week) => {
              const param = weekParamOf(week.weekStart);
              const active = param === selectedWeek;
              return (
                <button
                  key={week.weekStart}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Tuần ${formatWeekRange(week.weekStart)}: ${week.totalEvents} lần lỗi`}
                  title={`${formatWeekRange(week.weekStart)} · ${week.totalEvents} lần`}
                  onClick={() => onSelectWeek(active ? '' : param)}
                  className="group flex h-full min-w-0 flex-1 items-end rounded-t-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange"
                >
                  <span
                    className={`block w-full rounded-t-sm transition-opacity duration-[var(--duration-fast)] group-hover:opacity-80 ${
                      active ? 'bg-fpt-orange' : 'bg-fpt-blue-900/70'
                    }`}
                    style={{ height: `${Math.max(4, (week.totalEvents / max) * 100)}%` }}
                  />
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex justify-between text-xs text-muted tabular-nums">
            <span>{formatWeekRange(bars[0].weekStart).split(' – ')[0]}</span>
            <span>{bars.length} tuần gần nhất</span>
          </p>
        </div>
      ) : (
        <p className="rounded-md bg-success/10 px-4 py-3 text-sm font-medium text-success">
          ✅ Chưa có lỗi nào trong thời gian lưu trữ.
        </p>
      )}

      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          Tự dọn nhóm lỗi không tái diễn quá{' '}
          <span className="font-semibold text-ink tabular-nums">{retentionDays} ngày</span> lúc 03:00
          hằng ngày.
        </p>
        <Button type="button" variant="ghost" onClick={onPurge}>
          Dọn ngay
        </Button>
      </div>
    </SurfaceCard>
  );
}

function PurgeDialog({
  open,
  retentionDays,
  onClose,
}: {
  open: boolean;
  retentionDays: number;
  onClose: (message?: string) => void;
}) {
  const queryClient = useQueryClient();
  const purge = useMutation({
    mutationFn: () =>
      apiFetch<{ deleted: number }>('/admin/monitoring/errors', { method: 'DELETE' }),
    onSuccess: async ({ deleted }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WEEKS_KEY }),
        queryClient.invalidateQueries({ queryKey: ERRORS_KEY }),
      ]);
      onClose(
        deleted > 0 ? `Đã dọn ${deleted} nhóm lỗi quá hạn.` : 'Không có nhóm lỗi nào quá hạn.',
      );
    },
  });

  return (
    <Modal title="Dọn log lỗi quá hạn?" open={open} onClose={() => onClose()}>
      <div className="space-y-4">
        <p className="text-sm text-ink">
          Xoá vĩnh viễn các nhóm lỗi lần cuối xảy ra cách đây hơn{' '}
          <span className="font-semibold tabular-nums">{retentionDays} ngày</span>. Nhóm còn tái
          diễn gần đây được giữ lại.
        </p>
        {purge.isError ? (
          <FormError>
            {purge.error instanceof ApiError ? purge.error.message : 'Không dọn được log.'}
          </FormError>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onClose()} disabled={purge.isPending}>
            Huỷ
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => purge.mutate()}
            disabled={purge.isPending}
          >
            {purge.isPending ? 'Đang dọn…' : 'Dọn ngay'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MonitoringPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const isAdmin = me?.user.roles.includes('ADMIN') ?? false;
  const filters = parseMonitoringFilters(params);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState('');

  // Đổi bộ lọc → về trang 1, trừ khi patch tự đặt `page`.
  function setFilters(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries({ page: null, ...patch })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const settingsQuery = useQuery({
    queryKey: MONITORING_SETTINGS_KEY,
    queryFn: () => apiFetch<MonitoringSettingsView>('/admin/monitoring/settings'),
    enabled: isAdmin,
  });
  const weeksQuery = useQuery({
    queryKey: WEEKS_KEY,
    queryFn: () => apiFetch<WeekSummary[]>('/admin/monitoring/weeks'),
    enabled: isAdmin,
  });
  const errorsQuery = useQuery({
    queryKey: [...ERRORS_KEY, filters],
    queryFn: () =>
      apiFetch<Paginated<ErrorGroupView>>(
        `/admin/monitoring/errors?${buildErrorGroupsQuery(filters, ERROR_GROUPS_PAGE_SIZE).toString()}`,
      ),
    enabled: isAdmin,
    placeholderData: keepPreviousData,
  });

  const view = settingsQuery.data;
  const weeks = weeksQuery.data ?? [];
  const errors = errorsQuery.data;
  const totalPages = errors ? pageCount(errors.meta.total, errors.meta.limit) : 1;
  const filtered = Boolean(filters.week || filters.level);

  let body: ReactNode;
  if (me && !isAdmin) {
    body = <LockedCard />;
  } else if (settingsQuery.isError) {
    const err = settingsQuery.error;
    body = (
      <ErrorCard
        message={err instanceof ApiError ? err.message : 'Máy chủ không phản hồi.'}
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  } else if (!view) {
    body = <LoadingSkeleton />;
  } else {
    body = (
      <div className="space-y-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <WeeksCard
            weeks={weeks}
            selectedWeek={filters.week}
            onSelectWeek={(week) => setFilters({ week: week || null })}
            retentionDays={view.retentionDays}
            onPurge={() => {
              setPurgeMessage('');
              setPurgeOpen(true);
            }}
          />
          <MonitoringSettingsCard key={view.updatedAt ?? 'env'} view={view} />
        </div>

        <section aria-labelledby="monitoring-groups-heading" className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="monitoring-groups-heading"
                className="font-display text-lg font-semibold text-fpt-blue-900"
              >
                Nhóm lỗi
              </h2>
              <p className="text-sm text-muted">
                Lỗi giống nhau trong cùng một tuần được gộp lại, xếp theo số lần xảy ra.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:w-auto sm:min-w-[26rem]">
              <div>
                <Label htmlFor="monitoring-week" className="text-xs">
                  Tuần
                </Label>
                <Select
                  id="monitoring-week"
                  value={filters.week}
                  onChange={(e) => setFilters({ week: e.target.value || null })}
                >
                  <option value="">Mọi tuần</option>
                  {filters.week && !weeks.some((w) => weekParamOf(w.weekStart) === filters.week) ? (
                    <option value={filters.week}>Tuần {filters.week}</option>
                  ) : null}
                  {weeks.map((w) => (
                    <option key={w.weekStart} value={weekParamOf(w.weekStart)}>
                      {formatWeekRange(w.weekStart)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="monitoring-level" className="text-xs">
                  Mức độ
                </Label>
                <Select
                  id="monitoring-level"
                  value={filters.level}
                  onChange={(e) => setFilters({ level: e.target.value || null })}
                >
                  <option value="">Mọi mức</option>
                  <option value="FATAL">{LEVEL_LABEL.FATAL}</option>
                  <option value="ERROR">{LEVEL_LABEL.ERROR}</option>
                </Select>
              </div>
            </div>
          </div>

          {purgeMessage ? <FormSuccess>{purgeMessage}</FormSuccess> : null}
          {errorsQuery.isError ? (
            <FormError>
              {errorsQuery.error instanceof ApiError
                ? errorsQuery.error.message
                : 'Không tải được danh sách lỗi.'}
            </FormError>
          ) : null}

          <ErrorGroupsTable
            groups={errors?.items ?? []}
            isLoading={errorsQuery.isPending}
            isRefreshing={errorsQuery.isFetching}
            skeletonRows={8}
            filtered={filtered}
            onClearFilters={() => setFilters({ week: null, level: null })}
          />
          <Pagination
            page={filters.page}
            totalPages={totalPages}
            onPageChange={(page) => setFilters({ page: String(page) })}
            isLoading={errorsQuery.isFetching}
            total={errors?.meta.total}
            limit={errors?.meta.limit}
            label="Phân trang nhóm lỗi"
          />
        </section>

        <PurgeDialog
          open={purgeOpen}
          retentionDays={view.retentionDays}
          onClose={(message) => {
            setPurgeOpen(false);
            if (message) setPurgeMessage(message);
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Giám sát lỗi"
        description="Lỗi máy chủ được gom theo tuần và báo cáo lên Discord mỗi sáng thứ Hai."
      />
      {body}
    </div>
  );
}

export default function AdminMonitoringPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <MonitoringPageContent />
    </Suspense>
  );
}
