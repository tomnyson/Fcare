export const STUDENT_ANALYSIS_QUEUE = 'student-term-analysis';
export const GENERATE_ANALYSIS_JOB = 'generate-analysis';
export const DELIVER_ANALYSIS_JOB = 'deliver-analysis';

export type StudentAnalysisJobData =
  | { kind: 'generate'; versionId: string }
  | { kind: 'deliver'; versionId: string };
