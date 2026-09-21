'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import { ALERT_LEVEL_LABELS } from '../../lib/labels';
import { buildStatisticsQuery } from '../../lib/statistics-view';
import type { CareCountRow, CareDepartmentRow, CareOverview } from '../../lib/types';
import { Skeleton, SkeletonBlock } from '../ui/skeleton';

const CARD =
  'rounded-[var(--radius-card)] border border-border bg-white shadow-[var(--shadow-card)]';
const HEADING = 'font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900';
const LINK =
  'rounded-sm underline decoration-fpt-orange decoration-2 underline-offset-4 transition-colors hover:text-fpt-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue';

/** Mức càng khẩn viền càng nóng — cùng ngôn ngữ màu với badge cảnh báo. */
const LEVEL_ACCENT: Record<number, string> = {
  4: 'border-t-danger',
  3: 'border-t-fpt-orange',
  2: 'border-t-warning',
  1: 'border-t-fpt-blue',
};

function levelHref(level: number, term: string): string {
  const query = new URLSearchParams({ level: String(level) });
  if (term) query.set('term', term);
  return `/alerts?${query.toString()}`;
}

function WarnedByLevel({ rows, term }: { rows: CareOverview['warnedByLevel']; term: string }) {
  const total = rows.reduce((sum, row) => sum + row.students, 0);
  return (
    <section aria-labelledby="warned-level-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="warned-level-heading" className={HEADING}>
          Sinh viên cảnh báo trong kỳ
        </h2>
        <p className="text-sm text-muted">
          <strong className="text-ink tabular-nums">{total}</strong> SV — mỗi SV tính ở mức cao nhất
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {rows.map((row) => (
          <li key={row.level}>
            <Link
              href={levelHref(row.level, term)}
              className={`${CARD} ${LEVEL_ACCENT[row.level] ?? ''} group block border-t-4 p-4 transition-transform duration-[var(--duration-fast)] hover:-translate-y-0.5 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue`}
            >
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                {ALERT_LEVEL_LABELS[row.level] ?? `Mức ${row.level}`}
              </span>
              <span className="mt-1 block font-[family-name:var(--font-display)] text-3xl font-bold text-fpt-blue-900 tabular-nums">
                {row.students}
              </span>
              <span className="text-xs text-muted group-hover:text-fpt-orange-600">
                Xem cảnh báo →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CareFigures({ careLogs, caredStudents }: { careLogs: number; caredStudents: number }) {
  return (
    <span className="shrink-0 text-sm tabular-nums">
      <strong className="text-ink">{caredStudents}</strong>
      <span className="text-muted"> SV · {careLogs} lượt</span>
    </span>
  );
}

function StaffList({ rows, emptyText }: { rows: CareCountRow[]; emptyText: string }) {
  if (rows.length === 0) return <p className="px-4 py-3 text-sm text-muted">{emptyText}</p>;
  return (
    <ol className="divide-y divide-border">
      {rows.map((person) => (
        <li key={person.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="min-w-0 truncate text-sm text-ink">
            {person.fullName} <span className="text-xs text-muted">· {person.staffCode}</span>
          </span>
          <CareFigures careLogs={person.careLogs} caredStudents={person.caredStudents} />
        </li>
      ))}
    </ol>
  );
}

/** Một bộ môn: thanh tỷ lệ theo số SV được chăm sóc, bấm để xem thầy cô nào chăm sóc. */
function DepartmentRow({ dept, maxStudents }: { dept: CareDepartmentRow; maxStudents: number }) {
  const ratio = maxStudents > 0 ? dept.caredStudents / maxStudents : 0;
  return (
    <details className="group border-b border-border last:border-b-0">
      <summary className="flex cursor-pointer list-none flex-col gap-2 px-4 py-3 transition-colors hover:bg-fpt-orange-50/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fpt-blue">
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate font-semibold text-fpt-blue-900">
            <span
              aria-hidden
              className="mr-2 inline-block text-muted transition-transform duration-[var(--duration-fast)] group-open:rotate-90"
            >
              ›
            </span>
            {dept.name} <span className="text-xs font-normal text-muted">({dept.code})</span>
          </span>
          <CareFigures careLogs={dept.careLogs} caredStudents={dept.caredStudents} />
        </span>
        <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-surface">
          <span
            className="block h-full origin-left rounded-full bg-fpt-orange"
            style={{ transform: `scaleX(${ratio})` }}
          />
        </span>
      </summary>
      <div className="bg-surface/60">
        <StaffList
          rows={dept.lecturers}
          emptyText="Chưa có giảng viên nào ghi nhật ký chăm sóc trong kỳ."
        />
      </div>
    </details>
  );
}

function PanelSkeleton() {
  return (
    <SkeletonBlock label="Đang tải thống kê chăm sóc" className="mt-8 grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
    </SkeletonBlock>
  );
}

/**
 * Khối của Admin / Cán bộ Đào tạo / TBM: bộ môn nào chăm sóc được bao nhiêu
 * SV (theo bộ môn của người chăm sóc), thầy cô nào chăm sóc, CTSV chăm sóc bao
 * nhiêu, và số SV cảnh báo theo mức — tất cả trong một kỳ.
 */
export function CareOverviewPanel({ term }: { term: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['statistics', 'care-overview', term],
    queryFn: () => apiFetch<CareOverview>(`/statistics/care-overview${buildStatisticsQuery(term)}`),
  });

  if (isLoading) return <PanelSkeleton />;
  if (isError || !data) {
    return (
      <p
        role="alert"
        className={`${CARD} mt-8 flex flex-wrap items-center justify-between gap-3 p-5 text-sm`}
      >
        Không tải được thống kê chăm sóc.
        <button type="button" className={LINK} onClick={() => void refetch()}>
          Thử lại
        </button>
      </p>
    );
  }

  const activeTerm = term || data.term?.code || '';
  const maxStudents = Math.max(0, ...data.departments.map((dept) => dept.caredStudents));

  return (
    <div className="mt-8 grid gap-8">
      <WarnedByLevel rows={data.warnedByLevel} term={activeTerm} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="care-dept-heading">
          <h2 id="care-dept-heading" className={`${HEADING} mb-1`}>
            Chăm sóc theo bộ môn
          </h2>
          <p className="mb-3 text-sm text-muted">
            Tính theo bộ môn của người chăm sóc. Bấm vào bộ môn để xem thầy cô nào đã chăm sóc.
          </p>
          <div className={CARD}>
            {data.departments.length === 0 ? (
              <p className="p-5 text-sm text-muted">
                Không có bộ môn nào đang mở trong phạm vi của bạn.
              </p>
            ) : (
              data.departments.map((dept) => (
                <DepartmentRow key={dept.id} dept={dept} maxStudents={maxStudents} />
              ))
            )}
          </div>
        </section>

        <section aria-labelledby="care-sa-heading">
          <h2 id="care-sa-heading" className={`${HEADING} mb-1`}>
            Công tác sinh viên
          </h2>
          <p className="mb-3 text-sm text-muted">Lượt chăm sóc do cán bộ CTSV thực hiện.</p>
          <div className={`${CARD} border-t-4 border-t-success`}>
            <p className="flex items-baseline gap-2 border-b border-border px-4 py-4">
              <span className="font-[family-name:var(--font-display)] text-3xl font-bold text-fpt-blue-900 tabular-nums">
                {data.sa.caredStudents}
              </span>
              <span className="text-sm text-muted">SV · {data.sa.careLogs} lượt chăm sóc</span>
            </p>
            <StaffList
              rows={data.sa.staff}
              emptyText="CTSV chưa ghi nhật ký chăm sóc nào trong kỳ."
            />
          </div>
        </section>
      </div>
    </div>
  );
}
