'use client';

import { Badge } from '@fcare/ui-kit';
import type { BackupOverviewStats } from '../../../../../lib/types';

interface BackupStatsProps {
  stats?: BackupOverviewStats;
  onOpenSchedule: () => void;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDate(dateString?: string): string {
  if (!dateString) return 'Chưa có bản sao lưu nào';
  const d = new Date(dateString);
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function BackupStats({ stats, onOpenSchedule }: BackupStatsProps) {
  const isEnabled = stats?.scheduleConfig.enabled ?? false;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Thẻ 1: Tổng số bản sao lưu */}
      <div className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Tổng số bản sao lưu</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-fpt-blue-900">
            {stats ? stats.totalBackups : '—'}
          </span>
          <span className="text-xs text-muted">tệp lưu trữ</span>
        </div>
      </div>

      {/* Thẻ 2: Dung lượng lưu trữ */}
      <div className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Dung lượng đĩa đã dùng</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-fpt-blue-900">
            {stats ? formatBytes(stats.totalSizeBytes) : '—'}
          </span>
        </div>
      </div>

      {/* Thẻ 3: Lần sao lưu gần nhất */}
      <div className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Bản sao lưu gần nhất</p>
        <div className="mt-2">
          <p className="text-sm font-semibold text-fpt-blue-900">
            {formatDate(stats?.lastBackupAt)}
          </p>
          {stats?.lastBackupAt && (
            <p className="mt-0.5 text-xs text-muted">Định dạng PostgreSQL Archive (.dump)</p>
          )}
        </div>
      </div>

      {/* Thẻ 4: Lịch tự động & Retention */}
      <div className="flex flex-col justify-between rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Sao lưu định kỳ</p>
            <Badge tone={isEnabled ? 'success' : 'neutral'}>
              {isEnabled ? 'Đang bật' : 'Đã tắt'}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted">
            {isEnabled
              ? `Cron: ${stats?.scheduleConfig.cronExpression} · Giữ ${stats?.scheduleConfig.retentionCount} bản`
              : 'Chưa kích hoạt lịch tự động ngầm'}
          </p>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={onOpenSchedule}
            className="text-xs font-semibold text-fpt-orange hover:text-fpt-orange-600 hover:underline"
          >
            Thay đổi cấu hình →
          </button>
        </div>
      </div>
    </div>
  );
}
