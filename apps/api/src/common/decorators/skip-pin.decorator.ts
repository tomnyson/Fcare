import { SetMetadata } from '@nestjs/common';

export const SKIP_PIN_KEY = 'skipPin';

/**
 * Cho phép gọi route khi phiên đang khoá hoặc chưa tạo PIN.
 * Chỉ dùng cho chính luồng PIN (tạo / mở khoá / khoá) và luồng SSE giữ kết nối.
 */
export const SkipPin = () => SetMetadata(SKIP_PIN_KEY, true);
