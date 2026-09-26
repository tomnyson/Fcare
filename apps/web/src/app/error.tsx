'use client';

import { UnexpectedError } from '../components/errors/error-screen';

/** Lỗi giao diện ngoài khung dashboard (đăng nhập, cam kết…). */
export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <UnexpectedError onRetry={reset} fullPage />;
}
