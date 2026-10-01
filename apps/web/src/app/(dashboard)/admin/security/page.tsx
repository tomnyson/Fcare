'use client';

import {
  DEFAULT_IDLE_LOCK_MINUTES,
  IDLE_LOCK_MINUTES_OPTIONS,
  MAX_PIN_ATTEMPTS,
  PIN_LENGTH,
} from '@fcare/shared-types';
import { Button, SurfaceCard } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { FormError, FormSuccess } from '../../../../components/ui/form';
import { PageHeader } from '../../../../components/ui/page-header';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useMe } from '../../../../lib/hooks';

interface SecuritySettingsView {
  idleLockMinutes: number;
  updatedAt: string | null;
}

const QUERY_KEY = ['admin', 'security-settings'] as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function IdleOption({
  minutes,
  checked,
  onSelect,
}: {
  minutes: number;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col items-center rounded-xl border-2 px-3 py-4 text-center transition-colors focus-within:ring-2 focus-within:ring-fpt-orange/60 ${
        checked
          ? 'border-fpt-orange bg-fpt-orange/10 text-fpt-blue-900'
          : 'border-border bg-surface-raised text-ink hover:border-fpt-blue/40'
      }`}
    >
      <input
        type="radio"
        name="idle-lock-minutes"
        value={minutes}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span className="font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums">
        {minutes}
      </span>
      <span className="text-xs text-muted">phút</span>
      {minutes === DEFAULT_IDLE_LOCK_MINUTES ? (
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-fpt-orange">
          Mặc định
        </span>
      ) : null}
    </label>
  );
}

function IdleLockForm({ view }: { view: SecuritySettingsView }) {
  const queryClient = useQueryClient();
  const [minutes, setMinutes] = useState(view.idleLockMinutes);
  const mutation = useMutation({
    mutationFn: (idleLockMinutes: number) =>
      apiFetch<SecuritySettingsView>('/admin/security-settings', {
        method: 'PUT',
        body: JSON.stringify({ idleLockMinutes }),
      }),
    onSuccess: async (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      // Chính admin cũng dùng mốc mới ngay, không cần đăng nhập lại.
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const dirty = minutes !== view.idleLockMinutes;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (dirty) mutation.mutate(minutes);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <fieldset>
        <legend className="font-semibold text-ink">Tự khoá sau khi không thao tác</legend>
        <p className="mt-1 text-sm text-muted">
          Áp dụng cho mọi phiên đang mở trong vòng khoảng 1 phút, không cần đăng nhập lại.
          Hết thời gian, ứng dụng hiện màn khoá và hỏi mã PIN (không đăng xuất).
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {IDLE_LOCK_MINUTES_OPTIONS.map((option) => (
            <IdleOption
              key={option}
              minutes={option}
              checked={minutes === option}
              onSelect={() => {
                setMinutes(option);
                mutation.reset();
              }}
            />
          ))}
        </div>
      </fieldset>

      {mutation.isSuccess && !dirty ? (
        <FormSuccess>Đã lưu. Ứng dụng sẽ tự khoá sau {minutes} phút không thao tác.</FormSuccess>
      ) : null}
      {mutation.isError ? (
        <FormError>{errorMessage(mutation.error, 'Không lưu được cấu hình.')}</FormError>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={!dirty || mutation.isPending}>
          {mutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </Button>
      </div>
    </form>
  );
}

function PolicyCard() {
  return (
    <SurfaceCard className="space-y-3 text-sm">
      <h2 className="font-semibold text-ink">Quy tắc cố định</h2>
      <ul className="list-disc space-y-2 pl-5 text-muted">
        <li>Mỗi người tự tạo mã PIN {PIN_LENGTH} số sau khi ký cam kết lần đầu.</li>
        <li>
          Sai PIN {MAX_PIN_ATTEMPTS} lần liên tiếp → thu hồi mọi phiên, phải đăng nhập lại bằng mật
          khẩu.
        </li>
        <li>Phục hồi sao lưu và xoá cảnh báo luôn hỏi lại PIN (kiểm ở máy chủ).</li>
        <li>
          Người quên PIN: vào <span className="font-medium text-ink">Người dùng</span> → “Đặt lại
          PIN”, lần đăng nhập sau họ tạo PIN mới.
        </li>
      </ul>
    </SurfaceCard>
  );
}

export default function AdminSecurityPage() {
  const { data: me } = useMe();
  const isAdmin = me?.user.roles.includes('ADMIN') ?? false;
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<SecuritySettingsView>('/admin/security-settings'),
    enabled: isAdmin,
  });

  let body: ReactNode;
  if (me && !isAdmin) {
    body = (
      <SurfaceCard className="mx-auto max-w-lg p-8 text-center text-muted">
        Chỉ quản trị viên mới cấu hình được bảo mật hệ thống.
      </SurfaceCard>
    );
  } else if (query.isError) {
    body = (
      <SurfaceCard className="mx-auto max-w-lg p-8 text-center">
        <p className="font-medium text-ink">Không tải được cấu hình bảo mật.</p>
        <p className="mt-1 text-sm text-muted">
          {errorMessage(query.error, 'Máy chủ không phản hồi.')}
        </p>
        <Button className="mt-4" variant="ghost" onClick={() => void query.refetch()}>
          Thử tải lại
        </Button>
      </SurfaceCard>
    );
  } else if (!query.data) {
    body = (
      <div
        className="h-64 animate-pulse rounded-[var(--radius-card)] bg-border/60"
        aria-busy="true"
        aria-label="Đang tải cấu hình bảo mật"
      />
    );
  } else {
    body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SurfaceCard>
          <IdleLockForm key={query.data.updatedAt ?? 'default'} view={query.data} />
        </SurfaceCard>
        <PolicyCard />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Bảo mật & khoá màn hình"
        description="Thời gian không thao tác trước khi ứng dụng tự khoá và đòi mã PIN."
      />
      {body}
    </div>
  );
}
