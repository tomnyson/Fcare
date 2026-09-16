import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import {
  SendTestMailDto,
  UpdateMailSettingsDto,
} from './dto/mail-settings.dto';
import { MailSettingsService } from './mail-settings.service';

/** Chỉ ADMIN (`manage all`) — CASL subject riêng để sau này tách quyền nếu cần. */
@ApiTags('admin')
@Controller('admin/mail-settings')
@CheckPolicies((ability: AppAbility) => ability.can('manage', 'MailSettings'))
export class MailSettingsController {
  constructor(private readonly mailSettings: MailSettingsService) {}

  @Get()
  get() {
    return this.mailSettings.getView();
  }

  @Put()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMailSettingsDto) {
    return this.mailSettings.update(user.id, dto);
  }

  @Post('test')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  sendTest(@CurrentUser() user: AuthUser, @Body() dto: SendTestMailDto) {
    return this.mailSettings.sendTest(user.id, dto);
  }
}
