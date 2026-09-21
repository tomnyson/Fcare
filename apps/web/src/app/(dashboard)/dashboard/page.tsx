'use client';

import { Badge } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AttendanceCarePanel } from '../../../components/dashboard/attendance-care-panel';
import { CareOverviewPanel } from '../../../components/dashboard/care-overview-panel';
import { MyClassesPanel } from '../../../components/dashboard/my-classes-panel';
import { WarnedStudentsPanel } from '../../../components/dashboard/warned-students-panel';
import { Select } from '../../../components/ui/form';
import { PageHeader } from '../../../components/ui/page-header';
import { Skeleton } from '../../../components/ui/skeleton';
import { StatCard } from '../../../components/ui/stat-card';
import { apiFetch } from '../../../lib/api';
import { dashboardSections } from '../../../lib/dashboard-sections';
import { useMe } from '../../../lib/hooks';
import { ALERT_LEVEL_LABELS, ALERT_LEVEL_TONES, STUDENT_STATUS_LABELS } from '../../../lib/labels';
import { buildStatisticsQuery, statisticsTabHref } from '../../../lib/statistics-view';
import type { DepartmentStatistics, StatisticsOverview } from '../../../lib/types';
import { useTerms } from '../../../lib/use-current-term';

/**
 * Bốn chỉ số chính chỉ tính trong MỘT học kỳ (mặc định kỳ hiện tại, API tự
 * chọn khi URL chưa có `term`) — không cộng dồn các kỳ.
 */
function DashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedTerm = params.get('term') ?? '';
  const terms = useTerms();
  const me = useMe();
  const sections = dashboardSections(me.data?.user.roles ?? []);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['statistics', 'overview', selectedTerm],
    queryFn: () =>
      apiFetch<StatisticsOverview>(`/statistics/overview${buildStatisticsQuery(selectedTerm)}`),
  });
  const { data: deptStats, isLoading: deptStatsLoading } = useQuery({
    queryKey: ['statistics', 'departments'],
    queryFn: () => apiFetch<DepartmentStatistics[]>('/statistics/departments'),
  });

  const activeTerm = selectedTerm || overview?.term?.code || '';
  // Chờ API chốt kỳ hiện tại rồi mới tải các khối theo vai trò — tránh gọi hai lần (không kỳ → có kỳ).
  const termReady = !overviewLoading;
  const openAlerts = (overview?.openAlertsByLevel ?? []).reduce(
    (sum, group) => sum + group.count,
    0,
  );

  function selectTerm(code: string) {
    const next = new URLSearchParams(params.toString());
    if (code) next.set('term', code);
    else next.delete('term');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description={
          overview?.term
            ? `Số liệu học kỳ ${overview.term.name} (${overview.term.code}) — không cộng dồn các kỳ, trong phạm vi bạn được phép truy cập.`
            : 'Bức tranh học vụ theo học kỳ, trong phạm vi bạn được phép truy cập.'
        }
        actions={
          <label className="flex items-center gap-2 text-sm font-semibold text-muted">
            Học kỳ
            <Select
              aria-label="Chọn học kỳ thống kê"
              value={activeTerm}
              onChange={(event) => selectTerm(event.target.value)}
              disabled={terms.isLoading}
            >
              {activeTerm === '' ? <option value="">Chưa có học kỳ</option> : null}
              {(terms.data ?? []).map((term) => (
                <option key={term.id} value={term.code}>
                  {term.code} — {term.name}
                </option>
              ))}
            </Select>
          </label>
        }
      />

      <AttendanceCarePanel />

      <section
        aria-label="Chỉ số chính trong học kỳ"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Tổng sinh viên"
          value={overview?.totalStudents ?? '—'}
          accent="blue"
          isLoading={overviewLoading}
          hint="Có đăng ký lớp học phần trong kỳ"
        />
        <StatCard
          label="Cảnh báo đang mở"
          value={openAlerts}
          accent="red"
          isLoading={overviewLoading}
          hint={(overview?.openAlertsByLevel ?? [])
            .map((group) => `${ALERT_LEVEL_LABELS[group.level] ?? group.level}: ${group.count}`)
            .join(' · ')}
        />
        <StatCard
          label="SV diện cảnh báo"
          value={overview?.warnedStudents ?? '—'}
          accent="orange"
          isLoading={overviewLoading}
          hint="Có cảnh báo chưa giải quyết trong kỳ"
        />
        <StatCard
          label="Lượt chăm sóc trong kỳ"
          value={overview?.careLogsInTerm ?? '—'}
          accent="green"
          isLoading={overviewLoading}
          hint={overview ? `7 ngày qua: ${overview.careLogsLast7Days}` : undefined}
        />
      </section>

      {termReady && sections.careOverview ? <CareOverviewPanel term={activeTerm} /> : null}

      {termReady && sections.warnedStudents ? (
        <WarnedStudentsPanel
          term={activeTerm}
          title="Sinh viên đang cảnh báo"
          description="Cảnh báo chưa giải quyết trong kỳ, mức khẩn cấp lên trước. Bấm vào sinh viên để chăm sóc."
        />
      ) : null}

      {termReady && sections.myClasses && me.data ? (
        <>
          <MyClassesPanel term={activeTerm} lecturerId={me.data.user.id} />
          <WarnedStudentsPanel
            term={activeTerm}
            lecturerId={me.data.user.id}
            title="Sinh viên cần chăm sóc"
            description="Sinh viên thuộc các lớp bạn đứng đang có cảnh báo chưa giải quyết."
          />
        </>
      ) : null}

      <section aria-labelledby="dept-stats-heading" className="mt-8">
        <h2
          id="dept-stats-heading"
          className="mb-3 font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900"
        >
          Theo bộ môn
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {deptStatsLoading
            ? // Ba thẻ giữ chỗ đúng cỡ thẻ thật để lưới không nhảy khi dữ liệu về.
              Array.from({ length: 3 }, (_, index) => (
                <article
                  key={`dept-skeleton-${index}`}
                  aria-hidden
                  className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]"
                >
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="mt-2 h-3.5 w-52" />
                  <div className="mt-4 flex gap-2">
                    <Skeleton className="h-6 w-24 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                </article>
              ))
            : (deptStats ?? []).map((department) => (
                <article
                  key={department.id}
                  className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-fpt-blue-900">{department.name}</h3>
                      <p className="text-xs text-muted">
                        {department.code} · {department.totalStudents} SV
                        {department.totalStaff !== null ? ` · ${department.totalStaff} GV/NV` : ''}
                      </p>
                    </div>
                    {department.openAlerts > 0 ? (
                      <Badge tone={ALERT_LEVEL_TONES[4]}>{department.openAlerts} cảnh báo</Badge>
                    ) : (
                      <Badge tone="success">Ổn định</Badge>
                    )}
                  </div>
                  <ul className="mt-4 flex flex-wrap gap-2 text-xs">
                    {department.studentsByStatus.map((group) => (
                      <li
                        key={group.status}
                        className="rounded-full bg-surface px-3 py-1 text-muted"
                      >
                        {STUDENT_STATUS_LABELS[group.status]}: <strong>{group.count}</strong>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
        </div>
      </section>

      <p className="mt-6">
        <Link
          href={statisticsTabHref('classes', activeTerm)}
          className="rounded-sm underline decoration-fpt-orange decoration-2 underline-offset-4 transition-colors hover:text-fpt-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue"
        >
          Xem kết quả theo lớp học phần và thống kê chi tiết →
        </Link>
      </p>
    </>
  );
}

export default function DashboardPage() {
  // useSearchParams bắt buộc phải nằm trong Suspense ở App Router.
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}
