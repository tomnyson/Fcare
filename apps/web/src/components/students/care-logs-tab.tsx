'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { ALERT_LEVEL_TONES, CARE_CHANNEL_LABELS, formatDateTime } from '../../lib/labels';
import type { CareLog } from '../../lib/types';
import { CareLogFormModal } from './care-log-form-modal';

export function CareLogsTab({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['care-logs', studentId],
    queryFn: () => apiFetch<CareLog[]>(`/care-logs?studentId=${studentId}`),
  });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button type="button" onClick={() => setOpen(true)}>
          + Ghi nhật ký chăm sóc
        </Button>
      </div>

      {!isLoading && (data?.length ?? 0) === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-border bg-white p-8 text-center text-sm text-muted">
          Chưa có hoạt động chăm sóc nào được ghi nhận.
        </p>
      ) : (
        <ol className="space-y-4">
          {(data ?? []).map((log) => (
            <li
              key={log.id}
              className="rounded-[var(--radius-card)] border border-border border-l-4 border-l-fpt-blue bg-white p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {log.staff?.fullName ?? '—'}
                  <span className="ml-2 font-normal text-muted">{formatDateTime(log.createdAt)}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {log.alert ? (
                    <Badge tone={ALERT_LEVEL_TONES[log.alert.level] ?? 'neutral'}>
                      Gắn cảnh báo cấp {log.alert.level}
                      {log.alert.classSection ? ` — lớp ${log.alert.classSection.code}` : ''}
                    </Badge>
                  ) : null}
                  <Badge tone="info">{CARE_CHANNEL_LABELS[log.channel]}</Badge>
                </div>
              </div>
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
          ))}
        </ol>
      )}

      <CareLogFormModal studentId={studentId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
