import { Skeleton } from '../ui/skeleton';

/**
 * Khung dashboard lúc chưa có phiên làm việc. Giữ nguyên tỉ lệ sidebar/topbar
 * của layout thật để khi dữ liệu về, nội dung điền vào chỗ trống thay vì
 * toàn trang bị thay bằng một dòng chữ rồi bung lại.
 */
export function ShellSkeleton() {
  return (
    <div
      role="status"
      aria-busy
      aria-label="Đang tải phiên làm việc"
      className="flex min-h-screen bg-surface"
    >
      <aside className="flex w-60 shrink-0 flex-col bg-fpt-blue-900 max-lg:w-16">
        <div className="flex items-center gap-3 px-5 py-5 max-lg:justify-center max-lg:px-2">
          <span aria-hidden className="h-9 w-9 shrink-0 rounded-lg bg-fpt-orange/40" />
          <span aria-hidden className="h-4 w-24 rounded bg-white/15 max-lg:hidden" />
        </div>
        <div className="mt-2 space-y-2 px-3 max-lg:px-2">
          {Array.from({ length: 6 }, (_, index) => (
            <span
              key={index}
              aria-hidden
              className="block h-9 animate-pulse rounded-md bg-white/10 motion-reduce:animate-none"
            />
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-white px-6 py-3">
          <Skeleton className="h-4 w-56 max-sm:hidden" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-6 lg:p-8">
          <PageSkeleton />
        </main>
      </div>
    </div>
  );
}

/** Khung nội dung một trang dashboard: tiêu đề + thanh lọc + bảng. */
export function PageSkeleton() {
  return (
    <>
      <div className="mb-6 border-b-2 border-fpt-orange/20 pb-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <Skeleton className="mb-4 h-24 w-full rounded-[var(--radius-card)]" />
      <Skeleton className="h-96 w-full rounded-[var(--radius-card)]" />
    </>
  );
}
