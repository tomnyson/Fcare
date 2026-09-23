'use client';

import { Badge } from '@fcare/ui-kit';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { buildCareStaffLogsQuery } from '../../lib/care-staff-logs';
import { apiFetch } from '../../lib/api';
import { ALERT_LEVEL_TONES, CARE_CHANNEL_LABELS, formatDateTime } from '../../lib/labels';
import { pageCount, parsePageParam } from '../../lib/pagination';
import type { CareLog, CareStaffLogs, StaffRef } from '../../lib/types';
import { DeleteCareLogButton } from '../care-logs/delete-care-log-button';
import { PageHeader } from '../ui/page-header';
import { Pagination } from '../ui/pagination';
import { Skeleton, SkeletonBlock } from '../ui/skeleton';

const PAGE_SIZE = 10;
const CARD =
  'rounded-[var(--radius-card)] border border-border bg-white shadow-[var(--shadow-card)]';
const LINK =
  'rounded-sm underline decoration-fpt-orange decoration-2 underline-offset-4 transition-colors hover:text-fpt-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue';

interface LogItemProps {
  log: CareLog;
  staff: StaffRef;
  onDeleted: (message: string) => void;
}

function LogItem({ log, staff, onDeleted }: LogItemProps) {
  return (
    <li className={`${CARD} border-l-4 border-l-fpt-blue p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {log.student ? (
            <Link href={`/students/${log.student.id}`} className={LINK}>
              {log.student.fullName}
            </Link>
          ) : (
            '—'
          )}
          {log.student ? (
            <span className="ml-2 font-normal text-muted">
              {log.student.studentCode}
              {log.student.classCode ? ` · ${log.student.classCode}` : ''}
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {log.alert ? (
            <Badge tone={ALERT_LEVEL_TONES[log.alert.level] ?? 'neutral'}>
              Gắn cảnh báo cấp {log.alert.level}
              {log.alert.classSection ? ` — lớp ${log.alert.classSection.code}` : ''}
            </Badge>
          ) : null}
          <Badge tone="info">{CARE_CHANNEL_LABELS[log.channel]}</Badge>
          <DeleteCareLogButton log={{ ...log, staff }} onDeleted={onDeleted} />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">{formatDateTime(log.createdAt)}</p>
      <p className="mt-3 text-sm text-ink">{log.content}</p>
      {log.outcome ? (
        <p className="mt-2 text-sm text-muted">
          <strong className="text-success">Kết quả:</strong> {log.outcome}
        </p>
      ) : null}
      {log.nextAction ? (
        <p className="mt-1 text-sm text-muted">
          <strong className="text-fpt-orange">Bước tiếp theo:</strong> {log.nextAction}
        </p>
      ) : null}
    </li>
  );
}

function ListSkeleton() {
  return (
    <SkeletonBlock label="Đang tải nhật ký chăm sóc" className="grid gap-4">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-28 w-full rounded-[var(--radius-card)]" />
      ))}
    </SkeletonBlock>
  );
}

/**
 * Các lượt chăm sóc của một người trong kỳ — mở từ dòng thầy cô / cán bộ CTSV
 * trong bảng "Chăm sóc theo bộ môn" ở Tổng quan. Kỳ + trang nằm trên URL.
 */
export function CareStaffLogsView({ staffId }: { staffId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const term = params.get('term') ?? '';
  const page = parsePageParam(params.get('page'));
  const [notice, setNotice] = useState('');

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['statistics', 'care-staff', staffId, term, page],
    queryFn: () =>
      apiFetch<CareStaffLogs>(
        `/statistics/care-overview/staff/${encodeURIComponent(staffId)}${buildCareStaffLogsQuery(term, page, PAGE_SIZE)}`,
      ),
    placeholderData: keepPreviousData,
  });

  const goToPage = (next: number) => {
    const query = new URLSearchParams(params.toString());
    query.set('page', String(next));
    router.push(`${pathname}?${query.toString()}`);
  };

  const title = data ? `Lượt chăm sóc — ${data.staff.fullName}` : 'Lượt chăm sóc';
  const description = data
    ? `${data.staff.staffCode}${data.term ? ` · ${data.term.name}` : ''} · ${data.caredStudents} SV · ${data.meta.total} lượt`
    : undefined;

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Link href="/dashboard" className={`${LINK} text-sm`}>
            ← Về Tổng quan
          </Link>
        }
      />

      {notice ? (
        <p role="status" className={`${CARD} mb-4 border-l-4 border-l-success p-4 text-sm`}>
          {notice}
        </p>
      ) : null}

      {isLoading ? (
        <ListSkeleton />
      ) : isError || !data ? (
        <p
          role="alert"
          className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-5 text-sm`}
        >
          Không tải được nhật ký chăm sóc.
          <button type="button" className={LINK} onClick={() => void refetch()}>
            Thử lại
          </button>
        </p>
      ) : data.items.length === 0 ? (
        <p className={`${CARD} p-8 text-center text-sm text-muted`}>
          Chưa có lượt chăm sóc nào trong kỳ.
        </p>
      ) : (
        <>
          <ol className="grid gap-4">
            {data.items.map((log) => (
              <LogItem key={log.id} log={log} staff={data.staff} onDeleted={setNotice} />
            ))}
          </ol>
          <Pagination
            page={page}
            totalPages={pageCount(data.meta.total, data.meta.limit)}
            onPageChange={goToPage}
            isLoading={isFetching}
            total={data.meta.total}
            limit={data.meta.limit}
            label="Phân trang nhật ký chăm sóc"
            className="mt-6"
          />
        </>
      )}
    </>
  );
}
