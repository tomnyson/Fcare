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
import { CareLogsService } from './care-logs.service';
import {
  CreateCareLogDto,
  ListCareLogsQuery,
  UpdateCareLogDto,
} from './dto/care-log.dto';

@ApiTags('care-logs')
@Controller('care-logs')
export class CareLogsController {
  constructor(private readonly careLogsService: CareLogsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'CareLog'))
  list(@CurrentUser() user: AuthUser, @Query() query: ListCareLogsQuery) {
    return this.careLogsService.list(user, query);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'CareLog'))
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCareLogDto) {
    return this.careLogsService.create(user, dto);
  }

  /** Tác giả (hoặc ADMIN) sửa nội dung lượt chăm sóc — service kiểm quyền từng bản ghi. */
  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'CareLog'))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCareLogDto,
  ) {
    return this.careLogsService.update(user, id, dto);
  }

  /** Chỉ ADMIN có `delete CareLog` (manage all) — GV/TBM/CTSV không xoá được. */
  @Delete(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'CareLog'))
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.careLogsService.remove(user, id);
  }
}
