export type ClassSectionsViewMode = 'card' | 'list';

export const CLASSES_VIEW_MODE_STORAGE_KEY = 'fcare_classes_view_mode';

/**
 * Phân giải chế độ xem theo thứ tự ưu tiên:
 * 1. URL query param (?view=card hoặc ?view=list)
 * 2. Lưu trữ trong localStorage
 * 3. Mặc định 'card' (thẻ)
 */
export function resolveViewMode(
  queryParam?: string | null,
  storedValue?: string | null,
): ClassSectionsViewMode {
  if (queryParam === 'card' || queryParam === 'list') {
    return queryParam;
  }
  if (storedValue === 'card' || storedValue === 'list') {
    return storedValue;
  }
  return 'card';
}
