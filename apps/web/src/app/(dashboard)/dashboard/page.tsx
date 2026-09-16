'use client';

import { Badge } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AttendanceCarePanel } from '../../../components/dashboard/attendance-care-panel';
import { DataTable, Td } from '../../../components/ui/data-table';
import { PageHeader } from '../../../components/ui/page-header';
import { Skeleton } from '../../../components/ui/skeleton';
import { StatCard } from '../../../components/ui/stat-card';
import { apiFetch } from '../../../lib/api';
import { ALERT_LEVEL_LABELS, ALERT_LEVEL_TONES, STUDENT_STATUS_LABELS } from '../../../lib/labels';
import type { ClassStatistics, DepartmentStatistics, StatisticsOverview } from '../../../lib/types';

export default function DashboardPage() {
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['statistics', 'overview'],
    queryFn: () => apiFetch<StatisticsOverview>('/statistics/overview'),
  });
  const { data: classStats, isLoading: classStatsLoading } = useQuery({
    queryKey: ['statistics', 'classes'],
    queryFn: () => apiFetch<ClassStatistics[]>('/statistics/classes'),
  });
  const { data: deptStats, isLoading: deptStatsLoading } = useQuery({
    queryKey: ['statistics', 'departments'],
    queryFn: () => apiFetch<DepartmentStatistics[]>('/statistics/departments'),
  });

  const openAlerts = (overview?.openAlertsByLevel ?? []).reduce(
    (sum, group) => sum + group.count,
    0,
  );
  const warnedStudents =
    overview?.studentsByStatus.find((group) => group.status === 'WARNED')?.count ?? 0;

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description="Bức tranh học vụ trong phạm vi bạn được phép truy cập."
      />

      <AttendanceCarePanel />

      <section aria-label="Chỉ số chính" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tổng sinh viên"
          value={overview?.totalStudents ?? '—'}
          accent="blue"
          isLoading={overviewLoading}
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
          value={warnedStudents}
          accent="orange"
          isLoading={overviewLoading}
        />
        <StatCard
          label="Lượt chăm sóc 30 ngày"
          value={overview?.careLogsLast30Days ?? '—'}
          accent="green"
          isLoading={overviewLoading}
        />
      </section>

      <section aria-labelledby="class-stats-heading" className="mt-8">
        <h2
          id="class-stats-heading"
          className="mb-3 font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900"
        >
          Kết quả theo lớp học phần
        </h2>
        <DataTable
          headers={[
            'Lớp học phần',
            'Môn',
            'Giảng viên',
            'Sĩ số',
            'Đạt',
            'Trượt',
            'Cấm thi',
            'Tỷ lệ đạt',
          ]}
          isLoading={classStatsLoading}
          skeletonRows={6}
          isEmpty={!classStatsLoading && (classStats ?? []).length === 0}
        >
          {(classStats ?? []).map((section) => (
            <tr key={section.id} className="transition-colors hover:bg-fpt-orange-50/40">
              <Td className="font-semibold text-ink">
                {/* Bấm mã lớp để xem thẳng danh sách sinh viên của lớp đó. */}
                <Link
                  href={`/students?sectionId=${section.id}`}
                  className="rounded-sm 
                  decoration-fpt-orange decoration-2 underline-offset-4 transition-colors hover:text-fpt-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue"
                >
                  {section.code}
                </Link>
              </Td>
              <Td>{section.subject.name}</Td>
              <Td>{section.lecturer?.fullName ?? '—'}</Td>
              <Td>{section.total}</Td>
              <Td className="font-semibold text-success">{section.pass}</Td>
              <Td className="font-semibold text-danger">{section.fail}</Td>
              <Td>{section.examBanned}</Td>
              <Td className="font-semibold">
                {section.passRate === null ? '—' : `${section.passRate}%`}
              </Td>
            </tr>
          ))}
        </DataTable>
      </section>

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
          href="/statistics"
          className="rounded-sm underline decoration-fpt-orange decoration-2 underline-offset-4 transition-colors hover:text-fpt-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue"
        >
          Xem thống kê chi tiết →
        </Link>
      </p>
    </>
  );
}
