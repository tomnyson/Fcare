import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UpdateSecuritySettingsDto } from './dto/security-settings.dto';
import { SecuritySettingsService } from './security-settings.service';

/**
 * Chỉ ADMIN. Người dùng thường nhận `idleLockMinutes` qua `GET /auth/me`,
 * không cần quyền đọc bảng cấu hình.
 */
@ApiTags('admin')
@Controller('admin/security-settings')
@CheckPolicies((ability: AppAbility) =>
  ability.can('manage', 'SecuritySettings'),
)
export class SecuritySettingsController {
  constructor(private readonly settings: SecuritySettingsService) {}

  @Get()
  get() {
    return this.settings.getView();
  }

  @Put()
  update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateSecuritySettingsDto,
  ) {
    return this.settings.update(user.id, dto);
  }
}
