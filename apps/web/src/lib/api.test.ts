import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiDownload, apiFetch } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch — lỗi luôn là ApiError tiếng Việt', () => {
  it('trả dữ liệu khi thành công', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: 1, error: null })),
    );
    await expect(apiFetch<number>('/x')).resolves.toBe(1);
  });

  it('mất mạng / API tắt: không lộ "Failed to fetch"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await caught(apiFetch('/x'));
    expect(error.status).toBe(0);
    expect(error.message).toBe('Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.');
  });

  it('máy chủ trả HTML (502 từ proxy): không lộ lỗi parse JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 })),
    );
    const error = await caught(apiFetch('/x'));
    expect(error.status).toBe(502);
    expect(error.message).toBe('Máy chủ đang bận hoặc gặp sự cố (mã 502). Vui lòng thử lại.');
  });

  it('giữ nguyên câu lỗi tiếng Việt từ API', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(404, { success: false, data: null, error: 'Không tìm thấy sinh viên.' }),
        ),
    );
    const error = await caught(apiFetch('/x'));
    expect(error.message).toBe('Không tìm thấy sinh viên.');
  });
});

describe('apiDownload — lỗi tải file', () => {
  it('máy chủ lỗi không trả JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops', { status: 500 })));
    const error = await caught(apiDownload('/x', 'a.xlsx'));
    expect(error.message).toBe('Máy chủ đang bận hoặc gặp sự cố (mã 500). Vui lòng thử lại.');
  });

  it('mất mạng', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await caught(apiDownload('/x', 'a.xlsx'));
    expect(error.status).toBe(0);
  });
});
