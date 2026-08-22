'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { DataTable, Td } from '../../../components/ui/data-table';
import { FormError, Label, Select, Textarea } from '../../../components/ui/form';
import { Modal } from '../../../components/ui/modal';
import { PageHeader } from '../../../components/ui/page-header';
import { apiFetch, ApiError } from '../../../lib/api';
import { useMe } from '../../../lib/hooks';
import {
  ALERT_LEVEL_LABELS,
  ALERT_LEVEL_TONES,
  ALERT_STATUS_LABELS,
  formatDateTime,
} from '../../../lib/labels';
import type { Alert, Paginated } from '../../../lib/types';

const RESOLVER_ROLES = ['ADMIN', 'HEAD_OF_DEPT', 'TRAINING_OFFICER', 'SA_HEAD'];

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [status, setStatus] = useState('');
  const [level, setLevel] = useState('');
  const [resolving, setResolving] = useState<Alert | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', { status, level }],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' });
      if (status) params.set('status', status);
      if (level) params.set('level', level);
      return apiFetch<Paginated<Alert>>(`/alerts?${params.toString()}`);
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/alerts/${id}/acknowledge`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, resolutionNote }: { id: string; resolutionNote: string }) =>
      apiFetch(`/alerts/${id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ resolutionNote }),
      }),
    onSuccess: async () => {
      setResolving(null);
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra.'),
  });

  const canResolve = me?.user.roles.some((role) => RESOLVER_ROLES.includes(role)) ?? false;

  function onResolveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolving) {
      return;
    }
    const form = new FormData(event.currentTarget);
    resolveMutation.mutate({
      id: resolving.id,
      resolutionNote: String(form.get('resolutionNote') ?? ''),
    });
  }

  return (
    <>
      <PageHeader
        title="Cảnh báo sinh viên"
        description="Theo dõi và xử lý cảnh báo theo độ khẩn 1-4."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          aria-label="Lọc theo trạng thái"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="max-w-44"
        >
          <option value="">Mọi trạng thái</option>
          {Object.entries(ALERT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Lọc theo độ khẩn"
          value={level}
          onChange={(event) => setLevel(event.target.value)}
          className="max-w-44"
        >
          <option value="">Mọi độ khẩn</option>
          {Object.entries(ALERT_LEVEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              Mức {value} — {label}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        headers={['Độ khẩn', 'Sinh viên', 'Lý do', 'Người phát', 'Thời điểm', 'Trạng thái', 'Thao tác']}
        isEmpty={!isLoading && (data?.items.length ?? 0) === 0}
        emptyMessage="Không có cảnh báo nào khớp bộ lọc."
      >
        {(data?.items ?? []).map((alert) => (
          <tr key={alert.id} className="transition-colors hover:bg-fpt-orange-50/40">
            <Td>
              <Badge tone={ALERT_LEVEL_TONES[alert.level] ?? 'info'}>
                Mức {alert.level} — {ALERT_LEVEL_LABELS[alert.level] ?? alert.level}
              </Badge>
            </Td>
            <Td>
              {alert.student ? (
                <Link href={`/students/${alert.student.id}`} className="font-semibold text-fpt-blue hover:underline">
                  {alert.student.fullName}
                  <span className="ml-1 font-normal text-muted">({alert.student.studentCode})</span>
                </Link>
              ) : (
                '—'
              )}
            </Td>
            <Td className="max-w-80 whitespace-normal">{alert.reason}</Td>
            <Td>{alert.raisedBy?.fullName ?? '—'}</Td>
            <Td className="text-muted">{formatDateTime(alert.createdAt)}</Td>
            <Td>
              <Badge tone={alert.status === 'RESOLVED' ? 'success' : alert.status === 'OPEN' ? 'warning' : 'info'}>
                {ALERT_STATUS_LABELS[alert.status]}
              </Badge>
            </Td>
            <Td>
              {canResolve && alert.status !== 'RESOLVED' ? (
                <div className="flex gap-2">
                  {alert.status === 'OPEN' ? (
                    <button
                      type="button"
                      onClick={() => acknowledgeMutation.mutate(alert.id)}
                      className="text-xs font-semibold text-fpt-blue hover:underline"
                    >
                      Tiếp nhận
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setResolving(alert)}
                    className="text-xs font-semibold text-success hover:underline"
                  >
                    Xử lý
                  </button>
                </div>
              ) : (
                <span className="text-xs text-muted">—</span>
              )}
            </Td>
          </tr>
        ))}
      </DataTable>

      <Modal
        title={`Xử lý cảnh báo — ${resolving?.student?.fullName ?? ''}`}
        open={resolving !== null}
        onClose={() => setResolving(null)}
      >
        <form onSubmit={onResolveSubmit} className="space-y-4">
          <FormError>{error}</FormError>
          <p className="rounded-md bg-surface p-3 text-sm text-muted">{resolving?.reason}</p>
          <div>
            <Label htmlFor="resolutionNote">Ghi chú xử lý</Label>
            <Textarea
              id="resolutionNote"
              name="resolutionNote"
              required
              placeholder="Kết quả can thiệp, hướng xử lý…"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setResolving(null)}>
              Hủy
            </Button>
            <Button type="submit" disabled={resolveMutation.isPending}>
              {resolveMutation.isPending ? 'Đang lưu…' : 'Đánh dấu đã xử lý'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
