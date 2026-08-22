import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_CONSENT_KEY } from '../decorators/skip-consent.decorator';
import type { AuthUser } from '../types/auth-user';

/**
 * Chặn mọi truy cập khi người dùng chưa xác nhận cam kết bảo mật dữ liệu
 * (bắt buộc mỗi lần đăng nhập) hoặc chưa đổi mật khẩu tạm.
 */
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CONSENT_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      return true; // JwtAuthGuard đã xử lý trường hợp chưa đăng nhập
    }

    if (user.mustChangePassword) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message:
          'Bạn phải đổi mật khẩu tạm trước khi tiếp tục sử dụng hệ thống.',
      });
    }

    if (!user.consented) {
      throw new ForbiddenException({
        code: 'CONSENT_REQUIRED',
        message:
          'Bạn cần xác nhận cam kết không chia sẻ dữ liệu trước khi sử dụng hệ thống.',
      });
    }

    return true;
  }
}
