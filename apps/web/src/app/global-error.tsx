'use client';

import { UnexpectedError } from '../components/errors/error-screen';
import './globals.css';

/** Lỗi ở chính layout gốc — Next thay cả <html>, nên phải tự dựng lại. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body className="antialiased">
        <UnexpectedError onRetry={reset} fullPage />
      </body>
    </html>
  );
}
