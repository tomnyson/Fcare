/**
 * Nội dung đánh giá sinh viên theo tài liệu nghiệp vụ
 * "PHẦN II — II.1 ĐÁNH GIÁ SINH VIÊN".
 *
 * Mô tả từng dải điểm và các "Giải pháp gợi ý (*)" ở đây là NỘI DUNG NGHIỆP VỤ
 * chép từ tài liệu — sửa chữ ở đây nghĩa là sửa quy định, đừng tự biên tập.
 *
 * RULE 1: không có bất kỳ trường PII nào của sinh viên trong file này.
 */

export const SCORE_BANDS = ['10-9', '8-7', '6-5', '4-3', '2-1'] as const;

export type ScoreBand = (typeof SCORE_BANDS)[number];

/** Điểm thấp nhất của từng dải, xếp giảm dần đúng thứ tự `SCORE_BANDS`. */
const BAND_FLOORS: readonly { band: ScoreBand; floor: number }[] = [
  { band: '10-9', floor: 9 },
  { band: '8-7', floor: 7 },
  { band: '6-5', floor: 5 },
  { band: '4-3', floor: 3 },
  { band: '2-1', floor: 1 },
];

/**
 * Gom điểm 1-10 về dải của tài liệu. Điểm ngoài biên bị kẹp về dải gần nhất
 * (đầu vào đã được DTO chặn 1..10, kẹp ở đây chỉ để hàm luôn tổng và không bao
 * giờ trả `undefined` cho UI).
 */
export function scoreBand(score: number): ScoreBand {
  const rounded = Math.round(score);
  const matched = BAND_FLOORS.find((entry) => rounded >= entry.floor);
  return matched?.band ?? '2-1';
}

/** Đánh giá về khả năng học tập — mô tả từng dải. */
export const ACADEMIC_BAND_DESCRIPTIONS: Record<ScoreBand, string> = {
  '10-9': 'SV có khả năng tiếp thu bài học, khả năng tự học, sáng tạo.',
  '8-7': 'SV có khả năng học tập tốt.',
  '6-5': 'SV học trung bình, trung bình khá.',
  '4-3': 'SV học yếu, học đối phó.',
  '2-1': 'Sinh viên học kém.',
};

/** Đánh giá về thái độ học tập — mô tả từng dải. */
export const ATTITUDE_BAND_DESCRIPTIONS: Record<ScoreBand, string> = {
  '10-9':
    'SV đi học đầy đủ; có thái độ học rất tốt, giúp đỡ các bạn khác cùng học; hoàn thành các LAB, ASM, Quiz trước deadline.',
  '8-7':
    'SV đi học tương đối đầy đủ; có thái độ học tập tốt; hoàn thành các LAB, ASM, Quiz đúng deadline.',
  '6-5':
    'SV đi học không đầy đủ; có thái độ học chưa tốt; hoàn thành các LAB, ASM, Quiz nhưng trễ deadline.',
  '4-3':
    'SV có đi học nhưng vắng rất nhiều; có thái độ học không tốt; không hoàn thành một số LAB, ASM, Quiz.',
  '2-1':
    'SV không đi học hoặc đi học chỉ lên điểm danh; không có mong muốn học; không làm LAB, ASM, Quiz.',
};

/** "Giải pháp gợi ý (*)" theo dải điểm — việc của giảng viên. */
export const ACADEMIC_BAND_SUGGESTIONS: Record<ScoreBand, string> = {
  '10-9': 'GV đưa ra kiến thức mới, định hướng mới hoặc thử thách khó hơn cho sinh viên.',
  '8-7': 'GV động viên hoặc ghép nhóm học tốt.',
  '6-5': 'GV cần kiểm tra, nhắc nhở thường xuyên.',
  '4-3': 'GV cần gặp riêng để hỏi thăm lý do; phụ đạo thêm hoặc giao 1 SV khác kèm riêng.',
  '2-1': 'GV cần gặp riêng tìm nguyên nhân và báo lại với nhà Trường.',
};

export const ISSUE_GROUP_VALUES = [1, 2, 3, 4] as const;

export type IssueGroup = (typeof ISSUE_GROUP_VALUES)[number];

