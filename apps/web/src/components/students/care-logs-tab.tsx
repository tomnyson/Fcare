'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { CARE_CHANNEL_LABELS, formatDateTime } from '../../lib/labels';
import type { CareLog } from '../../lib/types';
import { FormError, Label, Select, Textarea } from '../ui/form';
import { Modal } from '../ui/modal';

export function CareLogsTab({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['care-logs', studentId],
    queryFn: () => apiFetch<CareLog[]>(`/care-logs?studentId=${studentId}`),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<CareLog>('/care-logs', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => {
      setOpen(false);
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['care-logs', studentId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra.'),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createMutation.mutate({
      studentId,
      channel: form.get('channel'),
      content: form.get('content'),
      ...(form.get('outcome') ? { outcome: form.get('outcome') } : {}),
      ...(form.get('nextAction') ? { nextAction: form.get('nextAction') } : {}),
    });
  }

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
                <Badge tone="info">{CARE_CHANNEL_LABELS[log.channel]}</Badge>
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

      <Modal title="Ghi nhật ký chăm sóc" open={open} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormError>{error}</FormError>
          <div>
            <Label htmlFor="channel">Hình thức trao đổi</Label>
            <Select id="channel" name="channel" required defaultValue="IN_PERSON">
              {Object.entries(CARE_CHANNEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="content">Nội dung</Label>
            <Textarea id="content" name="content" required placeholder="Nội dung trao đổi với sinh viên…" />
          </div>
          <div>
            <Label htmlFor="outcome">Kết quả (tùy chọn)</Label>
            <Textarea id="outcome" name="outcome" className="min-h-16" />
          </div>
          <div>
            <Label htmlFor="nextAction">Hành động tiếp theo (tùy chọn)</Label>
            <Textarea id="nextAction" name="nextAction" className="min-h-16" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Đang lưu…' : 'Lưu nhật ký'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
