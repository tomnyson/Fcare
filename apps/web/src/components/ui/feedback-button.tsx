import { FEEDBACK_FORM_URL } from '../../lib/feedback';

/** Nút icon nổi góc phải dưới mở Google Form góp ý / báo lỗi ở tab mới — không gửi kèm dữ liệu người dùng. */
export function FeedbackButton() {
  return (
    <a
      href={FEEDBACK_FORM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Góp ý hoặc báo lỗi (mở Google Form trong tab mới)"
      title="Góp ý / Báo lỗi"
      className="fixed bottom-4 right-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full bg-fpt-orange text-white shadow-[0_6px_20px_color-mix(in_oklab,var(--color-fpt-orange)_35%,transparent)] transition-[transform,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:bg-fpt-orange-600 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-blue focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {/* Icon lá cờ báo cáo */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 21V4" />
        <path d="M5 4h11l-2 4 2 4H5" />
      </svg>
    </a>
  );
}
