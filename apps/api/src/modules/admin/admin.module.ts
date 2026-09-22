import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AuditLogController } from './audit-log.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController, AuditLogController],
  providers: [AdminService],
})
export class AdminModule {}
