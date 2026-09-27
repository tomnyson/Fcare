import {
  CRITERION_LABELS,
  type EvaluationCriterion,
} from '@fcare/shared-types';

/** Giãn cách tối thiểu giữa hai lần nhờ AI viết nhận xét của cùng một người. */
export const NOTE_DRAFT_COOLDOWN_MS = 30_000;

/** Khớp giới hạn `note` của CreateEvaluationDto. */
export const NOTE_DRAFT_MAX_LENGTH = 2000;

export interface NoteDraftInput {
  term: string;
  academicScore: number;
  attitudeScore: number;
  absentSessions?: number;
  criteria?: readonly EvaluationCriterion[];
}

export const NOTE_DRAFT_INSTRUCTIONS = [
  'Bạn giúp giảng viên viết nhận xét ngắn về tình hình học tập của một sinh viên.',
  'Chỉ dựa vào dữ liệu được cung cấp; không bịa sự việc, không chẩn đoán tâm lý, không kết luận học vụ.',
  'Viết tiếng Việt, giọng khách quan, 2-4 câu, tối đa 600 ký tự: nêu tình hình rồi một đề xuất hỗ trợ cụ thể.',
  'Không nêu tên, mã số, số điện thoại, email, địa chỉ hay giấy tờ tuỳ thân của bất kỳ ai.',
  'Chỉ trả về đoạn nhận xét, không tiêu đề, không gạch đầu dòng, không markdown.',
].join('\n');

/**
 * Prompt chỉ mang dữ liệu học vụ (RULE 1): kỳ, hai điểm, số buổi vắng và NHÃN
 * tiêu chí. Không có mã/tên sinh viên hay lớp — AI không cần biết đó là ai.
 */
export function buildNoteDraftPrompt(input: NoteDraftInput): string {
  const labels = (input.criteria ?? []).map((c) => CRITERION_LABELS[c]);
  return [
    `Học kỳ: ${input.term}`,
    `Khả năng học tập: ${input.academicScore}/10`,
    `Thái độ học tập: ${input.attitudeScore}/10`,
    input.absentSessions === undefined
      ? 'Chưa có số buổi vắng.'
      : `Số buổi vắng: ${input.absentSessions} buổi`,
    labels.length > 0
      ? `Tiêu chí giảng viên ghi nhận: ${labels.join('; ')}`
      : 'Không ghi nhận tiêu chí rủi ro nào.',
  ].join('\n');
}

/**
 * Bộ đếm giãn cách theo người dùng, giữ trong bộ nhớ tiến trình. Nhiều instance
 * API thì mỗi instance đếm riêng — chấp nhận được vì mục tiêu là chặn bấm dồn,
 * còn Throttler theo route vẫn đỡ phía sau.
 */
export class NoteDraftCooldown {
  private readonly lastRun = new Map<string, number>();

  /** Trả 0 và ghi mốc nếu được chạy; ngược lại trả số giây còn phải đợi. */
  take(userId: string, now: number = Date.now()): number {
    const last = this.lastRun.get(userId);
    if (last !== undefined && now - last < NOTE_DRAFT_COOLDOWN_MS) {
      return Math.ceil((NOTE_DRAFT_COOLDOWN_MS - (now - last)) / 1000);
    }
    this.lastRun.set(userId, now);
    return 0;
  }
}
