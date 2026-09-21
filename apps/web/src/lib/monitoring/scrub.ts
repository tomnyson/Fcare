/**
 * Lọc dữ liệu trước khi gửi sang Bugsnag (rule bảo mật #1): query string có thể
 * chứa từ khoá tìm tên sinh viên, chữ trên nút bấm có thể là tên người, log
 * console có thể in cả bản ghi — những thứ này không được rời khỏi trình duyệt.
 */

const URL_WITH_QUERY = /((?:https?:\/\/[^\s?#]+)?\/[^\s?#]*)[?#][^\s]*/g;

export function scrubUrl<T extends string | null>(url: T): T {
  if (!url) return url;
  return url.replace(/[?#].*$/, '') as T;
}

export function scrubUrlsInText(text: string): string {
  return text.replace(URL_WITH_QUERY, '$1');
}

interface BreadcrumbLike {
  type: string;
  message: string;
  metadata: Record<string, unknown>;
}

function isPrimitive(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

/** false = bỏ breadcrumb. SDK yêu cầu sửa trực tiếp object được truyền vào. */
export function scrubBreadcrumb(breadcrumb: BreadcrumbLike): boolean {
  if (breadcrumb.type === 'log') return false;
  // Chỉ giữ giá trị nguyên thuỷ: object lồng (vd `state` của history = cây router Next)
  // chứa nguyên query/dữ liệu trang mà không lọc từng chỗ được.
  const entries = Object.entries(breadcrumb.metadata)
    .filter(([key, value]) => key !== 'targetText' && isPrimitive(value))
    .map(([key, value]) => [key, typeof value === 'string' ? scrubUrlsInText(value) : value]);
  breadcrumb.metadata = Object.fromEntries(entries);
  breadcrumb.message = scrubUrlsInText(breadcrumb.message);
  return true;
}
