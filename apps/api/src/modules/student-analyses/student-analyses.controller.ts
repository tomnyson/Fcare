import {
  Body,
  Controller,
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
  CreateStudentTermAnalysisDto,
  ListStudentTermAnalysesQuery,
  SendAnalysisDto,
  UpdateStudentAnalysisDraftDto,
} from './dto/student-analysis.dto';
import { StudentAnalysesService } from './student-analyses.service';

@ApiTags('student-term-analyses')
@Controller()
export class StudentAnalysesController {
  constructor(private readonly analyses: StudentAnalysesService) {}

  @Post('students/:studentId/term-analyses')
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Evaluation'))
  create(
    @CurrentUser() user: AuthUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: CreateStudentTermAnalysisDto,
  ) {
    return this.analyses.createVersion(user, studentId, dto);
  }

  @Get('students/:studentId/term-analyses')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Evaluation'))
  list(
    @CurrentUser() user: AuthUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: ListStudentTermAnalysesQuery,
  ) {
    return this.analyses.listForStudent(user, studentId, query.term);
  }

  @Get('term-analysis-versions/:id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Evaluation'))
  getVersion(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.analyses.getVersion(user, id);
  }

  @Patch('term-analysis-versions/:id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Evaluation'))
  updateDraft(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentAnalysisDraftDto,
  ) {
    return this.analyses.updateDraft(user, id, dto);
  }

  @Get('term-analysis-versions/:id/recipients')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Evaluation'))
  recipients(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('level') level?: string,
  ) {
    const parsed = Number(level);
    return this.analyses.previewRecipients(
      user,
      id,
      Number.isInteger(parsed) && parsed >= 1 && parsed <= 4
        ? parsed
        : undefined,
    );
  }

  @Post('term-analysis-versions/:id/dismiss')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Evaluation'))
  dismiss(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.analyses.dismissVersion(user, id);
  }

  @Post('term-analysis-versions/:id/send')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Evaluation'))
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendAnalysisDto,
  ) {
    return this.analyses.sendVersion(user, id, dto);
  }
}
