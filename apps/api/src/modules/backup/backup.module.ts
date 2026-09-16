import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { BackupController } from './backup.controller';
import { BackupProcessor } from './backup.processor';
import { BACKUP_QUEUE } from './backup.queue';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupService } from './backup.service';
import { PgRunnerService } from './pg-runner.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    BullModule.registerQueue({ name: BACKUP_QUEUE }),
  ],
  controllers: [BackupController],
  providers: [
    BackupService,
    PgRunnerService,
    BackupProcessor,
    BackupSchedulerService,
  ],
  exports: [BackupService],
})
export class BackupModule {}
