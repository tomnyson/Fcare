'use client';

import { UnexpectedError } from '../../components/errors/error-screen';

/** Lỗi giao diện trong dashboard — giữ nguyên menu để người dùng đi tiếp. */
export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <UnexpectedError onRetry={reset} />;
}
