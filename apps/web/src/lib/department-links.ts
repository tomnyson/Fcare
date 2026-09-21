import type { StudentStatus } from './types';

/**
 * Link từ thẻ "Theo bộ môn" ở Tổng quan sang danh sách đã lọc sẵn.
 *
 * Số trên thẻ tính trên MỌI học kỳ (`/statistics/departments` không lọc kỳ),
 * nên link gửi `term=` rỗng: trang đích chỉ tự điền kỳ hiện tại khi URL không
 * có khóa `term`, và khóa rỗng giữ nguyên "Tất cả học kỳ" để số khớp với thẻ.
 */
function withAllTerms(entries: Record<string, string>): string {
  const params = new URLSearchParams(entries);
  params.set('term', '');
  return params.toString();
}

export function departmentStudentsHref(departmentId: string, status?: StudentStatus): string {
  return `/students?${withAllTerms({ departmentId, ...(status ? { status } : {}) })}`;
}

/** Cảnh báo chưa giải quyết (OPEN + ACKNOWLEDGED) — đúng cách thẻ đếm `openAlerts`. */
export function departmentAlertsHref(departmentId: string): string {
  return `/alerts?${withAllTerms({ departmentId, openOnly: 'true' })}`;
}