export interface IssueGroupOption {
  value: IssueGroup;
  /** Nhãn ngắn dùng cho badge/bảng. */
  shortLabel: string;
  /** Nội dung nhóm, chép từ tài liệu. */
  label: string;
}

/** "Đánh giá về vấn đề khác của sinh viên" — 4 nhóm theo tài liệu. */
export const ISSUE_GROUPS: readonly IssueGroupOption[] = [
  {
    value: 1,
    shortLabel: 'Nhóm 1 — Chưa phù hợp chuyên ngành',
    label: 'Nhóm số 1: SV không phù hợp với chuyên ngành đã chọn.',
  },
  {
    value: 2,
    shortLabel: 'Nhóm 2 — Đi làm thêm',
    label: 'Nhóm số 2: SV đi làm thêm nên không có thời gian học tập.',
  },
  {
    value: 3,
    shortLabel: 'Nhóm 3 — Ưu tiên hoạt động khác',
    label:
      'Nhóm số 3: SV dành thời gian cho các hoạt động khác (chơi Game; gặp bạn bè, đi du lịch, mua sắm…) nên dành thời gian cho việc học ít hơn.',
  },
  {
    value: 4,
    shortLabel: 'Nhóm 4 — Tâm lí, gia đình',
    label:
      'Nhóm số 4: SV gặp phải các vấn đề về tâm lí, gia đình, cuộc sống, chán học muốn nghỉ học.',
  },
];

export interface IssueGroupSuggestion {
  /** Việc của giảng viên. */
  lecturer: readonly string[];
  /** Việc của cán bộ phòng CTSV. */
  studentAffairs: readonly string[];
}

/** "Giải pháp gợi ý (*)" theo nhóm vấn đề, tách theo người thực hiện. */
export const ISSUE_GROUP_SUGGESTIONS: Record<IssueGroup, IssueGroupSuggestion> = {
  1: {
    lecturer: ['Tư vấn chuyển ngành học cùng CTSV.'],
    studentAffairs: ['Tư vấn chuyển ngành học cùng giảng viên.'],
  },
  2: {
    lecturer: [
      'Linh hoạt deadline (trong giới hạn cho phép).',
      'Cung cấp tài liệu học ngắn gọn, trọng tâm.',
    ],
    studentAffairs: ['Hỗ trợ học bổng, vay vốn sinh viên hoặc tư vấn quản lý thời gian.'],
  },
  3: {
    lecturer: ['Động viên và kiểm tra thường xuyên.'],
    studentAffairs: ['Tổ chức các Workshop về quản lý thời gian; gọi điện tư vấn.'],
  },
  4: {
    lecturer: ['Giới thiệu chuyên gia tâm lý cho SV.'],
    studentAffairs: ['Gọi điện tư vấn và kết nối với thông tin gia đình.'],
  },
};

export interface EvaluationScores {
  academicScore: number;
  attitudeScore: number;
  issueGroup: number | null;
}

export interface UrgencySuggestion {
  /** Độ khẩn ĐỀ XUẤT 1-4. Không tự phát cảnh báo — người dùng vẫn phải xác nhận. */
  level: 1 | 2 | 3 | 4;
  /** Các lý do đã kích hoạt, sắp theo mức giảm dần. */
  reasons: string[];
}

interface UrgencyRule {
  level: UrgencySuggestion['level'];
  reason: string;
  matches: (scores: EvaluationScores) => boolean;
}

/**
 * Tài liệu mô tả 4 mức độ khẩn và ma trận người nhận, nhưng KHÔNG quy định
 * công thức suy ra mức từ điểm. Bộ luật dưới đây là đề xuất của hệ thống, bám
 * theo tinh thần các dải điểm: dải 2-1 là "báo lại với nhà Trường", dải 4-3 là
 * "gặp riêng", nhóm 4 là vấn đề tâm lí/nghỉ học. Nếu nhà trường ban hành công
 * thức chính thức thì sửa đúng chỗ này.
 */
