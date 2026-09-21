import { Module } from '@nestjs/common';
import { NotificationDispatchService } from '../alerts/notification-dispatch.service';
import { NotificationEventsService } from '../alerts/notification-events.service';
import { NotificationsController } from '../alerts/notifications.controller';
import { NotificationsService } from '../alerts/notifications.service';
import { EmailModule } from '../email/email.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [EmailModule, PushModule],
  controllers: [NotificationsController],
  providers: [
    NotificationDispatchService,
    NotificationEventsService,
    NotificationsService,
  ],
  exports: [
    NotificationDispatchService,
    NotificationEventsService,
    NotificationsService,
  ],
})
export class NotificationsModule {}
