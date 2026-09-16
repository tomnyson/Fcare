'use client';

import { Badge, SurfaceCard } from '@fcare/ui-kit';
import { describeTestState, type MailSettingsView, type TestStateTone } from '../../lib/mail-settings';

const TEST_TEXT_CLASSES: Record<TestStateTone, string> = {
  muted: 'text-muted',
  success: 'text-success',
  danger: 'text-danger',
};

const TEST_DOT_CLASSES: Record<TestStateTone, string> = {
  muted: 'bg-border',
  success: 'bg-success',
  danger: 'bg-danger',
};

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('vi-VN') : '';
}

/** Thẻ tóm tắt: nguồn cấu hình, trạng thái gửi, lần thử gần nhất, người sửa. */
export function MailStatusCard({ view }: { view: MailSettingsView }) {
  const test = describeTestState(view);
  return (
    <SurfaceCard className="space-y-4 p-5" aria-labelledby="mail-status-heading">
      <h2
        id="mail-status-heading"
        className="text-xs font-semibold tracking-wide text-muted uppercase"
      >
        Trạng thái hiện tại
      </h2>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={view.enabled ? 'success' : 'warning'}>
          {view.enabled ? 'Đang gửi mail' : 'Đã tắt gửi mail'}
        </Badge>
        <Badge tone={view.source === 'DATABASE' ? 'info' : 'neutral'}>
          {view.source === 'DATABASE' ? 'Cấu hình trong hệ thống' : 'Đang dùng biến môi trường'}
        </Badge>
        {!view.encryptionReady ? <Badge tone="danger">Thiếu khoá mã hoá</Badge> : null}
      </div>

      <dl className="space-y-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted">Máy chủ</dt>
          <dd className="font-medium text-ink tabular-nums">
            {view.host}:{view.port}
            <span className="ml-1.5 text-xs font-normal text-muted">
              {view.secure ? 'TLS ngầm' : 'STARTTLS / thường'}
            </span>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted">Người gửi</dt>
          <dd className="min-w-0 break-words text-ink">
            {view.fromName} <span className="text-muted">&lt;{view.fromEmail}&gt;</span>
          </dd>
        </div>
      </dl>

      <p className={`flex items-start gap-2 text-sm ${TEST_TEXT_CLASSES[test.tone]}`}>
        <span
          aria-hidden="true"
          className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${TEST_DOT_CLASSES[test.tone]}`}
        />
        <span>{test.text}</span>
      </p>

      <p className="border-t border-border pt-3 text-xs text-muted">
        {view.updatedBy
          ? `Cập nhật bởi ${view.updatedBy.fullName} · ${formatDateTime(view.updatedAt)}`
          : 'Chưa ai lưu cấu hình trong hệ thống.'}
      </p>
    </SurfaceCard>
  );
}
