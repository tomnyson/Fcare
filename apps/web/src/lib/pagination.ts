/**
 * Toán phân trang dùng chung cho cả danh sách phân trang phía API
 * (`Paginated<T>`) lẫn danh sách cắt trang phía web (danh mục nhỏ đã tải
 * hết). Tách khỏi component để kiểm thử thuần và để mọi trang tính giống nhau.
 */

/** Số trang — tối thiểu 1 để "Trang 1/1" khi rỗng thay vì "1/0". */
export function pageCount(total: number, limit: number): number {
  if (limit <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / limit));
}

/** Ép trang về [1, totalPages] — bộ lọc đổi làm tổng giảm thì không kẹt ở trang trống. */
export function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), Math.max(1, totalPages));
}

/** Đọc `?page=` từ URL — giá trị lạ (chữ, 0, âm) về trang 1. */
export function parsePageParam(value: string | null): number {
  const parsed = Number(value ?? '1');
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/** Cắt một trang khỏi mảng đã tải hết (danh mục môn học, lớp học phần…). */
export function pageSlice<T>(items: readonly T[], page: number, limit: number): T[] {
  const safePage = clampPage(page, pageCount(items.length, limit));
  const start = (safePage - 1) * limit;
  return items.slice(start, start + limit);
}

/** "1–50 / 2851" — khoảng dòng đang hiện, rỗng thì "0 / 0". */
export function pageRangeLabel(page: number, limit: number, total: number): string {
  if (total <= 0) return '0 / 0';
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return `${start}–${end} / ${total}`;
}
