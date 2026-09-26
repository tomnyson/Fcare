'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import type { StaffMember } from '../../lib/types';
import { FormError, FormSuccess, Input, Label } from '../ui/form';

/** Khớp `@MaxLength(200)` của `UpdateStaffDto.fullName`. */
const FULL_NAME_MAX_LENGTH = 200;

/** Họ tên cần lưu (đã trim), hoặc null khi để trống / không khác tên hiện tại. */
export function staffNameChange(draft: string, current: string): string | null {
  const next = draft.trim();
  return next === '' || next === current.trim() ? null : next;
}

/**
 * Admin sửa họ tên nhân viên trong modal chi tiết. Cha nên đặt `key={member.id}`
 * để bản nháp làm mới khi mở nhân viên khác.
 */
export function StaffNameEditor({
  member,
  onSaved,
}: {
  member: Pick<StaffMember, 'id' | 'fullName'>;
  onSaved: (updated: StaffMember) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(member.fullName);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const nextName = staffNameChange(draft, member.fullName);

  const mutation = useMutation({
    mutationFn: (fullName: string) =>
      apiFetch<StaffMember>(`/admin/staff/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fullName }),
      }),
    onSuccess: async (updated) => {
      setError('');
      setSaved(true);
      setDraft(updated.fullName);
      await queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      onSaved(updated);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Cập nhật họ tên thất bại.'),
  });

  return (
    <div className="rounded-md border border-border bg-white p-4">
      <Label htmlFor="staff-detail-name" className="font-semibold text-ink">
        Họ tên
      </Label>
      <p className="mt-1 text-xs text-muted">
        Tên hiển thị trên cảnh báo, nhận xét và thông báo. Mã nhân viên không đổi.
      </p>
      <div className="mt-3 space-y-2">
        <FormError>{error}</FormError>
        {saved ? <FormSuccess>Đã lưu họ tên.</FormSuccess> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id="staff-detail-name"
            value={draft}
            maxLength={FULL_NAME_MAX_LENGTH}
            onChange={(event) => {
              setDraft(event.target.value);
              setSaved(false);
            }}
            className="flex-1"
          />
          <Button
            type="button"
            disabled={nextName === null || mutation.isPending}
            onClick={() => {
              if (nextName) mutation.mutate(nextName);
            }}
          >
            {mutation.isPending ? 'Đang lưu…' : 'Lưu họ tên'}
          </Button>
        </div>
      </div>
    </div>
  );
}
