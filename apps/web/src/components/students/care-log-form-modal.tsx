'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { CARE_CHANNEL_LABELS } from '../../lib/labels';
import type { CareLog } from '../../lib/types';
import { FormError, Label, Select, Textarea } from '../ui/form';
import { Modal } from '../ui/modal';

interface CareLogFormModalProps {
  studentId: string;
  /** Gắn nhật ký vào cảnh báo (điểm danh) — API sẽ đánh dấu "GV lớp đã chăm sóc" nếu người ghi là GV đứng lớp. */
  alertId?: string;
  defaultContent?: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (log: CareLog) => void;
}

/** Mọi màn hình ghi nhật ký chăm sóc dùng chung modal này để cache được làm mới nhất quán. */
export function CareLogFormModal({
  studentId,
  alertId,
  defaultContent,
  open,
  onClose,
  onSaved,
}: CareLogFormModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<CareLog>('/care-logs', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async (log) => {
      setError('');
      onClose();
      onSaved?.(log);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['care-logs', studentId] }),
        queryClient.invalidateQueries({ queryKey: ['attendance-alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['statistics', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['care-statistics'] }),
      ]);
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
      ...(alertId ? { alertId } : {}),
      ...(form.get('outcome') ? { outcome: form.get('outcome') } : {}),
      ...(form.get('nextAction') ? { nextAction: form.get('nextAction') } : {}),
    });
  }

  function close() {
    setError('');
    onClose();
  }

  return (
    <Modal title="Ghi nhật ký chăm sóc" open={open} onClose={close}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError>{error}</FormError>
        <div>
          <Label htmlFor="care-channel">Hình thức trao đổi</Label>
          <Select id="care-channel" name="channel" required defaultValue="IN_PERSON">
            {Object.entries(CARE_CHANNEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="care-content">Nội dung</Label>
          <Textarea
            id="care-content"
            name="content"
            required
            defaultValue={defaultContent}
            placeholder="Nội dung trao đổi với sinh viên…"
          />
        </div>
        <div>
          <Label htmlFor="care-outcome">Kết quả (tùy chọn)</Label>
          <Textarea id="care-outcome" name="outcome" className="min-h-16" />
        </div>
        <div>
          <Label htmlFor="care-next-action">Hành động tiếp theo (tùy chọn)</Label>
          <Textarea id="care-next-action" name="nextAction" className="min-h-16" />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={close}>
            Hủy
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Đang lưu…' : 'Lưu nhật ký'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
