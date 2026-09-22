import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
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
  CreateMajorAliasDto,
  UpdateClassMajorRuleDto,
  UpdateDepartmentAliasDto,
  UpdateMajorAliasDto,
} from './dto/mapping.dto';
import { CreateMajorDto, UpdateMajorDto } from './dto/major.dto';
import { UpdateSectionGradesDto } from './dto/section-grades.dto';
import { CreateSubjectDto, UpdateSubjectDto } from './dto/subject.dto';
import { AddStudentsToSectionDto } from './dto/add-students-to-section.dto';
import { generateStudentsExcelTemplate } from './section-students-excel';
import { MajorsService } from './majors.service';
import {
  ClassMajorRulesService,
  DepartmentAliasesService,
  MajorAliasesService,
} from './mappings.service';
import { SubjectsService } from './subjects.service';
import {
  CreateTermDto,
  SetCurrentTermDto,
  UpdateTermDto,
} from './dto/term.dto';
import { TermsService } from './terms.service';

const canRead = (ability: AppAbility) => ability.can('read', 'MasterData');
const canManage = (ability: AppAbility) => ability.can('update', 'MasterData');

@ApiTags('master-data')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  @CheckPolicies(canRead)
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    return this.service.findAll(includeInactive ?? false);
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
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListClassSectionsQuery,
  ) {
    return this.service.findAll(user, query);
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

  @Get('template/students')
  @CheckPolicies(canManage)
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header(
    'Content-Disposition',
    'attachment; filename="mau-bo-sung-sinh-vien.xlsx"',
  )
  async downloadStudentSupplementTemplate(): Promise<StreamableFile> {
    const buffer = await generateStudentsExcelTemplate();
    return new StreamableFile(buffer);
  }

  @Post(':id/students')
  @CheckPolicies(canManage)
  addStudents(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddStudentsToSectionDto,
  ) {
    return this.service.addStudentsToSection(user, id, dto.students);
  }

  @Post(':id/students/upload')
  @CheckPolicies(canManage)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadStudentsExcel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Thiếu file Excel (field "file").');
    }
    return this.service.addStudentsFromExcel(user, id, file.buffer);
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

@ApiTags('master-data')
@Controller('major-aliases')
export class MajorAliasesController {
  constructor(private readonly service: MajorAliasesService) {}

  @Get()
  @CheckPolicies(canRead)
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @CheckPolicies(canManage)
  create(@Body() dto: CreateMajorAliasDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies(canManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMajorAliasDto,
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
@Controller('terms')
export class TermsController {
  constructor(private readonly service: TermsService) {}

  @Get()
  @CheckPolicies(canRead)
  findAll() {
    return this.service.findAll();
  }

  @Get('current')
  @CheckPolicies(canRead)
  getCurrent() {
    return this.service.getCurrentTerm();
  }

  @Get(':id')
  @CheckPolicies(canRead)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @CheckPolicies(canManage)
  create(@Body() dto: CreateTermDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies(canManage)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTermDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/set-current')
  @CheckPolicies(canManage)
  setCurrent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCurrentTermDto,
  ) {
    return this.service.setCurrent(id, dto.isCurrent);
  }

  @Delete(':id')
  @CheckPolicies(canManage)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(id);
  }
}
