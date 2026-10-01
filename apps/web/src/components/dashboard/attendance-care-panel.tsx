'use client';

import { Button } from '@fcare/ui-kit';
import { useEffect, useId, useState } from 'react';
import {
  COLLAPSED_ALERTS_KEY,
  canViewDepartmentAttendance,
  defaultCareContent,
  groupByLevel,
  panelTone,
  parseCollapsedAlertIds,
  shouldStayCollapsed,
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
    <div
      role="alert"
      className={`${CARD} border-l-danger flex flex-wrap items-center justify-between gap-3 p-5`}
    >
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

function readCollapsedIds(): string[] | null {
  try {
    return parseCollapsedAlertIds(window.sessionStorage.getItem(COLLAPSED_ALERTS_KEY));
  } catch {
    return null;
  }
}

function writeCollapsedIds(ids: readonly string[] | null) {
  try {
    if (ids) window.sessionStorage.setItem(COLLAPSED_ALERTS_KEY, JSON.stringify(ids));
    else window.sessionStorage.removeItem(COLLAPSED_ALERTS_KEY);
  } catch {
    // Trình duyệt chặn storage → vẫn thu gọn được trong trang hiện tại.
  }
}

/**
 * Thu gọn khung "việc của tôi" — KHÔNG phải đóng: tiêu đề + số SV vẫn hiện, và có
 * cảnh báo mới là tự mở lại. Nhớ trong phiên tab (sessionStorage), mở lại tab là hiện đủ.
 */
function useCollapsedPanel(currentIds: readonly string[]) {
  const [collapsedIds, setCollapsedIds] = useState<string[] | null>(null);
  // Đọc sau mount để HTML server và client khớp nhau.
  useEffect(() => setCollapsedIds(readCollapsedIds()), []);

  const collapsed = shouldStayCollapsed(collapsedIds, currentIds);
  function toggle() {
    const next = collapsed ? null : [...currentIds];
    setCollapsedIds(next);
    writeCollapsedIds(next);
  }
  return { collapsed, toggle };
}

function CollapseToggle({
  collapsed,
  controls,
  onToggle,
}: {
  collapsed: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const label = collapsed ? 'Mở rộng danh sách' : 'Thu gọn danh sách';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls={controls}
      aria-label={label}
      title={label}
      className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors duration-[var(--duration-fast)] hover:bg-fpt-blue/10 hover:text-fpt-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange active:bg-fpt-blue/20"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className={`size-5 transition-transform duration-[var(--duration-fast)] motion-reduce:transition-none ${
          collapsed ? '' : 'rotate-180'
        }`}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
      </svg>
    </button>
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
  const listId = useId();
  const { collapsed, toggle } = useCollapsedPanel(items.map((alert) => alert.id));
  return (
    <section
      aria-labelledby="attendance-care-title"
      className={`${CARD} ${TONE_BORDER[panelTone(items)]}`}
    >
      <header
        className={`flex flex-wrap items-center justify-between gap-2 px-5 py-4 ${
          collapsed ? '' : 'border-b border-border'
        }`}
      >
        <h2 id="attendance-care-title" className="text-base font-bold text-fpt-blue-900">
          <span className="font-[family-name:var(--font-display)] text-2xl tabular-nums">
            {students}
          </span>{' '}
          sinh viên cần chăm sóc sau điểm danh
        </h2>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted">
            Vắng từ 2 buổi ở lớp bạn đứng lớp. Mục này chỉ biến mất khi bạn ghi nhật ký chăm sóc.
          </p>
          <CollapseToggle collapsed={collapsed} controls={listId} onToggle={toggle} />
        </div>
      </header>
      <div id={listId} hidden={collapsed}>
        <GroupedRows items={items} emphasize onCare={onCare} />
      </div>
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
 * các chỉ số. Không có nút đóng (chỉ thu gọn) — cách duy nhất để gỡ là ghi nhật ký chăm sóc.
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
