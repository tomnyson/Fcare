'use client';

import { suggestUrgencyLevel } from '@fcare/shared-types';
import { Badge, Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import {
  ALERT_LEVEL_LABELS,
  ALERT_LEVEL_TONES,
  ALERT_STATUS_LABELS,
  formatDateTime,
} from '../../lib/labels';
import type { Alert, AuthUser, Evaluation, Paginated } from '../../lib/types';
import { FormError, Label, Select, Textarea } from '../ui/form';
import { Modal } from '../ui/modal';

export function AlertsTab({ studentId, user }: { studentId: string; user: AuthUser }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [level, setLevel] = useState('1');

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', { studentId }],
    queryFn: () => apiFetch<Paginated<Alert>>(`/alerts?studentId=${studentId}&limit=50`),
  });

  // Dùng chung cache với tab Đánh giá — chỉ để gợi ý độ khẩn theo lần đánh giá
  // mới nhất (danh sách đã sắp createdAt giảm dần ở API).
  const { data: evaluations } = useQuery({
    queryKey: ['evaluations', studentId],
    queryFn: () => apiFetch<Evaluation[]>(`/evaluations?studentId=${studentId}`),
  });

  const latestEvaluation = evaluations?.[0] ?? null;
  const suggestion = latestEvaluation
    ? suggestUrgencyLevel({
        academicScore: latestEvaluation.academicScore,
        attitudeScore: latestEvaluation.attitudeScore,
        issueGroup: latestEvaluation.issueGroup,
      })
    : null;

  function openRaiseModal() {
    // Mặc định theo mức đề xuất từ đánh giá gần nhất; người phát vẫn đổi được.
    setLevel(String(suggestion?.level ?? 1));
    setError('');
    setOpen(true);
  }

  const raiseMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<Alert>('/alerts', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => {
      setOpen(false);
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra.'),
  });

  const canRaise = user.roles.some((role) => ['LECTURER', 'HEAD_OF_DEPT', 'ADMIN'].includes(role));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    raiseMutation.mutate({
      studentId,
      level: Number(level),
      reason: form.get('reason'),
    });
  }

  return (
    <>
      {canRaise ? (
        <div className="mb-4 flex justify-end">
          <Button type="button" variant="danger" onClick={openRaiseModal}>
            ⚠ Phát cảnh báo
          </Button>
        </div>
      ) : null}

      {!isLoading && (data?.items.length ?? 0) === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-border bg-white p-8 text-center text-sm text-muted">
          Sinh viên chưa có cảnh báo nào.
        </p>
      ) : (
        <ol className="space-y-4">
          {(data?.items ?? []).map((alert) => (
            <li
              key={alert.id}
              className={`rounded-[var(--radius-card)] border border-border border-l-4 bg-white p-5 shadow-[var(--shadow-card)] ${
                alert.level >= 4 ? 'border-l-danger' : alert.level >= 2 ? 'border-l-warning' : 'border-l-fpt-blue'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={ALERT_LEVEL_TONES[alert.level] ?? 'info'}>
                  Mức {alert.level} — {ALERT_LEVEL_LABELS[alert.level] ?? alert.level}
                </Badge>
                <Badge tone={alert.status === 'RESOLVED' ? 'success' : 'neutral'}>
                  {ALERT_STATUS_LABELS[alert.status]}
                </Badge>
                <span className="ml-auto text-xs text-muted">{formatDateTime(alert.createdAt)}</span>
              </div>
              <p className="mt-3 text-sm text-ink">{alert.reason}</p>
              <p className="mt-2 text-xs text-muted">
                Người phát: {alert.raisedBy?.fullName ?? '—'}
                {alert.resolvedBy
                  ? ` · Xử lý bởi ${alert.resolvedBy.fullName} lúc ${formatDateTime(alert.resolvedAt)}`
                  : ''}
              </p>
              {alert.resolutionNote ? (
                <p className="mt-1 text-sm text-muted">
                  <strong className="text-success">Kết quả xử lý:</strong> {alert.resolutionNote}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <Modal title="Phát cảnh báo sinh viên" open={open} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormError>{error}</FormError>
          <div>
            <Label htmlFor="level">Độ khẩn</Label>
            <Select
              id="level"
              name="level"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              required
            >
              {Object.entries(ALERT_LEVEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  Mức {value} — {label}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-xs text-muted">
              Mức 2 báo Trưởng bộ môn · Mức 3 thêm Cán bộ Đào tạo · Mức 4 thêm CTSV và mọi giảng
              viên đang dạy (cần lý do ≥ 40 ký tự).
            </p>
            {suggestion ? (
              <p className="mt-1.5 rounded-md bg-fpt-orange-50 px-3 py-2 text-xs text-ink">
                Đánh giá gần nhất ({latestEvaluation?.term}) đề xuất{' '}
                <strong>mức {suggestion.level}</strong>: {suggestion.reasons[0]}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="reason">Lý do cảnh báo</Label>
            <Textarea
              id="reason"
              name="reason"
              required
              placeholder="Mô tả cụ thể tình trạng của sinh viên…"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="danger" disabled={raiseMutation.isPending}>
              {raiseMutation.isPending ? 'Đang gửi…' : 'Phát cảnh báo'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
