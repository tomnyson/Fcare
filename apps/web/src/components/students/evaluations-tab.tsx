'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/labels';
import type { AuthUser, Evaluation } from '../../lib/types';
import { DataTable, Td } from '../ui/data-table';
import { FormError, Input, Label, Select, Textarea } from '../ui/form';
import { Modal } from '../ui/modal';

const ISSUE_GROUP_LABELS: Record<number, string> = {
  1: 'Nhóm 1 — Nhắc nhở, động viên',
  2: 'Nhóm 2 — Kèm cặp học tập',
  3: 'Nhóm 3 — Can thiệp tâm lý / hoàn cảnh',
  4: 'Nhóm 4 — Chuyển cấp xử lý khẩn',
};

export function EvaluationsTab({ studentId, user }: { studentId: string; user: AuthUser }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['evaluations', studentId],
    queryFn: () => apiFetch<Evaluation[]>(`/evaluations?studentId=${studentId}`),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<Evaluation>('/evaluations', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => {
      setOpen(false);
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['evaluations', studentId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra.'),
  });

  const canCreate = user.roles.some((role) =>
    ['LECTURER', 'HEAD_OF_DEPT', 'ADMIN'].includes(role),
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const issueGroup = form.get('issueGroup') as string;
    createMutation.mutate({
      studentId,
      term: form.get('term'),
      academicScore: Number(form.get('academicScore')),
      attitudeScore: Number(form.get('attitudeScore')),
      ...(issueGroup ? { issueGroup: Number(issueGroup) } : {}),
      ...(form.get('note') ? { note: form.get('note') } : {}),
    });
  }

  return (
    <>
      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Button type="button" onClick={() => setOpen(true)}>
            + Thêm đánh giá
          </Button>
        </div>
      ) : null}

      <DataTable
        headers={['Học kỳ', 'Học lực (1-10)', 'Thái độ (1-10)', 'Nhóm vấn đề', 'Ghi chú', 'Người đánh giá', 'Thời điểm']}
        isEmpty={!isLoading && (data?.length ?? 0) === 0}
        emptyMessage="Chưa có đánh giá nào."
      >
        {(data ?? []).map((evaluation) => (
          <tr key={evaluation.id}>
            <Td className="font-semibold">{evaluation.term}</Td>
            <Td>{evaluation.academicScore}</Td>
            <Td>{evaluation.attitudeScore}</Td>
            <Td>{evaluation.issueGroup ? ISSUE_GROUP_LABELS[evaluation.issueGroup] : '—'}</Td>
            <Td className="max-w-72 whitespace-normal">{evaluation.note ?? '—'}</Td>
            <Td>{evaluation.lecturer?.fullName ?? '—'}</Td>
            <Td className="text-muted">{formatDateTime(evaluation.createdAt)}</Td>
          </tr>
        ))}
      </DataTable>

      <Modal title="Thêm đánh giá sinh viên" open={open} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormError>{error}</FormError>
          <div>
            <Label htmlFor="term">Học kỳ</Label>
            <Input id="term" name="term" placeholder="vd: SU25" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="academicScore">Điểm học lực (1-10)</Label>
              <Input id="academicScore" name="academicScore" type="number" min={1} max={10} required />
            </div>
            <div>
              <Label htmlFor="attitudeScore">Điểm thái độ (1-10)</Label>
              <Input id="attitudeScore" name="attitudeScore" type="number" min={1} max={10} required />
            </div>
          </div>
          <div>
            <Label htmlFor="issueGroup">Nhóm vấn đề cần can thiệp</Label>
            <Select id="issueGroup" name="issueGroup" defaultValue="">
              <option value="">Không có</option>
              {Object.entries(ISSUE_GROUP_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea id="note" name="note" placeholder="Nhận xét chi tiết…" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Đang lưu…' : 'Lưu đánh giá'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
