'use client';

/** Màn hình khi một lỗi render lọt ra ngoài — lỗi đã được gửi sang Bugsnag. */
export function ErrorFallback({ clearError }: { clearError: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <section
        role="alert"
        aria-labelledby="error-fallback-title"
        className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-8 text-center shadow-sm"
      >
        <h1 id="error-fallback-title" className="text-xl font-semibold text-ink">
          Đã có lỗi xảy ra
        </h1>
        <p className="mt-2 text-sm text-muted">
          Hệ thống đã ghi nhận lỗi này. Bạn thử tải lại trang; nếu vẫn lỗi, hãy báo qua nút góp ý ở
          góc phải.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              clearError();
              window.location.reload();
            }}
            className="rounded-md bg-fpt-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-fpt-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-blue focus-visible:ring-offset-2"
          >
            Tải lại trang
          </button>
        </div>
      </section>
    </main>
  );
}
