import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { StatisticsService } from './statistics.service';

@ApiTags('statistics')
@Controller('statistics')
@CheckPolicies((ability: AppAbility) => ability.can('read', 'Statistics'))
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.statisticsService.overview(user);
  }

  @Get('classes')
  classes(@CurrentUser() user: AuthUser, @Query('term') term?: string) {
    return this.statisticsService.classes(user, term || undefined);
  }

  @Get('departments')
  departments(@CurrentUser() user: AuthUser) {
    return this.statisticsService.departments(user);
  }
}
