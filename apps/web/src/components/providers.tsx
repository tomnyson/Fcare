'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { getErrorBoundary, startMonitoring } from '../lib/monitoring/bugsnag';
import { ErrorFallback } from './monitoring/error-fallback';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  // Chỉ có ở trình duyệt khi đã cấu hình Bugsnag; boundary không sinh DOM nên không lệch hydrate.
  const [ErrorBoundary] = useState(() => (startMonitoring() ? getErrorBoundary() : null));

  const content = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  if (!ErrorBoundary) return content;
  return <ErrorBoundary FallbackComponent={ErrorFallback}>{content}</ErrorBoundary>;
}
