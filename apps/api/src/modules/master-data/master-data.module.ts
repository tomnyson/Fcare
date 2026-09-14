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
  TermsController,
} from './master-data.controller';
import {
  ClassMajorRulesService,
  DepartmentAliasesService,
  MajorAliasesService,
} from './mappings.service';
import { SubjectsService } from './subjects.service';
import { TermsService } from './terms.service';

@Module({
  controllers: [
    DepartmentsController,
    MajorsController,
    SubjectsController,
    ClassSectionsController,
    DepartmentAliasesController,
    MajorAliasesController,
    ClassMajorRulesController,
    TermsController,
  ],
  providers: [
    DepartmentsService,
    MajorsService,
    SubjectsService,
    ClassSectionsService,
    DepartmentAliasesService,
    MajorAliasesService,
    ClassMajorRulesService,
    TermsService,
  ],
  exports: [
    DepartmentsService,
    MajorsService,
    SubjectsService,
    ClassSectionsService,
    DepartmentAliasesService,
    MajorAliasesService,
    ClassMajorRulesService,
    TermsService,
  ],
})
export class MasterDataModule {}
