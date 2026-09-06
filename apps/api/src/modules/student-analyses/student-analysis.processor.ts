import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  STUDENT_ANALYSIS_QUEUE,
  type StudentAnalysisJobData,
} from './student-analysis.queue';
import { StudentAnalysesService } from './student-analyses.service';

@Processor(STUDENT_ANALYSIS_QUEUE)
export class StudentAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(StudentAnalysisProcessor.name);

  constructor(private readonly analyses: StudentAnalysesService) {
    super();
  }

  async process(job: Job<StudentAnalysisJobData>): Promise<void> {
    if (job.data.kind === 'generate') {
      await this.analyses.processGeneration(job.data.versionId);
      return;
    }
    await this.analyses.processDelivery(job.data.versionId);
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<StudentAnalysisJobData> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }
    this.logger.warn(`Job ${job.name} thất bại sau retry: ${error.message}`);
    if (job.data.kind === 'generate') {
      await this.analyses.markGenerationFailed(job.data.versionId, error);
    } else {
      await this.analyses.markDeliveryFailed(job.data.versionId, error);
    }
  }
}
