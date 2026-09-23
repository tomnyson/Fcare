'use client';

import { Button } from '@fcare/ui-kit';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FormError, Input, Label } from '../../components/ui/form';
import { BrandMark } from '../../components/ui/brand-mark';
import { apiFetch, ApiError, probeSession } from '../../lib/api';
import { recaptcha } from '../../lib/recaptcha';
import { RecaptchaCheckbox } from '../../components/auth/recaptcha-checkbox';
import type { LoginResult } from '../../lib/types';

interface GoogleVerifyResult {
  requiresLinking: true;
  challenge: { challenge: string; expiresAt: number };
}

const SECURITY_NOTES = [
  'Hệ thống không lưu CCCD, số điện thoại, email hay địa chỉ.',
  'Giảng viên chỉ truy cập sinh viên thuộc bộ môn của mình.',
  'Mỗi lần đăng nhập đều yêu cầu cam kết không chia sẻ dữ liệu.',
];

const AFTER_LOGIN_PATH = '/dashboard';

export interface LoginViewProps {
  checkSession: boolean;
  recaptchaEnabled?: boolean;
}

/** `checkSession`: trình duyệt có cookie phiên → hỏi API trước, còn phiên thì vào thẳng dashboard. */
export function LoginView({ checkSession, recaptchaEnabled = recaptcha.enabled }: LoginViewProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(checkSession);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [staffCode, setStaffCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [recaptchaReset, setRecaptchaReset] = useState(0);

  // Trạng thái liên kết tài khoản Google
  const [linkingChallenge, setLinkingChallenge] = useState<string | null>(null);
  const [linkingExpiresAt, setLinkingExpiresAt] = useState<number | null>(null);
  const [linkStaffCode, setLinkStaffCode] = useState('');
  const [linkPassword, setLinkPassword] = useState('');

  useEffect(() => {
    if (!checkSession) return;
    let cancelled = false;
    void probeSession().then((alive) => {
      if (cancelled) return;
      if (alive) router.replace(AFTER_LOGIN_PATH);
      else setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [checkSession, router]);

  // Effect khởi tạo GSI chỉ chạy một lần; giữ handler mới nhất qua ref để
  // callback của Google không dính closure cũ mà không phải re-init widget.
  const onGoogleCredentialRef = useRef<(credential: string) => Promise<void>>(async () => {});
  onGoogleCredentialRef.current = onGoogleCredential;

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    interface GoogleGsiWindow {
      google?: {
        accounts?: {
          id?: {
            initialize: (config: Record<string, unknown>) => void;
            renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          };
        };
      };
    }

    function initGoogle() {
      const google = (window as unknown as GoogleGsiWindow).google;
      if (!google?.accounts?.id) return;
      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential: string }) => {
            void onGoogleCredentialRef.current(response.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        if (googleBtnRef.current) {
          googleBtnRef.current.innerHTML = '';
          google.accounts.id.renderButton(googleBtnRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
            width: 360,
            logo_alignment: 'left',
          });
        }
        setGoogleReady(true);
      } catch (err) {
        console.error('Lỗi khởi tạo Google GSI:', err);
      }
    }

    if ((window as unknown as GoogleGsiWindow).google?.accounts?.id) {
      initGoogle();
      return;
    }

    const existingScript = document.getElementById('google-gsi-client');
    if (existingScript) {
      existingScript.addEventListener('load', initGoogle);
      return () => {
        existingScript.removeEventListener('load', initGoogle);
      };
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = initGoogle;
    document.head.appendChild(script);
  }, []);

  async function onGoogleCredential(credential: string) {
    setError('');
    setSubmitting(true);
    try {
      const result = await apiFetch<LoginResult | GoogleVerifyResult>('/auth/google/verify', {
        method: 'POST',
        body: JSON.stringify({ idToken: credential }),
      });

      if ('user' in result && result.user) {
        router.push(result.mustChangePassword ? '/change-password' : '/consent');
      } else if ('requiresLinking' in result && result.requiresLinking) {
        // Backend trả về challenge → hiển thị form liên kết tài khoản
        setLinkingChallenge(result.challenge.challenge);
        setLinkingExpiresAt(result.challenge.expiresAt);
        setSubmitting(false);
      } else {
        setError('Đăng nhập Google không thành công. Vui lòng thử lại.');
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Đăng nhập Google không thành công.');
      setSubmitting(false);
    }
  }

  async function onLinkSubmit(event: FormEvent) {
    event.preventDefault();
    if (!linkingChallenge) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await apiFetch<LoginResult>('/auth/google/link', {
        method: 'POST',
        body: JSON.stringify({
          challenge: linkingChallenge,
          staffCode: linkStaffCode,
          password: linkPassword,
        }),
      });
      router.push(result.mustChangePassword ? '/change-password' : '/consent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Liên kết tài khoản không thành công.');
      setSubmitting(false);
    }
  }

  function cancelLinking() {
    setLinkingChallenge(null);
    setLinkingExpiresAt(null);
    setLinkStaffCode('');
    setLinkPassword('');
    setError('');
    setSubmitting(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (recaptchaEnabled && !recaptchaToken) {
      setError('Vui lòng tick ô "Tôi không phải người máy" trước khi đăng nhập.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const result = await apiFetch<LoginResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ staffCode, password, recaptchaToken: recaptchaToken ?? undefined }),
      });
      router.push(result.mustChangePassword ? '/change-password' : '/consent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể kết nối máy chủ.');
      setSubmitting(false);
      if (recaptchaEnabled) {
        // Google chỉ nhận mỗi token một lần — lần thử sau phải tick lại.
        setRecaptchaToken(null);
        setRecaptchaReset((count) => count + 1);
      }
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
          <BrandMark size={40} priority />
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
        {checking ? (
          <p role="status" className="text-sm text-muted">
            Đang kiểm tra phiên đăng nhập…
          </p>
        ) : null}

        {/* Form liên kết tài khoản Google */}
        {!checking && linkingChallenge ? (
          <form onSubmit={onLinkSubmit} className="w-full max-w-sm space-y-5" noValidate>
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-fpt-blue-900">
                Liên kết tài khoản Google
              </h2>
              <p className="mt-1 text-sm text-muted">
                Email Google này chưa được liên kết với nhân viên nào. Nhập mã nhân viên và mật khẩu
                để liên kết tài khoản.
              </p>
              {linkingExpiresAt ? (
                <p className="mt-2 text-xs text-muted">
                  Yêu cầu hết hạn lúc{' '}
                  <span className="font-medium">
                    {new Date(linkingExpiresAt).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  .
                </p>
              ) : null}
            </div>

            <FormError>{error}</FormError>

            <div>
              <Label htmlFor="linkStaffCode">Mã nhân viên</Label>
              <Input
                id="linkStaffCode"
                name="staffCode"
                autoComplete="username"
                placeholder="vd: gv.binh"
                value={linkStaffCode}
                onChange={(event) => setLinkStaffCode(event.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="linkPassword">Mật khẩu</Label>
              <Input
                id="linkPassword"
                name="password"
                type="password"
                autoComplete="current-password"
                value={linkPassword}
                onChange={(event) => setLinkPassword(event.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Đang liên kết…' : 'Liên kết tài khoản'}
            </Button>

            <button
              type="button"
              onClick={cancelLinking}
              className="w-full text-center text-sm text-muted hover:text-foreground"
            >
              ← Quay lại đăng nhập
            </button>
          </form>
        ) : null}

        {/* Form đăng nhập thông thường */}
        <form
          hidden={checking || linkingChallenge !== null}
          onSubmit={onSubmit}
          className="w-full max-w-sm space-y-5"
          noValidate
        >
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-fpt-blue-900">
              Đăng nhập
            </h2>
            <p className="mt-1 text-sm text-muted">
              Dùng mã nhân viên do nhà trường cấp. Quên mật khẩu? Liên hệ quản trị viên để nhận mật
              khẩu tạm.
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

          {recaptchaEnabled ? (
            <RecaptchaCheckbox onTokenChange={setRecaptchaToken} resetSignal={recaptchaReset} />
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>

          <div className="relative py-1 text-center text-xs text-muted before:absolute before:left-0 before:right-0 before:top-1/2 before:border-t before:border-border">
            <span className="relative bg-surface px-3">hoặc</span>
          </div>

          <div ref={googleBtnRef} className="flex min-h-[44px] justify-center" />

          {!googleReady ? (
            <Button type="button" variant="secondary" className="w-full" disabled>
              Đang tải Google…
            </Button>
          ) : null}

          <p className="text-center text-xs text-muted">
            Sau khi đăng nhập bạn sẽ được yêu cầu xác nhận cam kết bảo mật dữ liệu.
          </p>
        </form>
      </section>
    </main>
  );
}
