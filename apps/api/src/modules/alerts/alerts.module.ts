import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { EscalationService } from './escalation.service';
import { EscalationProcessor } from './escalation.processor';
import { ALERT_ESCALATION_QUEUE } from './notification-dispatch.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: ALERT_ESCALATION_QUEUE }),
    NotificationsModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService, EscalationService, EscalationProcessor],
  exports: [EscalationService],
})
export class AlertsModule {}
