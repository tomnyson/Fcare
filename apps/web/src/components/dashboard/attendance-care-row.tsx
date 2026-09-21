'use client';

import { Badge, Button } from '@fcare/ui-kit';
import Link from 'next/link';
import { ALERT_LEVEL_LABELS, ALERT_LEVEL_TONES, formatDate } from '../../lib/labels';
import type { PendingAttendanceAlert } from '../../lib/types';

interface AttendanceCareRowProps {
  alert: PendingAttendanceAlert;
  /** true = người xem là GV đứng lớp: nút chăm sóc là hành động chính. */
  emphasize: boolean;
  onCare: (alert: PendingAttendanceAlert) => void;
}

function OwnerState({ alert }: { alert: PendingAttendanceAlert }) {
  if (alert.ownerCaredAt) {
    return <Badge tone="success">GV lớp đã chăm sóc {formatDate(alert.ownerCaredAt)}</Badge>;
  }
  return (
    <Badge tone="neutral">
      Chờ GV lớp{alert.careLogCount > 0 ? ` · ${alert.careLogCount} lượt GV khác` : ''}
    </Badge>
  );
}

/** Một dòng trong bảng "cần chăm sóc sau điểm danh": ai, lớp nào, vắng bao nhiêu, làm gì tiếp. */
export function AttendanceCareRow({ alert, emphasize, onCare }: AttendanceCareRowProps) {
  const profileHref = `/students/${alert.student.id}?tab=alerts&alertId=${alert.id}`;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 motion-safe:transition-colors motion-safe:duration-[var(--duration-fast)] hover:bg-fpt-orange-50/40">
      <Badge tone={ALERT_LEVEL_TONES[alert.level] ?? 'info'}>
        Mức {alert.level} · {ALERT_LEVEL_LABELS[alert.level] ?? alert.level}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">
          <span className="font-medium">{alert.student.studentCode}</span>
          <span className="mx-1.5 text-muted">·</span>
          {alert.student.fullName}
          {alert.student.classCode ? (
            <span className="ml-1.5 text-xs text-muted">({alert.student.classCode})</span>
          ) : null}
        </p>
        <p className="truncate text-xs text-muted">
          <span className="font-medium text-ink">{alert.classSection.code}</span> ·{' '}
          {alert.classSection.subjectName}
          {alert.absentSessions !== null ? (
            <>
              {' · '}
              <span className="font-semibold text-danger tabular-nums">
                vắng {alert.absentSessions} buổi
              </span>
            </>
          ) : null}
          {!emphasize && alert.classSection.lecturerName
            ? ` · GV ${alert.classSection.lecturerName}`
            : ''}
        </p>
      </div>
      {!emphasize ? <OwnerState alert={alert} /> : null}
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant={emphasize ? 'primary' : 'ghost'}
          className="min-h-11 px-4 py-2"
          onClick={() => onCare(alert)}
        >
          {emphasize ? 'Chăm sóc ngay' : 'Ghi nhật ký'}
        </Button>
        <Link
          href={profileHref}
          className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-fpt-blue transition-colors duration-[var(--duration-fast)] hover:bg-fpt-blue/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange"
        >
          Xem hồ sơ
        </Link>
      </div>
    </li>
  );
}
