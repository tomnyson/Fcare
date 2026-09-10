import { Module } from '@nestjs/common';
import { ClassSectionsService } from './class-sections.service';
import { DepartmentsService } from './departments.service';
import { MajorsService } from './majors.service';
import {
  ClassMajorRulesController,
  ClassSectionsController,
  DepartmentAliasesController,
  DepartmentsController,
  MajorAliasesController,
  MajorsController,
  SubjectsController,
} from './master-data.controller';
import {
  ClassMajorRulesService,
  DepartmentAliasesService,
  MajorAliasesService,
} from './mappings.service';
import { SubjectsService } from './subjects.service';

@Module({
  controllers: [
    DepartmentsController,
    MajorsController,
    SubjectsController,
    ClassSectionsController,
    DepartmentAliasesController,
    MajorAliasesController,
    ClassMajorRulesController,
  ],
  providers: [
    DepartmentsService,
    MajorsService,
    SubjectsService,
    ClassSectionsService,
    DepartmentAliasesService,
    MajorAliasesService,
    ClassMajorRulesService,
  ],
  exports: [
    DepartmentsService,
    MajorsService,
    SubjectsService,
    ClassSectionsService,
    DepartmentAliasesService,
    MajorAliasesService,
    ClassMajorRulesService,
  ],
})
export class MasterDataModule {}
