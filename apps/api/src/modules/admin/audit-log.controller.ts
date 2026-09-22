import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { AdminService } from './admin.service';
import { ListAuditLogsQuery } from './dto/audit-log.dto';

@ApiTags('admin')
@Controller('admin/audit-logs')
@CheckPolicies((ability: AppAbility) => ability.can('update', 'Staff'))
export class AuditLogController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  list(@Query() query: ListAuditLogsQuery) {
    return this.adminService.listAuditLogs(query);
  }
}
