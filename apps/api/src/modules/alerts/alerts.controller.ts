import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { AlertsService } from './alerts.service';
import {
  BulkAlertIdsDto,
  ListAlertsQuery,
  RaiseAlertDto,
  ResolveAlertDto,
} from './dto/alert.dto';

@ApiTags('alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Alert'))
  list(@CurrentUser() user: AuthUser, @Query() query: ListAlertsQuery) {
    return this.alertsService.list(user, query);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Alert'))
  raise(@CurrentUser() user: AuthUser, @Body() dto: RaiseAlertDto) {
    return this.alertsService.raise(user, dto);
  }

  @Patch(':id/acknowledge')
  @CheckPolicies((ability: AppAbility) => ability.can('resolve', 'Alert'))
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alertsService.acknowledge(user, id);
  }

  @Patch(':id/resolve')
  @CheckPolicies((ability: AppAbility) => ability.can('resolve', 'Alert'))
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveAlertDto,
  ) {
    return this.alertsService.resolve(user, id, dto);
  }

  /**
   * Xem trước cho một lô cảnh báo — POST vì danh sách id không vừa query
   * string; không tạo gì nên trả 200 thay vì 201.
   */
  @Post('bulk-deletion-preview')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'Alert'))
  deletionPreviewMany(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkAlertIdsDto,
  ) {
    return this.alertsService.deletionPreviewMany(user, dto.ids);
  }

  /** Xoá nhiều cảnh báo một lượt — tất cả hoặc không gì, cùng một transaction. */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'Alert'))
  removeMany(@CurrentUser() user: AuthUser, @Body() dto: BulkAlertIdsDto) {
    return this.alertsService.removeMany(user, dto.ids);
  }

  /** Xem trước những gì sẽ mất khi xoá — chỉ ADMIN (`delete Alert`). */
  @Get(':id/deletion-preview')
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'Alert'))
  deletionPreview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alertsService.deletionPreview(user, id);
  }

  /**
   * Xoá cảnh báo kèm nhận xét + trao đổi của sinh viên — chỉ ADMIN.
   * Web chặn thêm bằng mã PIN hệ thống; API chỉ tin CASL.
   */
  @Delete(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'Alert'))
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alertsService.remove(user, id);
  }
}
