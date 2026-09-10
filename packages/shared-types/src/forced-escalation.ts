/**
 * Ba luật ép cấp độ mà chỉ AI mới đọc ra được từ chữ giảng viên gõ
 * (tài liệu II.2 mục 5). Luật "vắng đủ 3 buổi ở mọi giảng viên" là dữ liệu
 * thuần nên tính ở `computeRiskScore`, không nằm ở đây.
 *
 * Đặt trong shared-types vì cả API (dựng prompt, validate) lẫn web (hiện tên
 * luật kèm câu trích dẫn cho người duyệt) đều cần đúng một bảng này.
 */
export const FORCED_ESCALATION_RULE_KEYS = [
  'DROPOUT_INTENT',
  'NO_LONGER_WANTS_TO_STUDY',
  'NOT_ATTENDING_AND_NO_WORK',
] as const;

export type ForcedEscalationRule = (typeof FORCED_ESCALATION_RULE_KEYS)[number];

export const FORCED_ESCALATION_RULES: Record<
  ForcedEscalationRule,
  { level: 3 | 4; label: string }
> = {
  DROPOUT_INTENT: { level: 3, label: 'Có ý định nghỉ học' },
  NO_LONGER_WANTS_TO_STUDY: {
    level: 4,
    label: 'SV nói không còn mong muốn học',
  },
  NOT_ATTENDING_AND_NO_WORK: {
    level: 4,
    label: 'Không đi học / điểm danh đối phó và không làm bài',
  },
};

/**
 * Hướng dẫn dùng chung cho mọi nhà cung cấp AI: `suggestedLevel` chỉ là đề
 * xuất, cấp cuối luôn do server chốt lại từ DRS + luật ép.
 */
export const FORCED_ESCALATION_INSTRUCTIONS = [
  'Trường suggestedLevel là đề xuất độ khẩn 1-4 dựa trên riskScore trong dữ liệu nguồn; server sẽ tự chốt cấp cuối.',
  'Chỉ điền forcedEscalation khi nhận xét của giảng viên có câu thể hiện rõ một trong ba luật: DROPOUT_INTENT (sinh viên có ý định nghỉ học, cấp 3), NO_LONGER_WANTS_TO_STUDY (sinh viên nói không còn mong muốn học, cấp 4), NOT_ATTENDING_AND_NO_WORK (không đi học hoặc chỉ điểm danh đối phó và không làm bài, cấp 4).',
  'quote phải là đoạn TRÍCH NGUYÊN VĂN có thật trong trường note của nhận xét; không suy diễn, không diễn giải lại. Không chắc thì để forcedEscalation là null.',
];
