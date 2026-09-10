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
  CreateEvaluationDto,
  ListEvaluationsQuery,
  RiskScoreQuery,
  UpdateEvaluationDto,
} from './dto/evaluation.dto';
import { EvaluationsService } from './evaluations.service';
import { RiskScoreService } from './risk-score.service';

@ApiTags('evaluations')
@Controller('evaluations')
export class EvaluationsController {
  constructor(
    private readonly evaluationsService: EvaluationsService,
    private readonly riskScoreService: RiskScoreService,
  ) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Evaluation'))
  list(@CurrentUser() user: AuthUser, @Query() query: ListEvaluationsQuery) {
    return this.evaluationsService.list(user, query);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Evaluation'))
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEvaluationDto) {
    return this.evaluationsService.create(user, dto);
  }

  // Đặt trước mọi route ':id' để Nest không bắt nhầm 'risk-score' thành tham số.
  @Get('risk-score')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Evaluation'))
  riskScore(@CurrentUser() user: AuthUser, @Query() query: RiskScoreQuery) {
    return this.riskScoreService.forStudentTerm(
      user,
      query.studentId,
      query.term,
    );
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Evaluation'))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEvaluationDto,
  ) {
    return this.evaluationsService.update(user, id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Evaluation'))
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.evaluationsService.remove(user, id);
  }
}
