import { z } from 'zod';
import {
  FORCED_ESCALATION_RULE_KEYS,
  FORCED_ESCALATION_RULES,
  FORCED_ESCALATION_INSTRUCTIONS,
} from '@fcare/shared-types';

// Giữ re-export để provider và service không phải biết bảng luật nằm ở package nào.
export {
  FORCED_ESCALATION_RULES,
  FORCED_ESCALATION_INSTRUCTIONS,
  FORCED_ESCALATION_RULE_KEYS,
};

/**
 * `notificationSummary` không chỉ để hiển thị: hệ thống lấy nguyên văn nó làm
 * LÝ DO cảnh báo gửi cho các bên liên quan sau khi giảng viên nhận xét xong.
 * Vì vậy prompt phải bắt AI tổng hợp cả nhận xét mới của giảng viên lẫn lịch
 * sử chăm sóc trước đó của sinh viên vào đúng trường này.
 */
export const NOTIFICATION_SUMMARY_INSTRUCTIONS = [
  'Trường notificationSummary sẽ được dùng làm lý do cảnh báo gửi cho giảng viên, cố vấn học tập và cán bộ liên quan.',
  'Viết notificationSummary thành 2-3 câu tiếng Việt tổng hợp nhận xét mới nhất của giảng viên, số liệu điểm/chuyên cần và các lượt chăm sóc đã thực hiện trước đó (nêu rõ nếu chưa từng chăm sóc).',
] as const;

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
  suggestedLevel: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  forcedEscalation: z
    .object({
      rule: z.enum(FORCED_ESCALATION_RULE_KEYS),
      // Trích NGUYÊN VĂN câu trong nhận xét của giảng viên làm bằng chứng.
      quote: z.string().min(1).max(500),
      level: z.union([z.literal(3), z.literal(4)]),
    })
    .nullable(),
});

export type AcademicAnalysisOutput = z.infer<
  typeof academicAnalysisOutputSchema
>;
export type ForcedEscalation = AcademicAnalysisOutput['forcedEscalation'];
