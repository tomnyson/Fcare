'use client';

import { Badge } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import { ALERT_LEVEL_LABELS, ALERT_LEVEL_TONES, formatDate } from '../../lib/labels';
import type { Alert, Paginated } from '../../lib/types';
import { Skeleton, SkeletonBlock } from '../ui/skeleton';

const CARD =
  'rounded-[var(--radius-card)] border border-border bg-white shadow-[var(--shadow-card)]';
const LINK =
  'rounded-sm underline decoration-fpt-orange decoration-2 underline-offset-4 transition-colors hover:text-fpt-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue';
const PREVIEW_LIMIT = 8;

interface WarnedStudentsPanelProps {
  term: string;
  title: string;
  description: string;
  /** Có giá trị → chỉ cảnh báo của SV trong lớp giảng viên này đứng. */
  lecturerId?: string;
}

function alertsPath(term: string, lecturerId?: string): string {
  const query = new URLSearchParams({ openOnly: 'true', limit: String(PREVIEW_LIMIT) });
  if (term) query.set('term', term);
  if (lecturerId) query.set('lecturerId', lecturerId);
  return `/alerts?${query.toString()}`;
}

function allAlertsHref(term: string, lecturerId?: string): string {
  const query = new URLSearchParams();
  if (term) query.set('term', term);
  if (lecturerId) query.set('lecturerId', lecturerId);
  const qs = query.toString();
  return qs ? `/alerts?${qs}` : '/alerts';
}

function AlertRow({ alert }: { alert: Alert }) {
  const student = alert.student;
  const body = (
    <>
      <Badge tone={ALERT_LEVEL_TONES[alert.level] ?? 'info'}>
        {ALERT_LEVEL_LABELS[alert.level] ?? `Mức ${alert.level}`}
      </Badge>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-fpt-blue-900">
          {student?.fullName ?? 'Sinh viên'}
        </span>
        <span className="block truncate text-xs text-muted">
          {student?.studentCode}
          {student?.classCode ? ` · ${student.classCode}` : ''}
          {alert.classSection ? ` · ${alert.classSection.code}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-xs text-muted tabular-nums">
        {formatDate(alert.createdAt)}
      </span>
    </>
  );
  if (!student) return <li className="flex items-center gap-3 px-4 py-3">{body}</li>;
  return (
    <li>
      <Link
        href={`/students/${student.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-fpt-orange-50/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fpt-blue"
      >
        {body}
      </Link>
    </li>
  );
}

/**
 * Sinh viên đang có cảnh báo chưa giải quyết — CTSV xem toàn trường,
 * giảng viên xem SV trong lớp mình đứng (phạm vi vẫn do API chặn).
 */
export function WarnedStudentsPanel({
  term,
  title,
  description,
  lecturerId,
}: WarnedStudentsPanelProps) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['alerts', 'open-preview', term, lecturerId ?? ''],
    queryFn: () => apiFetch<Paginated<Alert>>(alertsPath(term, lecturerId)),
  });
  const headingId = lecturerId ? 'my-warned-heading' : 'warned-students-heading';

  return (
    <section aria-labelledby={headingId} className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id={headingId}
            className="font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900"
          >
            {title}
            {data ? (
              <span className="ml-2 text-sm font-normal text-muted tabular-nums">
                ({data.meta.total})
              </span>
            ) : null}
          </h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
        <Link href={allAlertsHref(term, lecturerId)} className={`${LINK} text-sm font-semibold`}>
          Xem tất cả
        </Link>
      </div>
      <div className={CARD}>
        {isLoading ? (
          <SkeletonBlock label="Đang tải sinh viên cảnh báo" className="grid gap-2 p-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </SkeletonBlock>
        ) : isError || !data ? (
          <p role="alert" className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
            Không tải được danh sách cảnh báo.
            <button type="button" className={LINK} onClick={() => void refetch()}>
              Thử lại
            </button>
          </p>
        ) : data.items.length === 0 ? (
          <p className="p-5 text-sm text-muted">Không có sinh viên nào đang cảnh báo.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
