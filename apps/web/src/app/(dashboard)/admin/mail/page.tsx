'use client';

import { SurfaceCard } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { MailSettingsForm } from '../../../../components/admin/mail-settings-form';
import { MailStatusCard } from '../../../../components/admin/mail-status-card';
import { MailTestPanel } from '../../../../components/admin/mail-test-panel';
import { FormSuccess } from '../../../../components/ui/form';
import { PageHeader } from '../../../../components/ui/page-header';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useMe } from '../../../../lib/hooks';
import {
  toFormValues,
  type MailSettingsFormValues,
  type MailSettingsView,
} from '../../../../lib/mail-settings';

const QUERY_KEY = ['admin', 'mail-settings'] as const;

function isDirty(a: MailSettingsFormValues, b: MailSettingsFormValues): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function LockedCard() {
  return (
    <SurfaceCard className="mx-auto max-w-lg p-8 text-center">
      <p className="text-4xl" aria-hidden="true">
        🔒
      </p>
      <p className="mt-3 font-display text-lg font-semibold text-fpt-blue-900">
        Chỉ quản trị viên mới cấu hình được email hệ thống.
      </p>
      <p className="mt-1 text-sm text-muted">
        Cần đổi máy chủ gửi mail? Liên hệ quản trị viên FCare.
      </p>
    </SurfaceCard>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <SurfaceCard className="mx-auto max-w-lg p-8 text-center">
      <p className="text-4xl" aria-hidden="true">
        ⚠️
      </p>
      <p className="mt-3 font-medium text-ink">Không tải được cấu hình email.</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md px-4 py-2 text-sm font-semibold text-fpt-blue underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange"
      >
        Thử tải lại
      </button>
    </SurfaceCard>
  );
}

function LoadingSkeleton() {
  return (
    <div
      className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      aria-busy="true"
      aria-label="Đang tải cấu hình email"
    >
      <div className="h-[32rem] animate-pulse rounded-[var(--radius-card)] bg-border/60" />
      <div className="space-y-6">
        <div className="h-52 animate-pulse rounded-[var(--radius-card)] bg-border/60" />
        <div className="h-60 animate-pulse rounded-[var(--radius-card)] bg-border/60" />
      </div>
    </div>
  );
}

export default function AdminMailPage() {
  const { data: me } = useMe();
  const isAdmin = me?.user.roles.includes('ADMIN') ?? false;
  const settingsQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<MailSettingsView>('/admin/mail-settings'),
    enabled: isAdmin,
  });
  const [draft, setDraft] = useState<MailSettingsFormValues | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const view = settingsQuery.data;
  const saved = view ? toFormValues(view) : null;
  const dirty = draft !== null && saved !== null && isDirty(draft, saved);

  let body: ReactNode;
  if (me && !isAdmin) {
    body = <LockedCard />;
  } else if (settingsQuery.isError) {
    const err = settingsQuery.error;
    body = (
      <ErrorCard
        message={err instanceof ApiError ? err.message : 'Máy chủ không phản hồi.'}
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  } else if (!view || !saved) {
    body = <LoadingSkeleton />;
  } else {
    body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SurfaceCard className="space-y-5">
          {justSaved ? (
            <FormSuccess>Đã lưu cấu hình. Mail mới sẽ dùng cấu hình này ngay.</FormSuccess>
          ) : null}
          <MailSettingsForm
            key={view.updatedAt ?? 'env'}
            view={view}
            onValuesChange={(values) => {
              setDraft(values);
              setJustSaved(false);
            }}
            onSaved={() => setJustSaved(true)}
          />
        </SurfaceCard>
        <div className="space-y-6">
          <MailStatusCard view={view} />
          <MailTestPanel
            currentValues={draft ?? saved}
            dirty={dirty}
            blocked={view.externalDisabled}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Cấu hình email"
        description="Máy chủ SMTP dùng để gửi cảnh báo, nhật ký chăm sóc và trao đổi cho giảng viên."
      />
      {body}
    </div>
  );
}
