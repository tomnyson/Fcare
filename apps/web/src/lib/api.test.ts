import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiDownload, apiFetch, apiUploadWithProgress } from './api';

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

type FakeReply = { status: number; body: unknown; progress?: 'computable' | 'unknown' | 'none' } | 'network-error';

/** XHR giả tối thiểu: mỗi `send` lấy một phản hồi dựng sẵn theo thứ tự. */
class FakeXhr {
  static replies: FakeReply[] = [];
  static sent: FakeXhr[] = [];
  upload: {
    onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
    onload: (() => void) | null;
  } = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 0;
  responseText = '';
  withCredentials = false;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers = { ...this.headers, [name]: value };
  }

  send(body: unknown) {
    this.body = body;
    FakeXhr.sent.push(this);
    const reply = FakeXhr.replies.shift() ?? 'network-error';
    queueMicrotask(() => {
      if (reply === 'network-error') {
        this.onerror?.();
        return;
      }
      if (reply.progress !== 'none') {
        const computable = reply.progress !== 'unknown';
        this.upload.onprogress?.({ lengthComputable: computable, loaded: 50, total: computable ? 100 : 0 });
      }
      this.upload.onload?.();
      this.status = reply.status;
      this.responseText = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body);
      this.onload?.();
    });
  }
}

function useFakeXhr(replies: FakeReply[]) {
  FakeXhr.replies = [...replies];
  FakeXhr.sent = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
}

const file = new File(['x'], 'diem-danh.xlsx');

describe('apiUploadWithProgress — upload có % mà vẫn giữ hợp đồng apiFetch', () => {
  it('báo % byte đã gửi, luôn báo 1 khi gửi xong, trả data', async () => {
    useFakeXhr([{ status: 200, body: { success: true, data: { id: 'b1' }, error: null } }]);
    const ratios: Array<number | null> = [];
    const result = await apiUploadWithProgress<{ id: string }>(
      '/imports/roster/upload',
      file,
      { term: 'FA26' },
      (ratio) => ratios.push(ratio),
    );
    expect(result).toEqual({ id: 'b1' });
    expect(ratios).toEqual([0.5, 1]);
    const [xhr] = FakeXhr.sent;
    expect(xhr.method).toBe('POST');
    expect(xhr.url.endsWith('/imports/roster/upload')).toBe(true);
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers['X-Requested-With']).toBe('XMLHttpRequest');
    expect(xhr.body).toBeInstanceOf(FormData);
    expect((xhr.body as FormData).get('term')).toBe('FA26');
  });

  it('file nhỏ không bắn onprogress → vẫn báo 1 khi upload.onload', async () => {
    useFakeXhr([{ status: 200, body: { success: true, data: 1, error: null }, progress: 'none' }]);
    const ratios: Array<number | null> = [];
    await apiUploadWithProgress('/x', file, undefined, (ratio) => ratios.push(ratio));
    expect(ratios).toEqual([1]);
  });

  it('không đo được kích thước → báo null', async () => {
    useFakeXhr([{ status: 200, body: { success: true, data: 1, error: null }, progress: 'unknown' }]);
    const ratios: Array<number | null> = [];
    await apiUploadWithProgress('/x', file, undefined, (ratio) => ratios.push(ratio));
    expect(ratios).toEqual([null, 1]);
  });

  it('401 → làm mới phiên rồi gửi lại đúng MỘT lần', async () => {
    useFakeXhr([
      { status: 401, body: { success: false, data: null, error: 'Hết hạn' } },
      { status: 200, body: { success: true, data: 'ok', error: null } },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: null, error: null }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiUploadWithProgress('/x', file, undefined, () => {})).resolves.toBe('ok');
    expect(FakeXhr.sent).toHaveLength(2);
    expect(String(fetchMock.mock.calls[0][0]).endsWith('/auth/refresh')).toBe(true);
  });

  it('401 và làm mới bị từ chối → về /login, lỗi hết phiên', async () => {
    useFakeXhr([{ status: 401, body: { success: false, data: null, error: 'Hết hạn' } }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { success: false })));
    const location = { href: '' };
    vi.stubGlobal('window', { location });
    const error = await caught(apiUploadWithProgress('/x', file, undefined, () => {}));
    expect(error.status).toBe(401);
    expect(location.href).toBe('/login');
    expect(FakeXhr.sent).toHaveLength(1);
  });

  it('lỗi nghiệp vụ giữ câu tiếng Việt + code', async () => {
    useFakeXhr([
      { status: 400, body: { success: false, data: null, error: 'File sai mẫu.', code: 'BAD_TEMPLATE' } },
    ]);
    const error = await caught(apiUploadWithProgress('/x', file, undefined, () => {}));
    expect(error).toMatchObject({ message: 'File sai mẫu.', status: 400, code: 'BAD_TEMPLATE' });
  });

  it('cần ký cam kết → chuyển /consent', async () => {
    useFakeXhr([
      { status: 403, body: { success: false, data: null, error: 'Cần ký', code: 'CONSENT_REQUIRED' } },
    ]);
    const location = { href: '' };
    vi.stubGlobal('window', { location });
    await caught(apiUploadWithProgress('/x', file, undefined, () => {}));
    expect(location.href).toBe('/consent');
  });

  it('máy chủ trả HTML (502) → câu "Máy chủ đang bận"', async () => {
    useFakeXhr([{ status: 502, body: '<html>Bad Gateway</html>' }]);
    const error = await caught(apiUploadWithProgress('/x', file, undefined, () => {}));
    expect(error.message).toBe('Máy chủ đang bận hoặc gặp sự cố (mã 502). Vui lòng thử lại.');
  });

  it('mất mạng → lỗi mạng tiếng Việt, status 0', async () => {
    useFakeXhr(['network-error']);
    const error = await caught(apiUploadWithProgress('/x', file, undefined, () => {}));
    expect(error.status).toBe(0);
    expect(error.message).toBe('Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.');
  });
});
