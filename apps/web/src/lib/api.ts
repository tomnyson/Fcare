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

/** status 0 = không tới được máy chủ (mất mạng, API tắt) — không phải API từ chối. */
export const NETWORK_ERROR_MESSAGE =
  'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';

/** Như `rawFetch` nhưng lỗi mạng ("Failed to fetch") thành ApiError tiếng Việt. */
async function fetchOrThrow(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await rawFetch(path, init);
  } catch {
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
  }
}

/** Đọc envelope; máy chủ/proxy trả HTML (502, 504…) thì báo câu tiếng Việt thay vì lỗi parse JSON. */
async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError(
      `Máy chủ đang bận hoặc gặp sự cố (mã ${response.status}). Vui lòng thử lại.`,
      response.status,
    );
  }
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
  let response = await fetchOrThrow(path, init);

  // Access token hết hạn → thử refresh một lần rồi gọi lại.
  if (response.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    const refreshed = await refreshSession();
    if (refreshed === 'ok') {
      response = await fetchOrThrow(path, init);
    } else if (refreshed === 'unauthorized') {
      redirectToLogin();
      throw new ApiError('Phiên đăng nhập đã hết hạn.', 401);
    } else {
      // Mạng chập chờn không phải hết phiên — báo lỗi, KHÔNG đá về /login.
      throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
    }
  }

  const body = await readEnvelope<T>(response);
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
  let response = await fetchOrThrow(path);
  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed === 'unauthorized') {
      redirectToLogin();
      return;
    }
    if (refreshed === 'error') {
      throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
    }
    response = await fetchOrThrow(path);
  }
  if (!response.ok) {
    const body = await readEnvelope<never>(response);
    throw new ApiError(body.error ?? 'Không thể tải file.', response.status, body.code);
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? fallbackName;

  const blob = await response.blob().catch(() => {
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
  });
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

/**
 * Đọc envelope của phản hồi upload có tiến độ; lỗi → ApiError (kèm chuyển trang
 * consent / mật khẩu tạm) — cùng quy tắc với phần cuối `apiFetch`.
 */
async function unwrapEnvelope<T>(response: Response): Promise<T> {
  const body = await readEnvelope<T>(response);
  if (!body.success || !response.ok) {
    if (redirectForCode(body.code)) {
      throw new ApiError(body.error ?? 'Cần hoàn tất bước xác nhận.', response.status, body.code);
    }
    throw new ApiError(body.error ?? 'Đã xảy ra lỗi.', response.status, body.code);
  }
  return body.data as T;
}

interface XhrReply {
  status: number;
  text: string;
}

/** Một lượt gửi multipart qua XHR — fetch không báo được byte đã gửi. */
function sendWithProgress(
  path: string,
  formData: FormData,
  onUploadProgress: (ratio: number | null) => void,
): Promise<XhrReply> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.upload.onprogress = (event) => {
      onUploadProgress(event.lengthComputable && event.total > 0 ? event.loaded / event.total : null);
    };
    // File nhỏ có thể không bắn onprogress lần nào — luôn chốt "đã gửi xong".
    xhr.upload.onload = () => onUploadProgress(1);
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new ApiError(NETWORK_ERROR_MESSAGE, 0));
    xhr.send(formData);
  });
}

/**
 * Như `apiUpload` nhưng báo tiến độ gửi file (0..1, null = không đo được).
 * Giữ hợp đồng `apiFetch`: CSRF header, cookie, envelope, 401 → làm mới phiên
 * rồi gửi lại MỘT lần, chuyển trang theo mã consent / mật khẩu tạm.
 */
export async function apiUploadWithProgress<T>(
  path: string,
  file: File,
  fields: Record<string, string> | undefined,
  onUploadProgress: (ratio: number | null) => void,
): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);
  for (const [key, value] of Object.entries(fields ?? {})) {
    formData.append(key, value);
  }

  let reply = await sendWithProgress(path, formData, onUploadProgress);
  if (reply.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed === 'unauthorized') {
      redirectToLogin();
      throw new ApiError('Phiên đăng nhập đã hết hạn.', 401);
    }
    if (refreshed === 'error') {
      // Mạng chập chờn không phải hết phiên — báo lỗi, KHÔNG đá về /login.
      throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
    }
    reply = await sendWithProgress(path, formData, onUploadProgress);
  }
  if (reply.status === 0) {
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
  }
  return unwrapEnvelope<T>(new Response(reply.text, { status: reply.status }));
}
