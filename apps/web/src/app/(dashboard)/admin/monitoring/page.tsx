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
import { IconActivity, IconSettings } from '../../../../components/dashboard/nav-icons';
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
  parseMonitoringTab,
  weekParamOf,
  type ErrorGroupView,
  type MonitoringSettingsView,
  type MonitoringTab,
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
      <div className="h-14 animate-pulse rounded-[var(--radius-card)] bg-border/40" />
      <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-border/60 motion-reduce:animate-none" />
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
    <SurfaceCard className="p-6 sm:p-7" aria-labelledby="monitoring-weeks-heading">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-center">
        <div className="space-y-4 border-b border-border pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="monitoring-weeks-heading"
              className="text-xs font-bold tracking-wider text-muted uppercase"
            >
              {selected ? 'Tuần đang lọc' : 'Toàn bộ log'}
            </h2>
            {selected ? (
              <button
                type="button"
                onClick={() => onSelectWeek('')}
                className="text-xs font-semibold text-fpt-orange hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange cursor-pointer"
              >
                ✕ Bỏ lọc tuần
              </button>
            ) : null}
          </div>

          <div>
            <p className="font-display text-4xl sm:text-5xl font-bold text-fpt-blue-900 tabular-nums">
              {totals.events.toLocaleString('vi-VN')}
            </p>
            <p className="mt-1 text-sm text-muted">
              lần ghi nhận lỗi · <span className="font-semibold text-ink tabular-nums">{totals.groups}</span> nhóm lỗi
            </p>
            {selected ? (
              <p className="mt-2 inline-flex items-center rounded-md bg-fpt-orange-50 px-2.5 py-1 text-xs font-semibold text-fpt-orange-600 border border-fpt-orange/20">
                Tuần {formatWeekRange(selected.weekStart)}
              </p>
            ) : null}
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted">
                Lưu trữ: <strong className="font-semibold text-ink tabular-nums">{retentionDays} ngày</strong>
              </span>
              <Button
                type="button"
                variant="ghost"
                onClick={onPurge}
                className="text-xs border border-border"
              >
                Dọn log quá hạn
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="font-medium text-ink">Phân bố số lần lỗi 12 tuần gần nhất</span>
            <span className="tabular-nums">Bấm cột để lọc tuần</span>
          </div>

          {bars.length > 0 ? (
            <div>
              <div
                className="flex h-32 items-end gap-2 border-b border-border pb-1"
                role="group"
                aria-label="Số lần lỗi theo tuần — chọn một tuần để lọc"
              >
                {bars.map((week) => {
                  const param = weekParamOf(week.weekStart);
                  const active = param === selectedWeek;
                  const percent = Math.max(6, (week.totalEvents / max) * 100);
                  return (
                    <button
                      key={week.weekStart}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Tuần ${formatWeekRange(week.weekStart)}: ${week.totalEvents} lần lỗi`}
                      title={`${formatWeekRange(week.weekStart)} · ${week.totalEvents.toLocaleString('vi-VN')} lần lỗi (${week.groupCount} nhóm)`}
                      onClick={() => onSelectWeek(active ? '' : param)}
                      className="group relative flex h-full min-w-0 flex-1 items-end rounded-t focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange cursor-pointer"
                    >
                      <span
                        className={`block w-full rounded-t transition-all duration-[var(--duration-fast)] group-hover:opacity-90 ${
                          active
                            ? 'bg-fpt-orange shadow-sm ring-2 ring-fpt-orange/30'
                            : 'bg-fpt-blue-900/70 hover:bg-fpt-blue-900/90'
                        }`}
                        style={{ height: `${percent}%` }}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-muted tabular-nums">
                <span>{formatWeekRange(bars[0].weekStart).split(' – ')[0]}</span>
                <span className="hidden sm:inline">Tuần gần nhất: {formatWeekRange(bars[bars.length - 1].weekStart).split(' – ')[1]}</span>
                <span>{bars.length} tuần</span>
              </div>
            </div>
          ) : (
            <p className="rounded-md bg-success/10 px-4 py-3 text-sm font-medium text-success">
              ✅ Chưa có lỗi nào trong thời gian lưu trữ.
            </p>
          )}
        </div>
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
  const activeTab = parseMonitoringTab(params.get('tab'));
  const filters = parseMonitoringFilters(params);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState('');

  function handleTabChange(nextTab: MonitoringTab) {
    const next = new URLSearchParams(params.toString());
    if (nextTab === 'logs') {
      next.delete('tab');
    } else {
      next.set('tab', nextTab);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

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
    enabled: isAdmin && activeTab === 'logs',
    placeholderData: keepPreviousData,
  });

  const view = settingsQuery.data;
  const weeks = weeksQuery.data ?? [];
  const errors = errorsQuery.data;
  const totalPages = errors ? pageCount(errors.meta.total, errors.meta.limit) : 1;
  const filtered = Boolean(filters.week || filters.level);
  const totalEventsInStorage = weeks.reduce((acc, w) => acc + w.totalEvents, 0);

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
      <div className="space-y-6">
        {/* Thanh chuyển đổi 2 Tab */}
        <div
          role="tablist"
          aria-label="Phân vùng giám sát hệ thống"
          className="flex border-b border-border"
        >
          <button
            role="tab"
            id="tab-logs"
            aria-controls="panel-logs"
            aria-selected={activeTab === 'logs'}
            type="button"
            onClick={() => handleTabChange('logs')}
            className={`group flex items-center gap-2.5 border-b-2 px-5 py-3 text-sm font-semibold transition-all duration-[var(--duration-fast)] cursor-pointer ${
              activeTab === 'logs'
                ? 'border-fpt-orange text-fpt-orange'
                : 'border-transparent text-muted hover:border-border hover:text-ink'
            }`}
          >
            <IconActivity className="h-4.5 w-4.5" />
            <span>Nhật ký lỗi</span>
            {totalEventsInStorage > 0 ? (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums transition-colors ${
                  activeTab === 'logs'
                    ? 'bg-fpt-orange/10 text-fpt-orange'
                    : 'bg-border/60 text-muted group-hover:text-ink'
                }`}
              >
                {totalEventsInStorage.toLocaleString('vi-VN')}
              </span>
            ) : null}
          </button>

          <button
            role="tab"
            id="tab-settings"
            aria-controls="panel-settings"
            aria-selected={activeTab === 'settings'}
            type="button"
            onClick={() => handleTabChange('settings')}
            className={`group flex items-center gap-2.5 border-b-2 px-5 py-3 text-sm font-semibold transition-all duration-[var(--duration-fast)] cursor-pointer ${
              activeTab === 'settings'
                ? 'border-fpt-orange text-fpt-orange'
                : 'border-transparent text-muted hover:border-border hover:text-ink'
            }`}
          >
            <IconSettings className="h-4.5 w-4.5" />
            <span>Cài đặt & Báo cáo</span>
            <span
              className={`h-2 w-2 rounded-full transition-colors ${
                view.enabled && view.hasWebhook ? 'bg-success' : 'bg-border'
              }`}
              aria-hidden="true"
              title={
                view.enabled && view.hasWebhook
                  ? 'Báo cáo tự động đang hoạt động'
                  : 'Chưa cấu hình xong báo cáo'
              }
            />
          </button>
        </div>

        {/* Nội dung Tab 1: Nhật ký lỗi */}
        {activeTab === 'logs' ? (
          <div
            id="panel-logs"
            role="tabpanel"
            aria-labelledby="tab-logs"
            className="space-y-6"
          >
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

            <section aria-labelledby="monitoring-groups-heading" className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2
                    id="monitoring-groups-heading"
                    className="font-display text-lg font-semibold text-fpt-blue-900"
                  >
                    Danh sách nhóm lỗi
                  </h2>
                  <p className="text-sm text-muted">
                    Lỗi có cùng thông điệp hoặc nguồn trong tuần được gộp nhóm, sắp xếp theo số lần xảy ra.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-3 sm:w-auto">
                  <div className="w-40 sm:w-48">
                    <Label htmlFor="monitoring-week" className="text-xs">
                      Tuần
                    </Label>
                    <Select
                      id="monitoring-week"
                      value={filters.week}
                      onChange={(e) => setFilters({ week: e.target.value || null })}
                    >
                      <option value="">Mọi tuần ({weeks.length} tuần)</option>
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
                  <div className="w-32 sm:w-36">
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
                  {filtered ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFilters({ week: null, level: null })}
                      className="border border-border text-xs"
                    >
                      Bỏ lọc
                    </Button>
                  ) : null}
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
          </div>
        ) : null}

        {/* Nội dung Tab 2: Cài đặt & Báo cáo */}
        {activeTab === 'settings' ? (
          <div
            id="panel-settings"
            role="tabpanel"
            aria-labelledby="tab-settings"
            className="space-y-6"
          >
            <MonitoringSettingsCard key={view.updatedAt ?? 'env'} view={view} />
          </div>
        ) : null}

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
        description="Theo dõi nhật ký sự cố máy chủ và cấu hình báo cáo tự động qua Discord."
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
