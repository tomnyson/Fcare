import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RECAPTCHA_VERIFY_URL, RecaptchaService } from './recaptcha.service';

const fetchMock = jest.fn();

function makeService() {
  return new RecaptchaService(
    new ConfigService({ RECAPTCHA_SECRET_KEY: 'secret' }),
  );
}

function googleSays(body: Record<string, unknown>, ok = true) {
  fetchMock.mockResolvedValueOnce({ ok, json: () => Promise.resolve(body) });
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const response = (error as ForbiddenException).getResponse() as {
      code?: string;
    };
    return response.code;
  }
}

describe('RecaptchaService (v2 checkbox)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('chưa cấu hình secret → tắt, không gọi Google', async () => {
    const service = new RecaptchaService(new ConfigService({}));
    expect(service.isEnabled()).toBe(false);
    await expect(service.verifyLogin(undefined)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Google xác nhận đã tick → cho qua, gửi secret + token lên Google', async () => {
    googleSays({ success: true, hostname: 'fcare.local' });
    await expect(makeService().verifyLogin('tok')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RECAPTCHA_VERIFY_URL);
    const body = new URLSearchParams(init.body as string);
    expect(body.get('secret')).toBe('secret');
    expect(body.get('response')).toBe('tok');
  });

  it('chưa tick (thiếu token) khi đã bật → chặn, không gọi Google', async () => {
    await expect(codeOf(makeService().verifyLogin(''))).resolves.toBe(
      'RECAPTCHA_REQUIRED',
    );
    await expect(codeOf(makeService().verifyLogin(undefined))).resolves.toBe(
      'RECAPTCHA_REQUIRED',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('token sai / hết hạn / đã dùng → chặn', async () => {
    googleSays({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    await expect(codeOf(makeService().verifyLogin('tok'))).resolves.toBe(
      'RECAPTCHA_FAILED',
    );
  });

  it('không liên lạc được Google → 503, không cho qua', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(makeService().verifyLogin('tok')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(codeOf(makeService().verifyLogin('tok'))).resolves.toBe(
      'RECAPTCHA_UNAVAILABLE',
    );
  });

  it('Google trả HTTP lỗi → 503', async () => {
    googleSays({}, false);
    await expect(codeOf(makeService().verifyLogin('tok'))).resolves.toBe(
      'RECAPTCHA_UNAVAILABLE',
    );
  });

  it('KHÔNG có ngoại lệ theo tên miền: header Origin/Host do client tự khai, không được dùng để bỏ qua', async () => {
    // Trước đây verifyLogin nhận thêm clientHost và bỏ qua khi là localhost —
    // kẻ tấn công chỉ cần gửi `Origin: http://localhost:3000` là dò mật khẩu
    // không cần captcha. Chữ ký giờ chỉ còn token; bật/tắt chỉ theo secret.
    expect(makeService().verifyLogin.length).toBe(1);
    await expect(codeOf(makeService().verifyLogin(undefined))).resolves.toBe(
      'RECAPTCHA_REQUIRED',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
