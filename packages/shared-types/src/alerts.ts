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

/** Nguồn phát cảnh báo — khớp enum `AlertSource` trong Prisma. */
export const ALERT_SOURCES = ['MANUAL', 'AUTO_ATTENDANCE'] as const;
export type AlertSource = (typeof ALERT_SOURCES)[number];

export const ALERT_SOURCE_LABELS: Record<AlertSource, string> = {
  MANUAL: 'Thủ công',
  AUTO_ATTENDANCE: 'Tự động (điểm danh)',
};

/**
 * FLOW 2 module chăm sóc: ngưỡng số buổi vắng luỹ kế trong MỘT lớp học phần
 * (cột "Số buổi nghỉ/TS" của file điểm danh hàng tuần) → cấp cảnh báo tự động.
 * Nhất quán với bảng R_C của `computeRiskScore` (2 buổi = 2 điểm, ≥3 = 3 điểm).
 * Không bao giờ tự lên cấp 4 — cấp Khẩn cấp luôn do người quyết định.
 */
export const ATTENDANCE_ALERT_THRESHOLDS = { MEDIUM: 2, HIGH: 3 } as const;

export type AttendanceAlertLevel = 2 | 3;

export function attendanceLevelFor(
  absentSessions: number | null | undefined,
): AttendanceAlertLevel | null {
  if (absentSessions === null || absentSessions === undefined) return null;
  if (!Number.isFinite(absentSessions)) return null;
  if (absentSessions >= ATTENDANCE_ALERT_THRESHOLDS.HIGH) return 3;
  if (absentSessions >= ATTENDANCE_ALERT_THRESHOLDS.MEDIUM) return 2;
  return null;
}

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
