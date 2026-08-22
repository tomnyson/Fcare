import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type {
  AccessTokenPayload,
  AuthUser,
} from '../../common/types/auth-user';

interface RequestWithCookies {
  cookies?: Record<string, string | undefined>;
}

export const ACCESS_TOKEN_COOKIE = 'fcare_access';
export const REFRESH_TOKEN_COOKIE = 'fcare_refresh';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: RequestWithCookies) =>
          request.cookies?.[ACCESS_TOKEN_COOKIE] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'JWT_ACCESS_SECRET',
        'dev-access-secret-change-me',
      ),
    });
  }

  validate(payload: AccessTokenPayload): AuthUser {
    return {
      id: payload.sub,
      staffCode: payload.staffCode,
      fullName: payload.fullName,
      roles: payload.roles,
      departmentId: payload.departmentId,
      consented: payload.consented,
      mustChangePassword: payload.mustChangePassword,
    };
  }
}
