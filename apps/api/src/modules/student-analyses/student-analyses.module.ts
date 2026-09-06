import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';
import type { AcademicAnalysisProvider } from './analysis-provider';
import {
  ACADEMIC_ANALYSIS_PROVIDER,
  resolveAnalysisProviderKey,
} from './analysis-provider';
import { DeepSeekAnalysisProvider } from './deepseek-analysis.provider';
import { OpenAiAnalysisProvider } from './openai-analysis.provider';
import { StudentAnalysesController } from './student-analyses.controller';
import { StudentAnalysisProcessor } from './student-analysis.processor';
import { STUDENT_ANALYSIS_QUEUE } from './student-analysis.queue';
import { StudentAnalysisSourceService } from './student-analysis-source.service';
import { StudentAnalysesService } from './student-analyses.service';

@Module({
  imports: [
    ConfigModule,
    NotificationsModule,
    BullModule.registerQueue({ name: STUDENT_ANALYSIS_QUEUE }),
  ],
  controllers: [StudentAnalysesController],
  providers: [
    StudentAnalysesService,
    StudentAnalysisSourceService,
    StudentAnalysisProcessor,
    OpenAiAnalysisProvider,
    DeepSeekAnalysisProvider,
    {
      // AI_PROVIDER chon nha cung cap chay that; mac dinh giu nguyen OpenAI de
      // moi truong dang chay khong doi hanh vi khi chua cau hinh gi them.
      provide: ACADEMIC_ANALYSIS_PROVIDER,
      inject: [ConfigService, OpenAiAnalysisProvider, DeepSeekAnalysisProvider],
      useFactory: (
        config: ConfigService,
        openai: OpenAiAnalysisProvider,
        deepseek: DeepSeekAnalysisProvider,
      ): AcademicAnalysisProvider =>
        resolveAnalysisProviderKey(config.get<string>('AI_PROVIDER')) ===
        'deepseek'
          ? deepseek
          : openai,
    },
  ],
})
export class StudentAnalysesModule {}
