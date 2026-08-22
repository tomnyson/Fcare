import { SetMetadata } from '@nestjs/common';

export const SKIP_CONSENT_KEY = 'skipConsent';

/**
 * Cho phép truy cập route trước khi hoàn tất cam kết bảo mật / đổi mật khẩu tạm.
 * Chỉ dùng cho các route thuộc luồng đăng nhập (consent, change-password, me, logout).
 */
export const SkipConsent = () => SetMetadata(SKIP_CONSENT_KEY, true);
