'use client';

import { Button } from '@fcare/ui-kit';
import { useState } from 'react';
import {
  canViewDepartmentAttendance,
  defaultCareContent,
  groupByLevel,
  panelTone,
  splitByOwner,
  type PanelTone,
} from '../../lib/attendance-care';
import { useMe } from '../../lib/hooks';
import type { PendingAttendanceAlert } from '../../lib/types';
import { usePendingAttendanceAlerts } from '../../lib/use-attendance-alerts';
import { useCurrentTerm } from '../../lib/use-current-term';
import { CareLogFormModal } from '../students/care-log-form-modal';
import { Skeleton, SkeletonBlock } from '../ui/skeleton';
import { AttendanceCareRow } from './attendance-care-row';

const TONE_BORDER: Record<PanelTone, string> = {
  info: 'border-l-fpt-blue',
  warning: 'border-l-warning',
  orange: 'border-l-fpt-orange',
  danger: 'border-l-danger',
};

const CARD =
  'rounded-[var(--radius-card)] border border-border border-l-4 bg-white shadow-[var(--shadow-card)]';

function countStudents(items: readonly PendingAttendanceAlert[]): number {
  return new Set(items.map((alert) => alert.student.id)).size;
}

function LoadingCard() {
  return (
    <SkeletonBlock label="Đang tải cảnh báo điểm danh" className={`${CARD} border-l-border p-5`}>
      <Skeleton className="h-5 w-72" />
      <Skeleton className="mt-4 h-11 w-full" />
      <Skeleton className="mt-2 h-11 w-full" />
    </SkeletonBlock>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className={`${CARD} border-l-danger flex flex-wrap items-center justify-between gap-3 p-5`}>
      <p className="text-sm text-ink">Không tải được danh sách cảnh báo điểm danh.</p>
      <Button type="button" variant="ghost" onClick={onRetry}>
        Thử tải lại
      </Button>
    </div>
  );
}

function GroupedRows({
  items,
  emphasize,
  onCare,
}: {
  items: readonly PendingAttendanceAlert[];
  emphasize: boolean;
  onCare: (alert: PendingAttendanceAlert) => void;
}) {
  return (
    <>
      {groupByLevel(items).map((group) => (
        <ul key={group.level} aria-label={`Mức ${group.level}`} className="divide-y divide-border">
          {group.items.map((alert) => (
            <AttendanceCareRow key={alert.id} alert={alert} emphasize={emphasize} onCare={onCare} />
          ))}
        </ul>
      ))}
    </>
  );
}

/** Bảng "việc của tôi": hiện LIÊN TỤC cho GV đứng lớp tới khi chính GV đó ghi nhật ký. */
function OwnedPanel({
  items,
  onCare,
}: {
  items: readonly PendingAttendanceAlert[];
  onCare: (alert: PendingAttendanceAlert) => void;
}) {
  const students = countStudents(items);
  return (
    <section aria-labelledby="attendance-care-title" className={`${CARD} ${TONE_BORDER[panelTone(items)]}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-4">
        <h2 id="attendance-care-title" className="text-base font-bold text-fpt-blue-900">
          <span className="font-[family-name:var(--font-display)] text-2xl tabular-nums">{students}</span>{' '}
          sinh viên cần chăm sóc sau điểm danh
        </h2>
        <p className="text-xs text-muted">
          Vắng từ 2 buổi ở lớp bạn đứng lớp. Mục này chỉ biến mất khi bạn ghi nhật ký chăm sóc.
        </p>
      </header>
      <GroupedRows items={items} emphasize onCare={onCare} />
    </section>
  );
}

/** Bảng thứ hai cho TBM/CTSV: cảnh báo ở lớp của giảng viên khác, gập lại mặc định. */
function DepartmentPanel({
  items,
  onCare,
}: {
  items: readonly PendingAttendanceAlert[];
  onCare: (alert: PendingAttendanceAlert) => void;
}) {
  const pending = items.filter((alert) => alert.ownerCaredAt === null).length;
  return (
    <details className={`${CARD} border-l-fpt-blue-900 group`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange">
        <span className="text-sm font-bold text-fpt-blue-900">
          Cảnh báo điểm danh trong phạm vi bạn theo dõi
          <span className="ml-2 rounded-full bg-fpt-blue/10 px-2 py-0.5 text-xs font-bold tabular-nums text-fpt-blue-700">
            {items.length}
          </span>
        </span>
        <span className="text-xs text-muted">
          {pending} chờ giảng viên lớp · bấm để {`mở/đóng`}
        </span>
      </summary>
      <div className="border-t border-border">
        <GroupedRows items={items} emphasize={false} onCare={onCare} />
      </div>
    </details>
  );
}

/**
 * Bước 3 của FLOW 2: cảnh báo điểm danh tự động đặt ngay đầu dashboard, trước
 * các chỉ số. Không có nút đóng — cách duy nhất để gỡ là ghi nhật ký chăm sóc.
 */
export function AttendanceCarePanel() {
  const term = useCurrentTerm().data?.code;
  const { data: me } = useMe();
  const seesDepartment = canViewDepartmentAttendance(me?.user.roles ?? []);
  const owned = usePendingAttendanceAlerts(term, 'owned');
  const all = usePendingAttendanceAlerts(seesDepartment ? term : null, 'all');
  const [careTarget, setCareTarget] = useState<PendingAttendanceAlert | null>(null);

  if (!term) {
    return null;
  }
  if (owned.isLoading) {
    return <LoadingCard />;
  }
  if (owned.isError) {
    return <ErrorCard onRetry={() => void owned.refetch()} />;
  }

  const ownedItems = owned.data?.items ?? [];
  const others = splitByOwner(all.data?.items ?? []).others;
  if (ownedItems.length === 0 && others.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 space-y-4">
      {ownedItems.length > 0 ? <OwnedPanel items={ownedItems} onCare={setCareTarget} /> : null}
      {others.length > 0 ? <DepartmentPanel items={others} onCare={setCareTarget} /> : null}
      {careTarget ? (
        <CareLogFormModal
          key={careTarget.id}
          studentId={careTarget.student.id}
          alertId={careTarget.id}
          defaultContent={defaultCareContent(careTarget)}
          open
          onClose={() => setCareTarget(null)}
        />
      ) : null}
    </div>
  );
}
