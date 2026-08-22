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
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import {
  CreateStudentDto,
  ListStudentsQuery,
  UpdateStudentDto,
} from './dto/student.dto';
import { StudentsService } from './students.service';

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Student'))
  list(@CurrentUser() user: AuthUser, @Query() query: ListStudentsQuery) {
    return this.studentsService.list(user, query);
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Student'))
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.findOne(user, id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Student'))
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentDto) {
    return this.studentsService.create(user, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Student'))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.studentsService.update(user, id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'Student'))
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.remove(user, id);
  }
}
