import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AppAbility } from '../../casl/ability.factory';
import type { AuthUser } from '../../common/types/auth-user';
import { ClassSectionsService } from './class-sections.service';
import { DepartmentsService } from './departments.service';
import {
  CreateClassSectionDto,
  ListClassSectionsQuery,
  UpdateClassSectionDto,
} from './dto/class-section.dto';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';
import {
  CreateClassMajorRuleDto,
  CreateDepartmentAliasDto,
  UpdateClassMajorRuleDto,
  UpdateDepartmentAliasDto,
} from './dto/mapping.dto';
import { CreateMajorDto, UpdateMajorDto } from './dto/major.dto';
import { UpdateSectionGradesDto } from './dto/section-grades.dto';
import { CreateSubjectDto, UpdateSubjectDto } from './dto/subject.dto';
import { MajorsService } from './majors.service';
import {
  ClassMajorRulesService,
  DepartmentAliasesService,
} from './mappings.service';
import { SubjectsService } from './subjects.service';

const canRead = (ability: AppAbility) => ability.can('read', 'MasterData');
const canManage = (ability: AppAbility) => ability.can('update', 'MasterData');

@ApiTags('master-data')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  @CheckPolicies(canRead)
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @CheckPolicies(canManage)
  create(@Body() dto: CreateDepartmentDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies(canManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies(canManage)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}

@ApiTags('master-data')
@Controller('majors')
export class MajorsController {
  constructor(private readonly service: MajorsService) {}

  @Get()
  @CheckPolicies(canRead)
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @CheckPolicies(canManage)
  create(@Body() dto: CreateMajorDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies(canManage)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMajorDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies(canManage)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}

@ApiTags('master-data')
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly service: SubjectsService) {}

  @Get()
  @CheckPolicies(canRead)
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @CheckPolicies(canManage)
  create(@Body() dto: CreateSubjectDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies(canManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies(canManage)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}

@ApiTags('master-data')
@Controller('class-sections')
export class ClassSectionsController {
  constructor(private readonly service: ClassSectionsService) {}

  @Get()
  @CheckPolicies(canRead)
  findAll(@Query() query: ListClassSectionsQuery) {
    return this.service.findAll(query);
  }

  @Post()
  @CheckPolicies(canManage)
  create(@Body() dto: CreateClassSectionDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies(canManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassSectionDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies(canManage)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Get(':id/grades')
  @CheckPolicies(canRead)
  findGrades(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findGrades(user, id);
  }

  @Patch(':id/grades')
  @CheckPolicies(canManage)
  updateGrades(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSectionGradesDto,
  ) {
    return this.service.updateGrades(user, id, dto);
  }
}

@ApiTags('master-data')
@Controller('department-aliases')
export class DepartmentAliasesController {
  constructor(private readonly service: DepartmentAliasesService) {}

  @Get()
  @CheckPolicies(canRead)
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @CheckPolicies(canManage)
  create(@Body() dto: CreateDepartmentAliasDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies(canManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentAliasDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies(canManage)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}

@ApiTags('master-data')
@Controller('class-major-rules')
export class ClassMajorRulesController {
  constructor(private readonly service: ClassMajorRulesService) {}

  @Get()
  @CheckPolicies(canRead)
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @CheckPolicies(canManage)
  create(@Body() dto: CreateClassMajorRuleDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies(canManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassMajorRuleDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies(canManage)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
