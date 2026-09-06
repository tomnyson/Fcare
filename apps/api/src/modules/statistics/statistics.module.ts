import { Module } from '@nestjs/common';
import { ClassStatsService } from './dimensions/class-stats.service';
import { DepartmentStatsService } from './dimensions/department-stats.service';
import { LecturerStatsService } from './dimensions/lecturer-stats.service';
import { SubjectStatsService } from './dimensions/subject-stats.service';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

@Module({
  controllers: [StatisticsController],
  providers: [
    StatisticsService,
    ClassStatsService,
    DepartmentStatsService,
    SubjectStatsService,
    LecturerStatsService,
  ],
})
export class StatisticsModule {}
