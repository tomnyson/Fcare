'use client';

import { Button, SurfaceCard } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import {
  buildUpdatePayload,
  isAllowedTestRecipient,
  type MailSettingsFormValues,
  type SendTestMailPayload,
  type SendTestMailResult,
} from '../../lib/mail-settings';
import { FormError, FormSuccess, Input, Label } from '../ui/form';

interface MailTestPanelProps {
  /** Giá trị đang nhập trên form — gửi thử bằng bản nháp, không cần lưu trước. */
  currentValues: MailSettingsFormValues;
  /** Form có khác bản đã lưu không → gửi kèm `draft`. */
  dirty: boolean;
  /** .env đang chặn gửi ra ngoài → khoá nút, API cũng sẽ từ chối. */
  blocked?: boolean;
}

const RECIPIENT_HINT = 'Chỉ nhận địa chỉ @fpt.edu.vn hoặc @fe.edu.vn.';

export function MailTestPanel({ currentValues, dirty, blocked = false }: MailTestPanelProps) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const testMutation = useMutation({
    mutationFn: () => {
      const payload: SendTestMailPayload = dirty
        ? { to: to.trim(), draft: buildUpdatePayload(currentValues) }
        : { to: to.trim() };
      return apiFetch<SendTestMailResult>('/admin/mail-settings/test', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (result) => {
      setError('');
      const at = new Date(result.sentAt).toLocaleTimeString('vi-VN');
      const note = result.usingSaved ? '' : ' (bằng cấu hình chưa lưu)';
      setSuccess(`Đã gửi mail thử tới ${to.trim()} lúc ${at}${note}.`);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'mail-settings'] });
    },
    onError: (err) => {
      setSuccess('');
      setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra khi gửi mail thử.');
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAllowedTestRecipient(to)) {
      setSuccess('');
      setError('Email nhận thử phải thuộc miền @fpt.edu.vn hoặc @fe.edu.vn.');
      return;
    }
    testMutation.mutate();
  }

  return (
    <SurfaceCard className="space-y-4 p-5" aria-labelledby="mail-test-heading">
      <div>
        <h2 id="mail-test-heading" className="font-display text-lg font-semibold text-fpt-blue-900">
          Gửi mail thử
        </h2>
        <p className="mt-1 text-sm text-muted">
          {dirty ? 'Sẽ thử bằng cấu hình đang nhập (chưa lưu).' : 'Sẽ thử bằng cấu hình đã lưu.'}{' '}
          Tối đa 5 lần mỗi phút.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <FormError>{error}</FormError>
        {success ? <FormSuccess>{success}</FormSuccess> : null}
        <div>
          <Label htmlFor="mail-test-to">Gửi tới</Label>
          <Input
            id="mail-test-to"
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            placeholder="ten@fpt.edu.vn"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-describedby="mail-test-to-hint"
            required
          />
          <p id="mail-test-to-hint" className="mt-1 text-xs text-muted">
            {RECIPIENT_HINT}
          </p>
        </div>
        <Button
          type="submit"
          variant="secondary"
          className="w-full"
          disabled={blocked || testMutation.isPending || to.trim().length === 0}
          title={
            blocked ? 'Đang chặn gửi email ra ngoài (NOTIFICATIONS_EXTERNAL_DISABLED)' : undefined
          }
        >
          {testMutation.isPending ? 'Đang gửi…' : 'Gửi mail thử'}
        </Button>
      </form>
    </SurfaceCard>
  );
}
