import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { CareStatisticsService } from './care-statistics.service';
import { CareStatisticsQuery } from './dto/care-statistics-query.dto';

@ApiTags('statistics')
@Controller('statistics/care')
@CheckPolicies((ability: AppAbility) => ability.can('read', 'Statistics'))
export class CareStatisticsController {
  constructor(private readonly care: CareStatisticsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: CareStatisticsQuery) {
    return this.care.list(user, query);
  }

  @Get('export.xlsx')
  async export(
    @CurrentUser() user: AuthUser,
    @Query() query: CareStatisticsQuery,
  ) {
    const buffer = await this.care.export(user, query);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="care-${query.term}.xlsx"`,
    });
  }
}
