'use client';

import { Button, SurfaceCard } from '@fcare/ui-kit';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FormError, Input, Label } from '../../components/ui/form';
import { apiFetch, ApiError } from '../../lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      router.push('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể kết nối máy chủ.');
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fpt-blue-900 p-6">
      <SurfaceCard className="w-full max-w-md border-t-4 border-t-fpt-orange">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-fpt-blue-900">
          Đổi mật khẩu
        </h1>
        <p className="mt-2 text-sm text-muted">
          Bạn đang dùng mật khẩu tạm — hãy đặt mật khẩu mới (tối thiểu 8 ký tự, gồm chữ và số).
          Sau khi đổi, bạn sẽ đăng nhập lại.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <FormError>{error}</FormError>

          <div>
            <Label htmlFor="currentPassword">Mật khẩu hiện tại (mật khẩu tạm)</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="newPassword">Mật khẩu mới</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="confirmPassword">Nhập lại mật khẩu mới</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Đang cập nhật…' : 'Đổi mật khẩu & đăng nhập lại'}
          </Button>
        </form>
      </SurfaceCard>
    </main>
  );
}
