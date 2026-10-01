import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PIN_PROOF_HEADER, type PinProofPurpose } from '@fcare/shared-types';
import { PinService } from '../../modules/auth/pin.service';
import { REFRESH_TOKEN_COOKIE } from '../../modules/auth/jwt.strategy';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PIN_PROOF_PURPOSE_KEY } from '../decorators/require-pin-proof.decorator';
import { SKIP_CONSENT_KEY } from '../decorators/skip-consent.decorator';
import { SKIP_PIN_KEY } from '../decorators/skip-pin.decorator';
import type { AuthUser } from '../types/auth-user';

interface PinRequest {
  user?: AuthUser;
  cookies?: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Chạy sau ConsentGuard: đã đăng nhập + ký cam kết thì còn phải có PIN
 * và phiên không bị khoá do không thao tác.
 */
@Injectable()
export class PinGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly pins: PinService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const skipped = [IS_PUBLIC_KEY, SKIP_CONSENT_KEY, SKIP_PIN_KEY].some(
      (key) => this.reflector.getAllAndOverride<boolean>(key, targets),
    );
    if (skipped) return true;

    const request = context.switchToHttp().getRequest<PinRequest>();
    if (!request.user) return true; // JwtAuthGuard đã xử lý

    const state = await this.pins.sessionState(
      request.user.id,
      request.cookies?.[REFRESH_TOKEN_COOKIE],
    );
    if (!state.hasPin) {
      throw new ForbiddenException({
        code: 'PIN_SETUP_REQUIRED',
        message: 'Bạn cần tạo mã PIN 6 số trước khi sử dụng hệ thống.',
      });
    }
    if (state.locked) {
      throw new ForbiddenException({
        code: 'APP_LOCKED',
        message: 'Ứng dụng đã khoá do không thao tác. Nhập mã PIN để tiếp tục.',
      });
    }
    return true;
  }
}

/** Dùng cục bộ qua `@UseGuards` trên route có `@RequirePinProof(...)`. */
@Injectable()
export class PinProofGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly pins: PinService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const purpose = this.reflector.getAllAndOverride<
      PinProofPurpose | undefined
    >(PIN_PROOF_PURPOSE_KEY, [context.getHandler(), context.getClass()]);
    if (!purpose) return true;

    const request = context.switchToHttp().getRequest<PinRequest>();
    const header = request.headers[PIN_PROOF_HEADER];
    const proof = Array.isArray(header) ? header[0] : header;
    if (
      !request.user ||
      !this.pins.checkProof(request.user.id, purpose, proof)
    ) {
      throw new ForbiddenException({
        code: 'PIN_PROOF_REQUIRED',
        message: 'Thao tác này cần nhập lại mã PIN của bạn.',
      });
    }
    return true;
  }
}
