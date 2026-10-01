'use client';

interface BackButtonProps {
  /** Đích khi không còn lịch sử để lùi (mở trang từ link email, tab mới…). */
  fallbackHref: string;
}

/** Có trang trước trong cùng tab để lùi về không — tab mới mở thẳng thì history chỉ có 1 mục. */
export function canGoBack(historyLength: number): boolean {
  return historyLength > 1;
}

/** Nút "Quay lại" trên tiêu đề trang — thay cho phím Back của trình duyệt. */
export function BackButton({ fallbackHref }: BackButtonProps) {
  // History API trực tiếp (App Router vẫn bắt popstate): không cần `useRouter`
  // nên PageHeader render được cả ngoài cây router (test render tĩnh).
  function goBack() {
    if (canGoBack(window.history.length)) {
      window.history.back();
      return;
    }
    window.location.assign(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="group mb-2 inline-flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm font-medium text-muted transition-colors hover:text-fpt-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange active:translate-y-px"
    >
      <span
        aria-hidden="true"
        className="transition-transform duration-150 group-hover:-translate-x-0.5 motion-reduce:transition-none"
      >
        ←
      </span>
      Quay lại
    </button>
  );
}
