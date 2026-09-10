import { Module } from '@nestjs/common';
import { StudentAnalysesModule } from '../student-analyses/student-analyses.module';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';
import { RiskScoreService } from './risk-score.service';

@Module({
  // Nhận xét lưu xong thì gọi thẳng sang phân tích AI để tự sinh và tự gửi cảnh báo.
  imports: [StudentAnalysesModule],
  controllers: [EvaluationsController],
  providers: [EvaluationsService, RiskScoreService],
  exports: [RiskScoreService],
})
export class EvaluationsModule {}
