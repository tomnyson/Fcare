import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { EscalationService } from './escalation.service';
import { EscalationProcessor } from './escalation.processor';
import {
  ALERT_ESCALATION_QUEUE,
  NotificationDispatchService,
} from './notification-dispatch.service';
import { NotificationEventsService } from './notification-events.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [BullModule.registerQueue({ name: ALERT_ESCALATION_QUEUE })],
  controllers: [AlertsController, NotificationsController],
  providers: [
    AlertsService,
    EscalationService,
    EscalationProcessor,
    NotificationDispatchService,
    NotificationEventsService,
    NotificationsService,
  ],
})
export class AlertsModule {}
