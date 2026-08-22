import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { AlertsService } from './alerts.service';
import {
  ListAlertsQuery,
  RaiseAlertDto,
  ResolveAlertDto,
} from './dto/alert.dto';

@ApiTags('alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Alert'))
  list(@CurrentUser() user: AuthUser, @Query() query: ListAlertsQuery) {
    return this.alertsService.list(user, query);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Alert'))
  raise(@CurrentUser() user: AuthUser, @Body() dto: RaiseAlertDto) {
    return this.alertsService.raise(user, dto);
  }

  @Patch(':id/acknowledge')
  @CheckPolicies((ability: AppAbility) => ability.can('resolve', 'Alert'))
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alertsService.acknowledge(user, id);
  }

  @Patch(':id/resolve')
  @CheckPolicies((ability: AppAbility) => ability.can('resolve', 'Alert'))
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveAlertDto,
  ) {
    return this.alertsService.resolve(user, id, dto);
  }
}
