'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../../lib/api';
import type { Department } from '../../lib/types';

/**
 * Bật/tắt bộ môn theo cơ sở. Tắt bộ môn thì API ẩn luôn môn học thuộc bộ môn
 * đó (`GET /subjects`) và mọi dropdown bộ môn — nên phải làm mới cả hai cache.
 */
export function DepartmentActiveToggle({
  department,
  disabled,
}: {
  department: Department;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (isActive: boolean) =>
      apiFetch(`/departments/${department.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['departments'] }),
        queryClient.invalidateQueries({ queryKey: ['subjects'] }),
      ]);
    },
  });

  const isOn = toggle.isPending ? Boolean(toggle.variables) : department.isActive;
  const label = isOn ? 'Đang mở' : 'Đã tắt';

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        aria-label={`${isOn ? 'Tắt' : 'Bật'} bộ môn ${department.code}`}
        disabled={disabled || toggle.isPending}
        onClick={() => toggle.mutate(!department.isActive)}
        className="group inline-flex items-center gap-2 rounded-full text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${
            isOn ? 'bg-success' : 'bg-border'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-surface-raised shadow-sm transition-transform duration-150 ${
              isOn ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </span>
        <span className={isOn ? 'text-ink' : 'text-muted'}>{label}</span>
      </button>
      {toggle.isError ? (
        <span role="alert" className="text-xs text-danger">
          {toggle.error instanceof ApiError ? toggle.error.message : 'Không đổi được trạng thái.'}
        </span>
      ) : null}
    </div>
  );
}
