import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { CareOverviewService } from './care-overview.service';
import { ClassStatsService } from './dimensions/class-stats.service';
import { DepartmentStatsService } from './dimensions/department-stats.service';
import { LecturerStatsService } from './dimensions/lecturer-stats.service';
import { SubjectStatsService } from './dimensions/subject-stats.service';
import { StatisticsQuery } from './dto/statistics-query.dto';
import { StatisticsService } from './statistics.service';

@ApiTags('statistics')
@Controller('statistics')
@CheckPolicies((ability: AppAbility) => ability.can('read', 'Statistics'))
export class StatisticsController {
  constructor(
    private readonly statisticsService: StatisticsService,
    private readonly careOverviewService: CareOverviewService,
    private readonly classStats: ClassStatsService,
    private readonly departmentStats: DepartmentStatsService,
    private readonly subjectStats: SubjectStatsService,
    private readonly lecturerStats: LecturerStatsService,
  ) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser, @Query() query: StatisticsQuery) {
    return this.statisticsService.overview(user, query.term || undefined);
  }

  /** Chăm sóc theo bộ môn / giảng viên / CTSV + SV cảnh báo theo mức của một kỳ. */
  @Get('care-overview')
  careOverview(@CurrentUser() user: AuthUser, @Query() query: StatisticsQuery) {
    return this.careOverviewService.overview(user, query.term || undefined);
  }

  @Get('classes')
  classes(@CurrentUser() user: AuthUser, @Query() query: StatisticsQuery) {
    return this.classStats.list(user, query.term || undefined, query.block);
  }

  @Get('departments')
  departments(@CurrentUser() user: AuthUser) {
    return this.departmentStats.list(user);
  }

  @Get('subjects')
  subjects(@CurrentUser() user: AuthUser, @Query() query: StatisticsQuery) {
    return this.subjectStats.list(user, query.term || undefined);
  }

  @Get('lecturers')
  lecturers(@CurrentUser() user: AuthUser, @Query() query: StatisticsQuery) {
    return this.lecturerStats.list(user, query.term || undefined);
  }
}
