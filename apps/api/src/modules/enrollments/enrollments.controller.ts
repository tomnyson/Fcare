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
  CreateEnrollmentDto,
  ListEnrollmentsQuery,
  UpdateEnrollmentDto,
} from './dto/enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

@ApiTags('enrollments')
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Student'))
  list(@CurrentUser() user: AuthUser, @Query() query: ListEnrollmentsQuery) {
    return this.enrollmentsService.list(user, query);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Student'))
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEnrollmentDto) {
    return this.enrollmentsService.create(user, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Student'))
  updateGrades(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEnrollmentDto,
  ) {
    return this.enrollmentsService.updateGrades(user, id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Student'))
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.enrollmentsService.remove(user, id);
  }
}
