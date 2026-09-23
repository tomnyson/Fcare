export interface NavigationClickOptions {
  defaultPrevented?: boolean;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target?: string | null;
}

export interface CurrentUrlContext {
  origin: string;
  pathname: string;
  search: string;
}

/**
 * Kiểm tra xem một hành động click vào liên kết có phải là điều hướng
 * nội bộ chuyển sang trang mới hay không để kích hoạt loading indicator.
 */
export function shouldTriggerNavigation(
  href: string | null | undefined,
  currentUrl: CurrentUrlContext,
  options?: NavigationClickOptions,
): boolean {
  if (!href) return false;
  if (options?.defaultPrevented) return false;
  if (options?.button !== undefined && options.button !== 0) return false;
  if (options?.metaKey || options?.ctrlKey || options?.shiftKey || options?.altKey) return false;
  if (options?.target && options.target !== '_self') return false;

  const trimmed = href.trim();
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('javascript:')
  ) {
    return false;
  }

  try {
    const targetUrl = new URL(trimmed, currentUrl.origin);
    // Khác tên miền gốc -> điều hướng ra ngoài, không quản lý loading
    if (targetUrl.origin !== currentUrl.origin) {
      return false;
    }
    // Trùng cả pathname lẫn search params -> cùng trang hiện tại, không tải lại
    if (targetUrl.pathname === currentUrl.pathname && targetUrl.search === currentUrl.search) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
