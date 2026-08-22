import { Module, type OnModuleInit } from '@nestjs/common';
import { ImportKind } from '@prisma/client';
import { CatalogCommitter } from './committers/catalog.committer';
import { GradebookCommitter } from './committers/gradebook.committer';
import { LecturerCommitter } from './committers/lecturer.committer';
import { ScheduleCommitter } from './committers/schedule.committer';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { CatalogParser } from './parsers/catalog.parser';
import { GradebookParser } from './parsers/gradebook.parser';
import { LecturerParser } from './parsers/lecturer.parser';
import { ScheduleParser } from './parsers/schedule.parser';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule implements OnModuleInit {
  constructor(private readonly importsService: ImportsService) {}

  onModuleInit(): void {
    this.importsService.register(
      ImportKind.CATALOG,
      new CatalogParser(),
      new CatalogCommitter(),
    );
    this.importsService.register(
      ImportKind.LECTURER,
      new LecturerParser(),
      new LecturerCommitter(),
    );
    this.importsService.register(
      ImportKind.SCHEDULE,
      new ScheduleParser(),
      new ScheduleCommitter(),
    );
    this.importsService.register(
      ImportKind.GRADEBOOK,
      new GradebookParser(),
      new GradebookCommitter(),
    );
  }
}
