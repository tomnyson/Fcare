import { z } from 'zod';

const evidenceItemSchema = z.object({
  finding: z.string().min(1).max(500),
  evidence: z.string().min(1).max(500),
});

export const academicAnalysisOutputSchema = z.object({
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  summary: z.string().min(1).max(2000),
  strengths: z.array(z.string().min(1).max(500)).max(5),
  trends: z.array(evidenceItemSchema).max(5),
  riskFactors: z.array(evidenceItemSchema).max(5),
  recommendations: z.array(z.string().min(1).max(500)).min(1).max(5),
  notificationSummary: z.string().min(1).max(500),
  dataLimitations: z.array(z.string().min(1).max(500)).max(5),
});

export type AcademicAnalysisOutput = z.infer<
  typeof academicAnalysisOutputSchema
>;
