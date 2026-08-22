import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface CsrfCheckedRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
}

/**
 * Chống CSRF cho các request dùng cookie-auth: mọi request thay đổi dữ liệu
 * phải kèm header tùy chỉnh `X-Requested-With: XMLHttpRequest` (buộc CORS preflight,
 * script cross-origin không thể giả mạo). Request dùng Bearer token hoặc không có
 * cookie phiên thì không có rủi ro CSRF nên được bỏ qua.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<CsrfCheckedRequest>();
    if (!MUTATING_METHODS.has(request.method)) {
      return true;
    }

    const hasBearerAuth = Boolean(request.headers.authorization);
    const cookies = request.cookies ?? {};
    const usesCookieAuth = Boolean(
      cookies['fcare_access'] ?? cookies['fcare_refresh'],
    );
    if (hasBearerAuth || !usesCookieAuth) {
      return true;
    }

    if (request.headers['x-requested-with'] === 'XMLHttpRequest') {
      return true;
    }

    throw new ForbiddenException({
      code: 'CSRF_REJECTED',
      message: 'Request bị từ chối vì thiếu header chống CSRF.',
    });
  }
}
