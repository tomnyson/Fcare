import { Module } from '@nestjs/common';
import { MasterDataModule } from '../master-data/master-data.module';
import { CareStatisticsController } from './care-statistics.controller';
import { CareStatisticsService } from './care-statistics.service';
import { ClassStatsService } from './dimensions/class-stats.service';
import { DepartmentStatsService } from './dimensions/department-stats.service';
import { LecturerStatsService } from './dimensions/lecturer-stats.service';
import { SubjectStatsService } from './dimensions/subject-stats.service';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

@Module({
  imports: [MasterDataModule],
  controllers: [StatisticsController, CareStatisticsController],
  providers: [
    StatisticsService,
    CareStatisticsService,
    ClassStatsService,
    DepartmentStatsService,
    SubjectStatsService,
    LecturerStatsService,
  ],
})
export class StatisticsModule {}
