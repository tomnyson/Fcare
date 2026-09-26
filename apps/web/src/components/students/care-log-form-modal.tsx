'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { careSectionGroups, defaultCareSectionId } from '../../lib/care-context';
import { useMe } from '../../lib/hooks';
import { CARE_CHANNEL_LABELS } from '../../lib/labels';
import type { CareLog, Enrollment } from '../../lib/types';
import { FormError, Label, Select, Textarea } from '../ui/form';
import { Modal } from '../ui/modal';

interface CareLogFormModalProps {
  studentId: string;
  /** Gắn nhật ký vào cảnh báo (điểm danh) — API sẽ đánh dấu "GV lớp đã chăm sóc" nếu người ghi là GV đứng lớp. */
  alertId?: string;
  defaultContent?: string;
  /** Học kỳ đang xem — chọn sẵn lớp học phần của kỳ này. */
  term?: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (log: CareLog) => void;
}

/** Mọi màn hình ghi nhật ký chăm sóc dùng chung modal này để cache được làm mới nhất quán. */
export function CareLogFormModal({
  studentId,
  alertId,
  defaultContent,
  term = '',
  open,
  onClose,
  onSaved,
}: CareLogFormModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  /** null = chưa đổi, dùng lớp chọn sẵn; '' = để trống (chỉ khi gắn cảnh báo). */
  const [pickedSectionId, setPickedSectionId] = useState<string | null>(null);
  const { data: me } = useMe();
  const { data: enrollments } = useQuery({
    queryKey: ['enrollments', studentId],
    queryFn: () => apiFetch<Enrollment[]>(`/enrollments?studentId=${studentId}`),
    enabled: open,
  });
  const sectionGroups = careSectionGroups(enrollments ?? []);
  // Gắn cảnh báo thì mặc định theo lớp của cảnh báo (API tự lấy) — không đoán lớp khác.
  const sectionId =
    pickedSectionId ??
    (alertId ? '' : defaultCareSectionId(sectionGroups, { term, userId: me?.user.id }));

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<CareLog>('/care-logs', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async (log) => {
      setError('');
      setPickedSectionId(null);
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
      ...(sectionId ? { classSectionId: sectionId } : {}),
      ...(form.get('outcome') ? { outcome: form.get('outcome') } : {}),
      ...(form.get('nextAction') ? { nextAction: form.get('nextAction') } : {}),
    });
  }

  function close() {
    setError('');
    setPickedSectionId(null);
    onClose();
  }

  return (
    <Modal title="Ghi nhật ký chăm sóc" open={open} onClose={close}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError>{error}</FormError>
        {sectionGroups.length > 0 ? (
          <div>
            <Label htmlFor="care-section">Chăm sóc trong lớp học phần</Label>
            <Select
              id="care-section"
              name="classSectionId"
              required={!alertId}
              value={sectionId}
              onChange={(event) => setPickedSectionId(event.target.value)}
              aria-describedby="care-section-hint"
            >
              <option value="" disabled={!alertId}>
                {alertId ? 'Theo lớp của cảnh báo' : 'Chọn lớp học phần'}
              </option>
              {sectionGroups.map((group) => (
                <optgroup key={group.term} label={`Học kỳ ${group.term}`}>
                  {group.sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {/* Kỳ ghi cả trong option: select đóng lại thì nhãn optgroup không hiện. */}
                      {section.term} · {section.code}
                      {section.subject ? ` — ${section.subject.name}` : ''}
                      {section.lecturerId === me?.user.id ? ' (lớp bạn dạy)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <p id="care-section-hint" className="mt-1 text-xs text-muted">
              Ghi rõ học kỳ và môn học để người đọc biết bối cảnh của lượt trao đổi.
            </p>
          </div>
        ) : null}
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
