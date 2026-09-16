import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { ALERT_ESCALATION_QUEUE } from '../alerts/notification-dispatch.service';
import { MasterDataModule } from '../master-data/master-data.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceAlertsController } from './attendance-alerts.controller';
import { AttendanceReviewService } from './attendance-review.service';
import { PendingAttendanceAlertsService } from './pending-attendance-alerts.service';

/**
 * FLOW 2 module chăm sóc: cảnh báo điểm danh tự động sau import
 * (rà soát → phát cảnh báo → hiện liên tục ở GV đứng lớp → thống kê).
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: ALERT_ESCALATION_QUEUE }),
    AlertsModule,
    NotificationsModule,
    MasterDataModule,
  ],
  controllers: [AttendanceAlertsController],
  providers: [AttendanceReviewService, PendingAttendanceAlertsService],
  exports: [AttendanceReviewService, PendingAttendanceAlertsService],
})
export class AttendanceAlertsModule {}
