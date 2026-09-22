import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ALERT_ESCALATION_QUEUE } from '../alerts/notification-dispatch.service';
import { BACKUP_QUEUE } from '../backup/backup.queue';
import { EMAIL_NOTIFICATION_QUEUE } from '../email/email.processor';
import { STUDENT_ANALYSIS_QUEUE } from '../student-analyses/student-analysis.queue';
import { DiscordWebhookClient } from './discord-webhook.client';
import { errorSink } from './error-capture';
import { ERROR_SINK, ErrorCollectorService } from './error-collector.service';
import { MonitoringController } from './monitoring.controller';
import { MonitoringProcessor } from './monitoring.processor';
import { MONITORING_QUEUE } from './monitoring.queue';
import { MonitoringReportService } from './monitoring-report.service';
import { MonitoringScheduler } from './monitoring.scheduler';
import { MonitoringSettingsService } from './monitoring-settings.service';
import {
  QUEUE_EVENTS_FACTORY,
  QueueFailureMonitor,
  WATCHED_QUEUES,
  type QueueEventsFactory,
} from './queue-failure.monitor';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    BullModule.registerQueue({ name: MONITORING_QUEUE }),
  ],
  controllers: [MonitoringController],
  providers: [
    // Hook pino chạy trước khi có DI → ghi vào singleton, collector đọc ra.
    { provide: ERROR_SINK, useValue: errorSink },
    {
      provide: DiscordWebhookClient,
      useFactory: () => new DiscordWebhookClient(),
    },
    ErrorCollectorService,
    MonitoringSettingsService,
    MonitoringReportService,
    MonitoringScheduler,
    MonitoringProcessor,
    {
      provide: WATCHED_QUEUES,
      useValue: [
        ALERT_ESCALATION_QUEUE,
        EMAIL_NOTIFICATION_QUEUE,
        STUDENT_ANALYSIS_QUEUE,
        BACKUP_QUEUE,
        MONITORING_QUEUE,
      ],
    },
    {
      provide: QUEUE_EVENTS_FACTORY,
      inject: [getQueueToken(MONITORING_QUEUE)],
      // Dùng lại cấu hình Redis của BullModule.forRoot thay vì đọc env lần nữa.
      useFactory:
        (queue: Queue): QueueEventsFactory =>
        (name) =>
          new QueueEvents(name, { connection: queue.opts.connection }),
    },
    QueueFailureMonitor,
  ],
})
export class MonitoringModule {}
