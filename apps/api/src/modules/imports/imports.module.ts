import { Module, type OnModuleInit } from '@nestjs/common';
import { ImportKind } from '@prisma/client';
import { CatalogCommitter } from './committers/catalog.committer';
import { GradeAttendanceCommitter } from './committers/grade-attendance.committer';
import { GradebookCommitter } from './committers/gradebook.committer';
import { LecturerCommitter } from './committers/lecturer.committer';
import { RosterCommitter } from './committers/roster.committer';
import { ScheduleCommitter } from './committers/schedule.committer';
import { SectionListCommitter } from './committers/section-list.committer';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { CatalogParser } from './parsers/catalog.parser';
import { GradeAttendanceParser } from './parsers/grade-attendance.parser';
import { GradebookParser } from './parsers/gradebook.parser';
import { LecturerParser } from './parsers/lecturer.parser';
import { RosterParser } from './parsers/roster.parser';
import { ScheduleParser } from './parsers/schedule.parser';
import { SectionListParser } from './parsers/section-list.parser';

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

    // Bộ file nhà trường gửi đầu kỳ (docs/tailieu/). Phụ thuộc theo đúng thứ
    // tự này: ROSTER cần lớp học phần của SECTION_LIST, GRADE_ATTENDANCE cần
    // ghi danh của ROSTER.
    this.importsService.register(
      ImportKind.SECTION_LIST,
      new SectionListParser(),
      new SectionListCommitter(),
    );
    this.importsService.register(
      ImportKind.ROSTER,
      new RosterParser(),
      new RosterCommitter(),
    );
    this.importsService.register(
      ImportKind.GRADE_ATTENDANCE,
      new GradeAttendanceParser(),
      new GradeAttendanceCommitter(),
    );
  }
}
