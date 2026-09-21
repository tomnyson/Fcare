'use client';

import { Badge } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import { classStudentsHref } from '../../lib/dashboard-sections';
import type { ClassSection } from '../../lib/types';
import { Skeleton, SkeletonBlock } from '../ui/skeleton';

const CARD =
  'rounded-[var(--radius-card)] border border-border bg-white shadow-[var(--shadow-card)]';

function sectionsPath(term: string, lecturerId: string): string {
  const query = new URLSearchParams({ lecturerId });
  if (term) query.set('term', term);
  return `/class-sections?${query.toString()}`;
}

function ClassCard({ section, term }: { section: ClassSection; term: string }) {
  const alerts = section.openAlertCount ?? 0;
  return (
    <li>
      <Link
        href={classStudentsHref(section.id, term || section.term)}
        className={`${CARD} group flex h-full flex-col gap-2 p-4 transition-transform duration-[var(--duration-fast)] hover:-translate-y-0.5 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue ${alerts > 0 ? 'border-l-4 border-l-fpt-orange' : ''}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900">
            {section.code}
          </span>
          {alerts > 0 ? (
            <Badge tone="warning">{alerts} cảnh báo</Badge>
          ) : (
            <Badge tone="success">Ổn định</Badge>
          )}
        </span>
        <span className="line-clamp-2 text-sm text-ink">{section.subject?.name ?? '—'}</span>
        <span className="mt-auto flex items-center justify-between text-xs text-muted">
          <span className="tabular-nums">
            {section.block ? `Block ${section.block} · ` : ''}
            {section._count?.enrollments ?? 0} SV
          </span>
          <span className="font-semibold text-fpt-blue group-hover:text-fpt-orange-600">
            Xem sinh viên →
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Người đứng lớp: các lớp đang dạy trong kỳ, bấm vào là tới danh sách SV để chăm sóc. */
export function MyClassesPanel({ term, lecturerId }: { term: string; lecturerId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['class-sections', 'mine', term, lecturerId],
    queryFn: () => apiFetch<ClassSection[]>(sectionsPath(term, lecturerId)),
  });

  // Lớp có SV cảnh báo lên đầu để thầy cô xử lý trước.
  const sections = [...(data ?? [])].sort(
    (a, b) => (b.openAlertCount ?? 0) - (a.openAlertCount ?? 0) || a.code.localeCompare(b.code),
  );

  return (
    <section aria-labelledby="my-classes-heading" className="mt-8">
      <h2
        id="my-classes-heading"
        className="mb-1 font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900"
      >
        Lớp tôi đang dạy
      </h2>
      <p className="mb-3 text-sm text-muted">Bấm vào lớp để xem sinh viên và chăm sóc ngay.</p>
      {isLoading ? (
        <SkeletonBlock
          label="Đang tải lớp đang dạy"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-[var(--radius-card)]" />
          ))}
        </SkeletonBlock>
      ) : isError ? (
        <p
          role="alert"
          className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-5 text-sm`}
        >
          Không tải được danh sách lớp.
          <button
            type="button"
            className="rounded-sm underline decoration-fpt-orange decoration-2 underline-offset-4 hover:text-fpt-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue"
            onClick={() => void refetch()}
          >
            Thử lại
          </button>
        </p>
      ) : sections.length === 0 ? (
        <p className={`${CARD} p-5 text-sm text-muted`}>Kỳ này bạn chưa được phân công lớp nào.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <ClassCard key={section.id} section={section} term={term} />
          ))}
        </ul>
      )}
    </section>
  );
}
