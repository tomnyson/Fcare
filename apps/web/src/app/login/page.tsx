'use client';

import { Button } from '@fcare/ui-kit';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FormError, Input, Label } from '../../components/ui/form';
import { apiFetch, ApiError } from '../../lib/api';
import type { LoginResult } from '../../lib/types';

const SECURITY_NOTES = [
  'Hệ thống không lưu CCCD, số điện thoại, email hay địa chỉ.',
  'Giảng viên chỉ truy cập sinh viên thuộc bộ môn của mình.',
  'Mỗi lần đăng nhập đều yêu cầu cam kết không chia sẻ dữ liệu.',
];

export default function LoginPage() {
  const router = useRouter();
  const [staffCode, setStaffCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await apiFetch<LoginResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ staffCode, password }),
      });
      router.push(result.mustChangePassword ? '/change-password' : '/consent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể kết nối máy chủ.');
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Panel thương hiệu */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-fpt-blue-900 p-12 text-white lg:flex">
        <div
          aria-hidden
          className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-fpt-orange/20 blur-3xl"
        />
        <Link href="/" className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-fpt-orange font-[family-name:var(--font-display)] text-xl font-extrabold">
            F
          </span>
          <span className="font-[family-name:var(--font-display)] text-xl font-bold">FCare</span>
        </Link>

        <div className="relative max-w-md">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold leading-tight">
            Chăm sóc sinh viên,
            <br />
            <span className="text-fpt-orange">bảo mật dữ liệu</span> là ưu tiên số một.
          </h1>
          <ul className="mt-8 space-y-3 text-sm text-white/85">
            {SECURITY_NOTES.map((note) => (
              <li key={note} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-0.5 text-fpt-orange">
                  ●
                </span>
                {note}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">FPT Education · Hệ thống nội bộ</p>
      </section>

      {/* Form đăng nhập */}
      <section className="flex items-center justify-center bg-surface p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5" noValidate>
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-fpt-blue-900">
              Đăng nhập
            </h2>
            <p className="mt-1 text-sm text-muted">
              Dùng mã nhân viên do nhà trường cấp. Quên mật khẩu? Liên hệ quản trị viên để nhận
              mật khẩu tạm.
            </p>
          </div>

          <FormError>{error}</FormError>

          <div>
            <Label htmlFor="staffCode">Mã nhân viên</Label>
            <Input
              id="staffCode"
              name="staffCode"
              autoComplete="username"
              placeholder="vd: gv.binh"
              value={staffCode}
              onChange={(event) => setStaffCode(event.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Mật khẩu</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>

          <p className="text-center text-xs text-muted">
            Sau khi đăng nhập bạn sẽ được yêu cầu xác nhận cam kết bảo mật dữ liệu.
          </p>
        </form>
      </section>
    </main>
  );
}
