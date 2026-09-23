import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const RECAPTCHA_VERIFY_URL =
  'https://www.google.com/recaptcha/api/siteverify';
const RECAPTCHA_TIMEOUT_MS = 5_000;

interface SiteVerifyResponse {
  success?: boolean;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * reCAPTCHA v2 (ô tick "Tôi không phải người máy") cho đăng nhập bằng mật khẩu.
 * Bỏ trống RECAPTCHA_SECRET_KEY thì tắt (dev, e2e). Đã bật thì fail-closed: không
 * hỏi được Google cũng KHÔNG cho qua. Token chỉ dùng được một lần.
 *
 * KHÔNG có ngoại lệ theo tên miền: Origin/Referer/Host là header do client tự
 * khai, từng bị lợi dụng để bỏ qua captcha bằng `Origin: http://localhost`.
 */
@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);
  private readonly secret: string | undefined;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('RECAPTCHA_SECRET_KEY') || undefined;
  }

  isEnabled(): boolean {
    return this.secret !== undefined;
  }

  async verifyLogin(token: string | undefined): Promise<void> {
    if (!this.secret) return;
    if (!token) {
      throw new ForbiddenException({
        code: 'RECAPTCHA_REQUIRED',
        message:
          'Vui lòng tick ô "Tôi không phải người máy" trước khi đăng nhập.',
      });
    }

    const result = await this.siteVerify(this.secret, token);
    if (result.success !== true) {
      // Chỉ ghi mã lỗi của Google — không ghi mã nhân viên hay IP.
      this.logger.warn(
        `reCAPTCHA chặn đăng nhập: errors=${(result['error-codes'] ?? []).join(',') || '-'}`,
      );
      throw new ForbiddenException({
        code: 'RECAPTCHA_FAILED',
        message:
          'Xác minh "Tôi không phải người máy" đã hết hạn hoặc không hợp lệ. Vui lòng tick lại.',
      });
    }
  }

  private async siteVerify(
    secret: string,
    token: string,
  ): Promise<SiteVerifyResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RECAPTCHA_TIMEOUT_MS);
    try {
      const response = await fetch(RECAPTCHA_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }).toString(),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as SiteVerifyResponse;
    } catch (error) {
      this.logger.error(
        `Không xác minh được reCAPTCHA: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
      throw new ServiceUnavailableException({
        code: 'RECAPTCHA_UNAVAILABLE',
        message:
          'Chưa xác minh được bảo mật đăng nhập. Vui lòng thử lại sau ít phút.',
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
