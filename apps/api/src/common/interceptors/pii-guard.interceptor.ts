import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Các trường bị CẤM theo tài liệu nghiệp vụ: CCCD/CMND, số điện thoại, email, địa chỉ.
 * Interceptor này là lớp phòng thủ cuối — loại bỏ mọi key khớp mẫu khỏi response,
 * kể cả khi dữ liệu lọt qua từ import hoặc code mới.
 */
const BANNED_KEY_PATTERN =
  /(cccd|cmnd|citizen|national[_-]?id|phone|mobile|email|address)/i;

export function stripPii<T>(value: T): T {
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => stripPii(item)) as unknown as T;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    value.constructor === Object
  ) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (BANNED_KEY_PATTERN.test(key)) {
        continue;
      }
      result[key] = stripPii(nested);
    }
    return result as T;
  }
  return value;
}

@Injectable()
export class PiiGuardInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => stripPii(data)));
  }
}
