'use client';

import { Badge } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { DataTable, Td } from '../../../components/ui/data-table';
import { PageHeader } from '../../../components/ui/page-header';
import { StatCard } from '../../../components/ui/stat-card';
import { apiFetch } from '../../../lib/api';
import {
  ALERT_LEVEL_LABELS,
  ALERT_LEVEL_TONES,
  STUDENT_STATUS_LABELS,
} from '../../../lib/labels';
import type {
  ClassStatistics,
  DepartmentStatistics,
  StatisticsOverview,
} from '../../../lib/types';

export default function DashboardPage() {
  const { data: overview } = useQuery({
    queryKey: ['statistics', 'overview'],
    queryFn: () => apiFetch<StatisticsOverview>('/statistics/overview'),
  });
  const { data: classStats } = useQuery({
    queryKey: ['statistics', 'classes'],
    queryFn: () => apiFetch<ClassStatistics[]>('/statistics/classes'),
  });
  const { data: deptStats } = useQuery({
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

      <section aria-label="Chỉ số chính" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tổng sinh viên" value={overview?.totalStudents ?? '—'} accent="blue" />
        <StatCard
          label="Cảnh báo đang mở"
          value={openAlerts}
          accent="red"
          hint={(overview?.openAlertsByLevel ?? [])
            .map((group) => `${ALERT_LEVEL_LABELS[group.level] ?? group.level}: ${group.count}`)
            .join(' · ')}
        />
        <StatCard label="SV diện cảnh báo" value={warnedStudents} accent="orange" />
        <StatCard
          label="Lượt chăm sóc 30 ngày"
          value={overview?.careLogsLast30Days ?? '—'}
          accent="green"
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
          headers={['Lớp học phần', 'Môn', 'Giảng viên', 'Sĩ số', 'Đạt', 'Trượt', 'Cấm thi', 'Tỷ lệ đạt']}
          isEmpty={(classStats ?? []).length === 0}
        >
          {(classStats ?? []).map((section) => (
            <tr key={section.id} className="transition-colors hover:bg-fpt-orange-50/40">
              <Td className="font-semibold text-ink">{section.code}</Td>
              <Td>{section.subject?.name ?? '—'}</Td>
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
          {(deptStats ?? []).map((department) => (
            <article
              key={department.id}
              className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-fpt-blue-900">{department.name}</h3>
                  <p className="text-xs text-muted">
                    {department.code} · {department.totalStudents} SV · {department.totalStaff} GV/NV
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
                  <li key={group.status} className="rounded-full bg-surface px-3 py-1 text-muted">
                    {STUDENT_STATUS_LABELS[group.status]}: <strong>{group.count}</strong>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
