import { createSessionProbe } from './session-probe';
import { createSessionRefresher, type RefreshResult } from './session-refresh';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  code?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildInit(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (init?.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  return { ...init, headers, credentials: 'include' };
}

async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, buildInit(init));
}

const refreshOnce = createSessionRefresher({
  post: () => rawFetch('/auth/refresh', { method: 'POST' }),
  locks: typeof navigator !== 'undefined' ? navigator.locks : undefined,
});

/** Mốc làm mới gần nhất (tính từ lúc tải trang) — `useSessionKeepAlive` dựa vào đây. */
let lastSessionRefreshAt = Date.now();

export function getLastSessionRefreshAt(): number {
  return lastSessionRefreshAt;
}

/** Làm mới phiên — gộp mọi lời gọi đồng thời thành một lượt (xem `session-refresh.ts`). */
export async function refreshSession(): Promise<RefreshResult> {
  const result = await refreshOnce();
  if (result === 'ok') lastSessionRefreshAt = Date.now();
  return result;
}

/** Phiên còn sống (có refresh nếu cần)? — không bao giờ tự chuyển trang. */
export const probeSession = createSessionProbe({
  me: () => rawFetch('/auth/me'),
  refresh: refreshSession,
});

export function redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

/** Điều hướng theo mã lỗi nghiệp vụ của consent gate / mật khẩu tạm. */
function redirectForCode(code: string | undefined): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (code === 'CONSENT_REQUIRED') {
    window.location.href = '/consent';
    return true;
  }
  if (code === 'PASSWORD_CHANGE_REQUIRED') {
    window.location.href = '/change-password';
    return true;
  }
  return false;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await rawFetch(path, init);

  // Access token hết hạn → thử refresh một lần rồi gọi lại.
  if (response.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    const refreshed = await refreshSession();
    if (refreshed === 'ok') {
      response = await rawFetch(path, init);
    } else if (refreshed === 'unauthorized') {
      redirectToLogin();
      throw new ApiError('Phiên đăng nhập đã hết hạn.', 401);
    } else {
      // Mạng chập chờn không phải hết phiên — báo lỗi, KHÔNG đá về /login.
      throw new ApiError('Không kết nối được máy chủ. Vui lòng thử lại.', 0);
    }
  }

  const body = (await response.json()) as ApiEnvelope<T>;
  if (!body.success || !response.ok) {
    if (redirectForCode(body.code)) {
      throw new ApiError(body.error ?? 'Cần hoàn tất bước xác nhận.', response.status, body.code);
    }
    throw new ApiError(body.error ?? 'Đã xảy ra lỗi.', response.status, body.code);
  }
  return body.data as T;
}

/** Tải file Excel export (blob) và kích hoạt download trên trình duyệt. */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  let response = await rawFetch(path);
  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed === 'unauthorized') {
      redirectToLogin();
      return;
    }
    if (refreshed === 'error') {
      throw new ApiError('Không kết nối được máy chủ. Vui lòng thử lại.', 0);
    }
    response = await rawFetch(path);
  }
  if (!response.ok) {
    const body = (await response.json()) as ApiEnvelope<never>;
    throw new ApiError(body.error ?? 'Không thể tải file.', response.status, body.code);
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? fallbackName;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function apiUpload<T>(
  path: string,
  file: File,
  fields?: Record<string, string>,
): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);
  for (const [key, value] of Object.entries(fields ?? {})) {
    formData.append(key, value);
  }
  return apiFetch<T>(path, { method: 'POST', body: formData });
}
