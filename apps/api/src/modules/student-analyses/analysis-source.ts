import { createHash } from 'node:crypto';
import { z } from 'zod';

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_PATTERN = /(?<!\d)(?:\+?84|0)(?:[ .-]?\d){9,10}(?!\d)/g;
const GOVERNMENT_ID_PATTERN = /(?<!\d)\d{9}(?:\d{3})?(?!\d)/g;
const ADDRESS_PATTERN = /(?:địa chỉ|dia chi|address)\s*[:：-]\s*[^\n,;]+/gi;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

const analysisSourceEnrollmentSchema = z.object({
  term: z.string(),
  subjectCode: z.string(),
  subjectName: z.string(),
  attendanceRate: z.number().nullable(),
  midtermScore: z.number().nullable(),
  finalScore: z.number().nullable(),
  totalScore: z.number().nullable(),
  isExamBanned: z.boolean(),
  result: z.string(),
  updatedAt: z.string().datetime(),
});

const analysisSourceEvaluationSchema = z.object({
  term: z.string(),
  academicScore: z.number(),
  attitudeScore: z.number(),
  issueGroup: z.number().nullable(),
  note: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export const analysisSourceSnapshotSchema = z.object({
  focusTerm: z.string(),
  enrollments: z.array(analysisSourceEnrollmentSchema),
  evaluations: z.array(analysisSourceEvaluationSchema),
  limitations: z.array(z.string()),
});

export type AnalysisSourceEnrollment = z.infer<
  typeof analysisSourceEnrollmentSchema
>;
export type AnalysisSourceEvaluation = z.infer<
  typeof analysisSourceEvaluationSchema
>;
export type AnalysisSourceSnapshot = z.infer<
  typeof analysisSourceSnapshotSchema
>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactAnalysisText(
  text: string,
  identifiers: readonly string[],
): string {
  let redacted = text;
  for (const identifier of identifiers) {
    const normalized = identifier.trim();
    if (normalized.length < 2) {
      continue;
    }
    redacted = redacted.replace(
      new RegExp(escapeRegExp(normalized), 'gi'),
      '[ĐÃ ẨN]',
    );
  }
  return redacted
    .replace(EMAIL_PATTERN, '[EMAIL ĐÃ ẨN]')
    .replace(PHONE_PATTERN, '[SĐT ĐÃ ẨN]')
    .replace(GOVERNMENT_ID_PATTERN, '[ĐỊNH DANH ĐÃ ẨN]')
    .replace(ADDRESS_PATTERN, '[ĐỊA CHỈ ĐÃ ẨN]')
    .replace(UUID_PATTERN, '[UUID ĐÃ ẨN]');
}

export function containsForbiddenAnalysisPii(text: string): boolean {
  EMAIL_PATTERN.lastIndex = 0;
  PHONE_PATTERN.lastIndex = 0;
  GOVERNMENT_ID_PATTERN.lastIndex = 0;
  ADDRESS_PATTERN.lastIndex = 0;
  UUID_PATTERN.lastIndex = 0;
  return (
    EMAIL_PATTERN.test(text) ||
    PHONE_PATTERN.test(text) ||
    GOVERNMENT_ID_PATTERN.test(text) ||
    ADDRESS_PATTERN.test(text) ||
    UUID_PATTERN.test(text)
  );
}

export function hashAnalysisSource(snapshot: AnalysisSourceSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
