import type { CSSProperties } from 'react';

/**
 * Hiện dần khi cuộn ở landing page. Hàm thuần tách riêng để test không cần DOM;
 * phần gắn IntersectionObserver nằm ở `components/landing/scroll-reveal.tsx`.
 */

/** Phần tử có mép trên nằm trong 10% cuối màn hình vẫn tính là "chưa thấy". */
const FOLD_RATIO = 0.9;

/** Tối đa 5 bước so le (0–4) — danh sách dài không bắt người xem chờ. */
export const MAX_REVEAL_STAGGER = 4;

export const REVEAL_ATTR = 'data-reveal';

/**
 * Chỉ ẩn trước phần tử chưa cuộn tới. Thứ đã hiện sẵn lúc tải được giữ nguyên,
 * tránh nháy "hiện → ẩn → hiện" sau khi hydrate.
 */
export function shouldDeferReveal(rectTop: number, viewportHeight: number): boolean {
  return rectTop > viewportHeight * FOLD_RATIO;
}

export function revealIndexStyle(index: number): CSSProperties {
  const safe = Number.isFinite(index)
    ? Math.min(Math.max(Math.trunc(index), 0), MAX_REVEAL_STAGGER)
    : 0;
  return { '--reveal-index': safe } as CSSProperties;
}

/**
 * Chỉ số (theo thứ tự tài liệu) mà mọi phần tử từ đầu tới đó phải hiện. Nhảy
 * thẳng xuống cuối trang (End, cuộn nhanh) khiến phần tử phía trên đi từ "dưới
 * màn hình" sang "trên màn hình" mà không lần nào giao cắt — observer không báo,
 * nên phần tử phía dưới hiện thì kéo theo mọi phần tử đứng trước.
 */
export function revealCutoff(current: number, hitIndices: readonly number[]): number {
  return Math.max(current, ...hitIndices);
}
