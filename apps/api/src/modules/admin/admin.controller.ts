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
import { Throttle } from '@nestjs/throttler';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { AdminService } from './admin.service';
import {
  BulkAssignDepartmentDto,
  CreateStaffDto,
  ListStaffQuery,
  UpdateStaffDto,
} from './dto/staff.dto';

@ApiTags('admin')
@Controller('admin/staff')
@CheckPolicies((ability: AppAbility) => ability.can('update', 'Staff'))
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  list(@Query() query: ListStaffQuery) {
    return this.adminService.list(query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.adminService.create(user.id, dto);
  }

  @Patch('bulk-department')
  bulkAssignDepartment(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkAssignDepartmentDto,
  ) {
    return this.adminService.bulkAssignDepartment(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.adminService.update(user.id, id, dto);
  }

  @Post(':id/reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.resetPassword(user.id, id);
  }
}