const URGENCY_RULES: readonly UrgencyRule[] = [
  {
    level: 4,
    reason: 'Nhóm 4: vấn đề tâm lí, gia đình, cuộc sống, chán học muốn nghỉ học.',
    matches: ({ issueGroup }) => issueGroup === 4,
  },
  {
    level: 4,
    reason: 'Cả điểm học tập và thái độ đều ở dải 2-1.',
    matches: ({ academicScore, attitudeScore }) =>
      scoreBand(academicScore) === '2-1' && scoreBand(attitudeScore) === '2-1',
  },
  {
    level: 3,
    reason: 'Có điểm ở dải 2-1 — tài liệu yêu cầu báo lại với nhà Trường.',
    matches: ({ academicScore, attitudeScore }) =>
      scoreBand(academicScore) === '2-1' || scoreBand(attitudeScore) === '2-1',
  },
  {
    level: 2,
    reason: 'Có điểm ở dải 4-3 — cần gặp riêng, phụ đạo hoặc kèm cặp.',
    matches: ({ academicScore, attitudeScore }) =>
      scoreBand(academicScore) === '4-3' || scoreBand(attitudeScore) === '4-3',
  },
  {
    level: 2,
    reason: 'Nhóm 1: SV không phù hợp với chuyên ngành đã chọn.',
    matches: ({ issueGroup }) => issueGroup === 1,
  },
  {
    level: 2,
    reason: 'Nhóm 2: SV đi làm thêm nên không có thời gian học tập.',
    matches: ({ issueGroup }) => issueGroup === 2,
  },
  {
    level: 2,
    reason: 'Nhóm 3: SV dành thời gian cho các hoạt động khác.',
    matches: ({ issueGroup }) => issueGroup === 3,
  },
];

/** Mức đề xuất = mức cao nhất trong các luật khớp; không khớp luật nào → mức 1. */
export function suggestUrgencyLevel(scores: EvaluationScores): UrgencySuggestion {
  const matched = URGENCY_RULES.filter((rule) => rule.matches(scores));
  if (matched.length === 0) {
    return { level: 1, reasons: ['Điểm học tập và thái độ đều ổn, chưa ghi nhận vấn đề khác.'] };
  }

  const sorted = [...matched].sort((left, right) => right.level - left.level);
  return {
    level: sorted[0]?.level ?? 1,
    reasons: sorted.map((rule) => rule.reason),
  };
}

export interface EvaluationGuidance {
  academicBand: ScoreBand;
  attitudeBand: ScoreBand;
  academicDescription: string;
  attitudeDescription: string;
  /** Việc giảng viên nên làm — gợi ý theo dải điểm + theo nhóm vấn đề. */
  lecturerActions: string[];
  /** Việc cán bộ phòng CTSV nên làm — chỉ sinh khi có nhóm vấn đề. */
  studentAffairsActions: string[];
  suggestedLevel: UrgencySuggestion['level'];
  suggestedLevelReasons: string[];
}

function isIssueGroup(value: number | null): value is IssueGroup {
  return value !== null && (ISSUE_GROUP_VALUES as readonly number[]).includes(value);
}

/** Gộp toàn bộ nội dung gợi ý cho một lần đánh giá — thuần, không side effect. */
export function evaluationGuidance(scores: EvaluationScores): EvaluationGuidance {
  const academicBand = scoreBand(scores.academicScore);
  const attitudeBand = scoreBand(scores.attitudeScore);
  const group = isIssueGroup(scores.issueGroup) ? scores.issueGroup : null;
  const groupSuggestion = group === null ? null : ISSUE_GROUP_SUGGESTIONS[group];
  const urgency = suggestUrgencyLevel(scores);

  return {
    academicBand,
    attitudeBand,
    academicDescription: ACADEMIC_BAND_DESCRIPTIONS[academicBand],
    attitudeDescription: ATTITUDE_BAND_DESCRIPTIONS[attitudeBand],
    lecturerActions: [
      ACADEMIC_BAND_SUGGESTIONS[academicBand],
      ...(groupSuggestion?.lecturer ?? []),
    ],
    studentAffairsActions: [...(groupSuggestion?.studentAffairs ?? [])],
    suggestedLevel: urgency.level,
    suggestedLevelReasons: urgency.reasons,
  };
}
