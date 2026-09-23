import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from '../ui/brand-mark';

const ACTION_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold ' +
  'transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange';
const ACTION_PRIMARY = `${ACTION_BASE} bg-fpt-orange text-white hover:bg-fpt-orange-600 active:bg-fpt-orange-600`;
const ACTION_GHOST = `${ACTION_BASE} border border-border text-ink hover:bg-fpt-orange-50 active:bg-fpt-orange-50`;

interface ErrorScreenProps {
  code: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}

/** Mã lỗi cỡ lớn, chữ số giữa màu cam — dấu nhấn duy nhất của màn hình. */
function ErrorCode({ code }: { code: string }) {
  return (
    <p
      aria-hidden
      className="font-[family-name:var(--font-display)] text-[clamp(4.5rem,3rem+8vw,8.5rem)] font-extrabold leading-none tracking-tight text-fpt-blue-900 tabular-nums"
    >
      {code.split('').map((digit, index) => (
        <span key={index} className={index === 1 ? 'text-fpt-orange' : undefined}>
          {digit}
        </span>
      ))}
    </p>
  );
}

function ErrorBody({ code, eyebrow, title, children, actions }: ErrorScreenProps) {
  return (
    <div className="max-w-xl">
      <ErrorCode code={code} />
      <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-fpt-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-fpt-orange">
        Lỗi {code} · {eyebrow}
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold text-fpt-blue-900 sm:text-3xl">
        {title}
      </h1>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted sm:text-base">
        {children}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">{actions}</div>
    </div>
  );
}

/** 404 toàn trang — hiện cả khi chưa đăng nhập nên không dựa vào khung dashboard. */
export function PageNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="bg-fpt-blue-900 px-4 py-4 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-3 rounded-md text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange"
        >
          <BrandMark size={32} priority />
          <span className="font-[family-name:var(--font-display)] text-lg font-bold">FCare</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center px-4 py-12 sm:px-8 lg:px-16">
        <ErrorBody
          code="404"
          eyebrow="Sai đường dẫn"
          title="Không tìm thấy trang"
          actions={
            <>
              <Link href="/dashboard" className={ACTION_PRIMARY}>
                Về Tổng quan
              </Link>
              <Link href="/" className={ACTION_GHOST}>
                Trang chủ
              </Link>
            </>
          }
        >
          <p>Đường dẫn bạn mở không tồn tại hoặc đã được đổi.</p>
          <p>Hãy kiểm tra lại địa chỉ, hoặc quay về Tổng quan để tìm từ menu.</p>
        </ErrorBody>
      </main>
      <footer className="px-4 pb-6 text-xs text-muted sm:px-8">
        FPT Education · Hệ thống nội bộ
      </footer>
    </div>
  );
}

/** 403 nằm trong khung dashboard — người dùng vẫn thấy menu những trang mình được mở. */
export function AccessDenied() {
  return (
    <section className="rounded-[var(--radius-card)] border-l-4 border-fpt-orange bg-surface-raised p-6 shadow-[var(--shadow-card)] sm:p-10">
      <ErrorBody
        code="403"
        eyebrow="Không đủ quyền"
        title="Bạn không có quyền truy cập trang này"
        actions={
          <Link href="/dashboard" className={ACTION_PRIMARY}>
            Về Tổng quan
          </Link>
        }
      >
        <p>Trang này chỉ dành cho một số vai trò nhất định.</p>
        <p>
          Nếu bạn cần dùng chức năng này, hãy liên hệ quản trị viên để được cấp vai trò phù hợp.
        </p>
      </ErrorBody>
    </section>
  );
}
