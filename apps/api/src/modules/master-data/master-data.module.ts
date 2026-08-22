import { Module } from '@nestjs/common';
import { ClassSectionsService } from './class-sections.service';
import { DepartmentsService } from './departments.service';
import { MajorsService } from './majors.service';
import {
  ClassSectionsController,
  DepartmentsController,
  MajorsController,
  SubjectsController,
} from './master-data.controller';
import { SubjectsService } from './subjects.service';

@Module({
  controllers: [
    DepartmentsController,
    MajorsController,
    SubjectsController,
    ClassSectionsController,
  ],
  providers: [
    DepartmentsService,
    MajorsService,
    SubjectsService,
    ClassSectionsService,
  ],
  exports: [
    DepartmentsService,
    MajorsService,
    SubjectsService,
    ClassSectionsService,
  ],
})
export class MasterDataModule {}
