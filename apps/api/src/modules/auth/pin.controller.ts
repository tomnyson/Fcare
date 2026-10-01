import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipPin } from '../../common/decorators/skip-pin.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { SetPinDto, VerifyPinDto } from './dto/pin.dto';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './jwt.strategy';
import { PinService } from './pin.service';

interface RequestWithCookies {
  cookies?: Record<string, string | undefined>;
}

function refreshCookieOf(request: RequestWithCookies): string | undefined {
  return request.cookies?.[REFRESH_TOKEN_COOKIE];
}

@ApiTags('auth')
@Controller('auth/pin')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class PinController {
  constructor(private readonly pins: PinService) {}

  @SkipPin()
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Tạo hoặc đổi mã PIN cá nhân' })
  setPin(
    @CurrentUser() user: AuthUser,
    @Req() request: RequestWithCookies,
    @Body() dto: SetPinDto,
  ) {
    return this.pins.setPin(user.id, refreshCookieOf(request), dto);
  }

  @SkipPin()
  @Post('verify')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Nhập PIN — mở khoá phiên, hoặc lấy bằng chứng cho thao tác phá huỷ',
  })
  verify(
    @CurrentUser() user: AuthUser,
    @Req() request: RequestWithCookies,
    @Body() dto: VerifyPinDto,
  ) {
    return this.pins.verify(user.id, refreshCookieOf(request), dto);
  }

  @SkipPin()
  @Post('lock')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Khoá phiên hiện tại (hết thời gian không thao tác)',
  })
  async lock(
    @CurrentUser() user: AuthUser,
    @Req() request: RequestWithCookies,
  ) {
    await this.pins.lock(user.id, refreshCookieOf(request));
    return { locked: true };
  }

  @SkipPin()
  @Post('forgot')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Quên PIN — xoá PIN, đăng xuất mọi phiên; đăng nhập lại rồi tạo PIN mới',
  })
  async forgot(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.pins.forgetPin(user.id);
    response.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    response.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
    return { loggedOut: true };
  }

  @Post('reset/:staffId')
  @HttpCode(200)
  @CheckPolicies((ability: AppAbility) => ability.can('manage', 'Staff'))
  @ApiOperation({
    summary: 'ADMIN xoá PIN của người dùng — lần đăng nhập sau phải tạo lại',
  })
  async reset(
    @CurrentUser() user: AuthUser,
    @Param('staffId', ParseUUIDPipe) staffId: string,
  ) {
    await this.pins.resetPin(user.id, staffId);
    return { reset: true };
  }
}
