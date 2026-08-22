'use client';

import { Button, SurfaceCard } from '@fcare/ui-kit';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormError } from '../../components/ui/form';
import { apiFetch, ApiError } from '../../lib/api';
import type { AuthUser } from '../../lib/types';

const COMMITMENTS = [
  'Không chia sẻ, sao chép hay phát tán dữ liệu sinh viên ra ngoài hệ thống.',
  'Chỉ sử dụng dữ liệu cho mục đích chăm sóc và hỗ trợ học vụ.',
  'Không tự ý thu thập thêm thông tin cá nhân nhạy cảm (CCCD, SĐT, email, địa chỉ).',
  'Báo ngay cho quản trị viên khi phát hiện truy cập bất thường hoặc rò rỉ dữ liệu.',
];

export default function ConsentPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onConfirm() {
    setError('');
    setSubmitting(true);
    try {
      await apiFetch<{ user: AuthUser }>('/auth/consent', { method: 'POST' });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể kết nối máy chủ.');
      setSubmitting(false);
    }
  }

  async function onDecline() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fpt-blue-900 p-6">
      <SurfaceCard className="w-full max-w-xl border-t-4 border-t-fpt-orange">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-fpt-blue-900">
          Cam kết bảo mật dữ liệu
        </h1>
        <p className="mt-2 text-sm text-muted">
          Theo quy định của hệ thống FCare, bạn phải xác nhận cam kết dưới đây <strong>mỗi lần
          đăng nhập</strong> trước khi truy cập dữ liệu sinh viên.
        </p>

        <ul className="mt-6 space-y-3">
          {COMMITMENTS.map((commitment, index) => (
            <li key={commitment} className="flex items-start gap-3 text-sm text-ink">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fpt-orange-50 text-xs font-bold text-fpt-orange">
                {index + 1}
              </span>
              {commitment}
            </li>
          ))}
        </ul>

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-md border border-border bg-fpt-orange-50/50 p-4 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--color-fpt-orange)]"
          />
          Tôi đã đọc, hiểu và cam kết tuân thủ toàn bộ quy định bảo mật dữ liệu nêu trên.
        </label>

        <div className="mt-4">
          <FormError>{error}</FormError>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onDecline}>
            Từ chối & đăng xuất
          </Button>
          <Button type="button" disabled={!agreed || submitting} onClick={onConfirm}>
            {submitting ? 'Đang xác nhận…' : 'Xác nhận cam kết'}
          </Button>
        </div>
      </SurfaceCard>
    </main>
  );
}
