
import { LoadingSpinner } from '../components/ui/loading-spinner';

export default function RootLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Đang tải trang"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface p-6"
    >
      <div className="rounded-full bg-fpt-orange-50 p-4 border border-fpt-orange/20 shadow-xs">
        <LoadingSpinner size="lg" tone="orange" label="Đang tải…" />
      </div>
      <p className="font-display text-sm font-semibold text-fpt-blue-900">
        Đang chuẩn bị trang…
      </p>
    </div>
  );
}
