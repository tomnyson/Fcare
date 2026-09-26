import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RiskScoreService } from '../evaluations/risk-score.service';
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
  // RiskScoreService khai báo trực tiếp để tránh vòng phụ thuộc với EvaluationsModule.
  providers: [
    AlertsService,
    EscalationService,
    EscalationProcessor,
    RiskScoreService,
  ],
  exports: [EscalationService],
})
export class AlertsModule {}
