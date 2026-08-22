import { z } from 'zod';

/** Độ khẩn 1–4 theo tài liệu II.1. */
export const ALERT_LEVELS = ['L1', 'L2', 'L3', 'L4'] as const;

export const alertLevelSchema = z.enum(ALERT_LEVELS);
export type AlertLevel = z.infer<typeof alertLevelSchema>;

export const ALERT_LEVEL_LABELS: Record<AlertLevel, string> = {
  L1: 'Thấp',
  L2: 'Trung bình',
  L3: 'Cao',
  L4: 'Khẩn cấp',
};

/** L4 yêu cầu lý do đủ chi tiết trước khi phát cảnh báo diện rộng. */
export const MIN_CRITICAL_REASON_LENGTH = 40;

export const raiseAlertSchema = z
  .object({
    studentCode: z.string().min(1),
    level: alertLevelSchema,
    reason: z.string().min(1),
  })
  .refine(
    (alert) => alert.level !== 'L4' || alert.reason.trim().length >= MIN_CRITICAL_REASON_LENGTH,
    {
      message: `Cảnh báo mức Khẩn cấp cần lý do tối thiểu ${MIN_CRITICAL_REASON_LENGTH} ký tự`,
      path: ['reason'],
    },
  );

export type RaiseAlertInput = z.infer<typeof raiseAlertSchema>;
