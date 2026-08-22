import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { CareLogsService } from './care-logs.service';
import { CreateCareLogDto, ListCareLogsQuery } from './dto/care-log.dto';

@ApiTags('care-logs')
@Controller('care-logs')
export class CareLogsController {
  constructor(private readonly careLogsService: CareLogsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'CareLog'))
  list(@CurrentUser() user: AuthUser, @Query() query: ListCareLogsQuery) {
    return this.careLogsService.list(user, query);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'CareLog'))
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCareLogDto) {
    return this.careLogsService.create(user, dto);
  }
}
