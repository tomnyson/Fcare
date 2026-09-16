'use client';

import { Badge, Button } from '@fcare/ui-kit';
import {
  ALERT_LEVEL_LABELS,
  ALERT_LEVEL_TONES,
  ALERT_SOURCE_LABELS,
  ALERT_STATUS_LABELS,
  formatDate,
  formatDateTime,
} from '../../lib/labels';
import type { Alert } from '../../lib/types';

interface AlertCardProps {
  alert: Alert;
  /** Card được mở từ link `?alertId=` — viền cam để người dùng thấy ngay. */
  highlighted: boolean;
  /** Có mặt → hiện nút ghi nhật ký cho cảnh báo điểm danh chưa xử lý. */
  onCare?: (alert: Alert) => void;
}

function levelBorder(level: number): string {
  if (level >= 4) return 'border-l-danger';
  return level >= 2 ? 'border-l-warning' : 'border-l-fpt-blue';
}

/** Dòng lớp học phần + số buổi vắng, chỉ có ở cảnh báo điểm danh tự động. */
function AttendanceMeta({ alert }: { alert: Alert }) {
  if (!alert.classSection) return null;
  const subject = alert.classSection.subject?.name;
  return (
    <p className="mt-2 text-sm text-ink">
      <span className="font-medium">{alert.classSection.code}</span>
      {subject ? <span className="text-muted"> · {subject}</span> : null}
      {alert.absentSessions !== null ? (
        <span className="ml-2 font-semibold text-danger tabular-nums">
          vắng {alert.absentSessions} buổi
        </span>
      ) : null}
    </p>
  );
}

/** Trạng thái chăm sóc của giảng viên đứng lớp + nút hành động. */
function CareFooter({ alert, onCare }: Pick<AlertCardProps, 'alert' | 'onCare'>) {
  const resolved = alert.status === 'RESOLVED';
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {alert.ownerCaredAt ? (
        <Badge tone="success">GV lớp đã chăm sóc {formatDate(alert.ownerCaredAt)}</Badge>
      ) : resolved ? null : (
        <Badge tone="warning">Chờ giảng viên lớp chăm sóc</Badge>
      )}
      {onCare && !resolved ? (
        <Button type="button" className="ml-auto" onClick={() => onCare(alert)}>
          Ghi nhật ký chăm sóc
        </Button>
      ) : null}
    </div>
  );
}

export function AlertCard({ alert, highlighted, onCare }: AlertCardProps) {
  const isAuto = alert.source === 'AUTO_ATTENDANCE';
  const raisedBy = alert.raisedBy?.fullName ?? (isAuto ? 'Hệ thống' : '—');
  return (
    <li
      id={`alert-${alert.id}`}
      className={`rounded-[var(--radius-card)] border border-border border-l-4 bg-white p-5 shadow-[var(--shadow-card)] ${levelBorder(alert.level)} ${
        highlighted ? 'outline-2 outline-offset-2 outline-fpt-orange' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          tone={ALERT_LEVEL_TONES[alert.level] ?? 'info'}
          pulse={alert.level >= 3 && alert.status !== 'RESOLVED'}
        >
          Mức {alert.level} — {ALERT_LEVEL_LABELS[alert.level] ?? alert.level}
        </Badge>
        <Badge tone={alert.status === 'RESOLVED' ? 'success' : 'neutral'}>
          {ALERT_STATUS_LABELS[alert.status]}
        </Badge>
        {isAuto ? <Badge tone="info">{ALERT_SOURCE_LABELS.AUTO_ATTENDANCE}</Badge> : null}
        <span className="ml-auto text-xs text-muted">{formatDateTime(alert.createdAt)}</span>
      </div>
      <p className="mt-3 text-sm text-ink">{alert.reason}</p>
      {isAuto ? <AttendanceMeta alert={alert} /> : null}
      <p className="mt-2 text-xs text-muted">
        Người phát: {raisedBy}
        {alert.resolvedBy
          ? ` · Xử lý bởi ${alert.resolvedBy.fullName} lúc ${formatDateTime(alert.resolvedAt)}`
          : ''}
      </p>
      {alert.resolutionNote ? (
        <p className="mt-1 text-sm text-muted">
          <strong className="text-success">Kết quả xử lý:</strong> {alert.resolutionNote}
        </p>
      ) : null}
      {isAuto ? <CareFooter alert={alert} onCare={onCare} /> : null}
    </li>
  );
}
