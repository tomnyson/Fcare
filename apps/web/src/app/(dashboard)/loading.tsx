import { LoadingSpinner } from '../../components/ui/loading-spinner';

export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Đang tải dữ liệu trang"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 py-12"
    >
      <div className="rounded-full bg-fpt-orange-50 p-4 border border-fpt-orange/20 shadow-xs">
        <LoadingSpinner size="lg" tone="orange" label="Đang tải trang…" />
      </div>
      <p className="font-display text-base font-semibold text-fpt-blue-900">
        Đang tải dữ liệu trang…
      </p>
      <p className="text-xs text-muted">Vui lòng chờ trong giây lát</p>
    </div>
  );
}
