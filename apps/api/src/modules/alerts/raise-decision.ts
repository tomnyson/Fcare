/**
 * Hàm thuần: quyết định phát cảnh báo mới hay cập nhật cảnh báo đang mở của
 * cùng (sinh viên, lớp học phần, học kỳ) — docs/plan-lert.md mục 1.
 * - Mức cuối không bao giờ thấp hơn mức hệ thống tính từ điểm rủi ro.
 * - Đang có cảnh báo mở: mức cao hơn thì nâng tại chỗ (và báo lại), bằng
 *   hoặc thấp hơn thì chỉ gộp lý do, không làm phiền ai.
 */

export interface OpenAlertForRaise {
  id: string;
  level: number;
}

export type RaiseDecision =
  | { type: 'create'; level: number; raisedBySystem: boolean }
  | {
      type: 'escalate';
      alertId: string;
      fromLevel: number;
      level: number;
      raisedBySystem: boolean;
    }
  | { type: 'merge'; alertId: string; level: number };

const clampLevel = (level: number) => Math.min(4, Math.max(1, level));

export function decideRaise(input: {
  requestedLevel: number;
  systemLevel: number;
  open: OpenAlertForRaise | null;
}): RaiseDecision {
  const requested = clampLevel(input.requestedLevel);
  const level = Math.max(requested, clampLevel(input.systemLevel));
  const raisedBySystem = level > requested;
  const { open } = input;

  if (!open) {
    return { type: 'create', level, raisedBySystem };
  }
  if (level > open.level) {
    return {
      type: 'escalate',
      alertId: open.id,
      fromLevel: open.level,
      level,
      raisedBySystem,
    };
  }
  return { type: 'merge', alertId: open.id, level: open.level };
}

export function systemRaiseNote(requested: number, level: number): string {
  return `Hệ thống tự nâng từ mức ${requested} lên mức ${level} theo điểm rủi ro của học kỳ.`;
}

const DATE_FORMAT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** Nối lý do mới vào cuối lý do cũ để người xử lý thấy đủ lịch sử. */
export function mergedReason(
  current: string,
  addition: string,
  at: Date,
): string {
  const next = addition.trim();
  if (next === '' || current.includes(next)) return current;
  return `${current}\n\n[Cập nhật ${DATE_FORMAT.format(at)}] ${next}`;
}
