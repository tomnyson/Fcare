import { Module } from '@nestjs/common';
import { ClassSectionsService } from './class-sections.service';
import { DepartmentsService } from './departments.service';
import { MajorsService } from './majors.service';
import {
  ClassMajorRulesController,
  ClassSectionsController,
  DepartmentAliasesController,
  DepartmentsController,
  MajorsController,
  SubjectsController,
} from './master-data.controller';
import {
  ClassMajorRulesService,
  DepartmentAliasesService,
} from './mappings.service';
import { SubjectsService } from './subjects.service';

@Module({
  controllers: [
    DepartmentsController,
    MajorsController,
    SubjectsController,
    ClassSectionsController,
    DepartmentAliasesController,
    ClassMajorRulesController,
  ],
  providers: [
    DepartmentsService,
    MajorsService,
    SubjectsService,
    ClassSectionsService,
    DepartmentAliasesService,
    ClassMajorRulesService,
  ],
  exports: [
    DepartmentsService,
    MajorsService,
    SubjectsService,
    ClassSectionsService,
    DepartmentAliasesService,
    ClassMajorRulesService,
  ],
})
export class MasterDataModule {}
