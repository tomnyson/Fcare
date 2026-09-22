import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipConsent } from '../../common/decorators/skip-consent.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { ACCESS_TOKEN_TTL_MS, AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLinkDto, GoogleTokenDto } from './dto/google-link.dto';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './jwt.strategy';
import { RecaptchaService } from './recaptcha.service';

const REFRESH_COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface RequestWithCookies {
  cookies?: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly recaptcha: RecaptchaService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Đăng nhập bằng mã nhân viên + mật khẩu' })
  async login(
    @Req() req: RequestWithCookies,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const origin =
      (req.headers?.['origin'] as string | undefined) ||
      (req.headers?.['referer'] as string | undefined) ||
      (req.headers?.['host'] as string | undefined);
    // Chặn bot TRƯỚC khi đụng tới mật khẩu — không để lộ tín hiệu đúng/sai (bỏ qua trên localhost).
    await this.recaptcha.verifyLogin(dto.recaptchaToken, origin);
    const session = await this.authService.login(dto.staffCode, dto.password);
    this.setAuthCookies(response, session.accessToken, session.refreshToken);
    return {
      user: session.user,
      requiresConsent: true,
      mustChangePassword: session.user.mustChangePassword,
    };
  }

  @Public()
  @Post('google/verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Xác thực Google ID token và đăng nhập hoặc tạo yêu cầu liên kết',
  })
  async googleVerify(
    @Body() dto: GoogleTokenDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.googleCallback(dto.idToken);
    if (result.session) {
      this.setAuthCookies(
        response,
        result.session.accessToken,
        result.session.refreshToken,
      );
      return {
        user: result.session.user,
        requiresConsent: true,
        mustChangePassword: result.session.user.mustChangePassword,
      };
    }
    return { requiresLinking: true, challenge: result.challenge };
  }

  @Public()
  @Post('google/link')
  @HttpCode(200)
  @ApiOperation({ summary: 'Liên kết Google với tài khoản nhân viên hiện có' })
  async googleLink(
    @Body() dto: GoogleLinkDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.linkGoogle(
      dto.challenge,
      dto.staffCode,
      dto.password,
    );
    this.setAuthCookies(response, session.accessToken, session.refreshToken);
    return {
      user: session.user,
      requiresConsent: true,
      mustChangePassword: session.user.mustChangePassword,
    };
  }

  @SkipConsent()
  @Post('consent')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Xác nhận cam kết không chia sẻ dữ liệu (bắt buộc mỗi lần đăng nhập)',
  })
  async consent(
    @CurrentUser() user: AuthUser,
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];
    const userAgentHeader = request.headers['user-agent'];
    const userAgent = Array.isArray(userAgentHeader)
      ? userAgentHeader[0]
      : userAgentHeader;

    const result = await this.authService.recordConsent(
      user.id,
      refreshToken,
      userAgent,
    );
    response.cookie(
      ACCESS_TOKEN_COOKIE,
      result.accessToken,
      this.cookieOptions(ACCESS_TOKEN_TTL_MS),
    );
    return { user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Làm mới access token bằng refresh token (cookie)' })
  async refresh(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] ?? '';
    const session = await this.authService.refresh(refreshToken);
    this.setAuthCookies(response, session.accessToken, session.refreshToken);
    return { user: session.user };
  }

  @SkipConsent()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Đăng xuất và thu hồi refresh token' })
  async logout(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(request.cookies?.[REFRESH_TOKEN_COOKIE]);
    response.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    response.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
    return { loggedOut: true };
  }

  @SkipConsent()
  @Get('me')
  @ApiOperation({ summary: 'Thông tin người dùng hiện tại' })
  me(@CurrentUser() user: AuthUser) {
    return {
      user,
      requiresConsent: !user.consented,
      mustChangePassword: user.mustChangePassword,
    };
  }

  @SkipConsent()
  @Post('change-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Đổi mật khẩu (bắt buộc với mật khẩu tạm)' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
    response.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    response.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
    return {
      changed: true,
      message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.',
    };
  }

  private setAuthCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    response.cookie(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      this.cookieOptions(ACCESS_TOKEN_TTL_MS),
    );
    response.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      this.cookieOptions(REFRESH_COOKIE_TTL_MS),
    );
  }

  private cookieOptions(maxAge: number) {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    };
  }
}
