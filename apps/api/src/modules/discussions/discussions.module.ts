import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DiscussionsController } from './discussions.controller';
import { DiscussionsService } from './discussions.service';

// `NotificationDispatchService` do `NotificationsModule` provide và export sẵn —
// import module đó thay vì khai báo lại provider (tránh hai thực thể khác nhau).
@Module({
  imports: [NotificationsModule],
  controllers: [DiscussionsController],
  providers: [DiscussionsService],
})
export class DiscussionsModule {}
