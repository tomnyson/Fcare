const LOCAL_FALLBACK = 'http://localhost:3000';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

type EnvReader = Partial<Record<'WEB_BASE_URL' | 'WEB_ORIGIN', string>>;

/** Bỏ khoảng trắng + dấu `/` cuối; chuỗi rỗng → null. */
export function normalizePublicWebUrl(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '') ?? '';
  return trimmed || null;
}

/**
 * Địa chỉ web công khai dùng để dựng link trong email/push.
 * Thứ tự: ADMIN lưu trong DB → `WEB_BASE_URL` → `WEB_ORIGIN` → localhost.
 * Server deploy thiếu `WEB_ORIGIN` từng khiến nút "Xem chi tiết trên FCare"
 * trong mail trỏ về localhost — ADMIN sửa được ngay trên web, không cần SSH.
 */
export function resolvePublicWebUrl(
  dbValue: string | null | undefined,
  env: EnvReader,
): string {
  return (
    normalizePublicWebUrl(dbValue) ??
    normalizePublicWebUrl(env.WEB_BASE_URL) ??
    normalizePublicWebUrl(env.WEB_ORIGIN) ??
    LOCAL_FALLBACK
  );
}

export function isLocalWebUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
