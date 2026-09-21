/**
 * Cầu nối giữa 10 tiêu chí chấm điểm DRS (`risk-score.ts`) và 4 "nhóm vấn đề"
 * kèm giải pháp gợi ý trong tài liệu II.1 (`evaluations.ts`).
 *
 * Trước đây UI hỏi giảng viên chọn thẳng "nhóm vấn đề"; giờ giảng viên tích
 * tiêu chí để tính điểm, còn nhóm vấn đề được suy ra từ tiêu chí đã tích —
 * bảng ánh xạ dưới đây là chỗ duy nhất giữ quan hệ đó.
 *
 * RULE 1: không có bất kỳ trường PII nào của sinh viên trong file này.
 */
import {
  ACADEMIC_BAND_DESCRIPTIONS,
  ACADEMIC_BAND_SUGGESTIONS,
  ATTITUDE_BAND_DESCRIPTIONS,
  ISSUE_GROUP_SUGGESTIONS,
  ISSUE_GROUP_VALUES,
  scoreBand,
  type IssueGroup,
  type ScoreBand,
} from './evaluations';
import {
  CRITERION_LABELS,
  computeRiskScore,
  type EvaluationCriterion,
  type UrgencyLevel,
} from './risk-score';

/** Tiêu chí nào thuộc nhóm vấn đề nào; `null` = tiêu chí học tập, không có nhóm. */
export const CRITERION_ISSUE_GROUP: Record<
  EvaluationCriterion,
  IssueGroup | null
> = {
  P_NOT_FIT_MAJOR: 1,
  P_PART_TIME_JOB: 2,
  P_OTHER_ACTIVITIES: 3,
  P_FAMILY_HARDSHIP: 4,
  // Khó khăn tài chính dùng chung giải pháp với nhóm 2 (học bổng, vay vốn).
  P_FINANCIAL_HARDSHIP: 2,
  P_PSYCHOLOGICAL: 4,
  P_DROPOUT_INTENT: 4,
  H_NO_QUIZ_CMS: null,
  H_EXAM_BAN_RISK: null,
  H_NO_RESPONSE: null,
};

/** Các nhóm vấn đề suy ra từ tiêu chí đã tích, giữ thứ tự 1→4 của tài liệu. */
export function issueGroupsFromCriteria(
  criteria: readonly EvaluationCriterion[],
): IssueGroup[] {
  const groups = new Set(
    criteria
      .map((criterion) => CRITERION_ISSUE_GROUP[criterion])
      .filter((group): group is IssueGroup => group !== null),
  );
  return ISSUE_GROUP_VALUES.filter((value) => groups.has(value));
}

export interface EvaluationScores {
  academicScore: number;
  attitudeScore: number;
  criteria: readonly EvaluationCriterion[];
  /** Số buổi vắng của lớp học phần này; bỏ trống/null = chưa có dữ liệu chuyên cần. */
  absentSessions?: number | null;
}

export interface EvaluationGuidance {
  academicBand: ScoreBand;
  attitudeBand: ScoreBand;
  academicDescription: string;
  attitudeDescription: string;
  /** Nhóm vấn đề suy từ tiêu chí — dùng để lấy giải pháp gợi ý. */
  issueGroups: IssueGroup[];
  /** Nhãn các tiêu chí đã tích, để hiển thị lại cho người đọc. */
  criterionLabels: string[];
  /** Việc giảng viên nên làm — gợi ý theo dải điểm + theo nhóm vấn đề. */
  lecturerActions: string[];
  /** Việc cán bộ phòng CTSV nên làm — chỉ sinh khi có nhóm vấn đề. */
  studentAffairsActions: string[];
  /**
   * Độ khẩn ĐỀ XUẤT nếu chỉ có một mình bản nhận xét này. Cấp chính thức của
   * sinh viên tính trên trung vị của TẤT CẢ giảng viên — xem `/evaluations/risk-score`.
   */
  suggestedLevel: UrgencyLevel;
  suggestedLevelReasons: string[];
}

/** Gộp toàn bộ nội dung gợi ý cho một lần nhận xét — thuần, không side effect. */
export function evaluationGuidance(
  scores: EvaluationScores,
): EvaluationGuidance {
  const academicBand = scoreBand(scores.academicScore);
  const attitudeBand = scoreBand(scores.attitudeScore);
  const issueGroups = issueGroupsFromCriteria(scores.criteria);
  const breakdown = computeRiskScore([
    {
      academicScore: scores.academicScore,
      attitudeScore: scores.attitudeScore,
      absentSessions: scores.absentSessions ?? null,
      criteria: [...scores.criteria],
    },
  ]);

  return {
    academicBand,
    attitudeBand,
    academicDescription: ACADEMIC_BAND_DESCRIPTIONS[academicBand],
    attitudeDescription: ATTITUDE_BAND_DESCRIPTIONS[attitudeBand],
    issueGroups,
    criterionLabels: scores.criteria.map(
      (criterion) => CRITERION_LABELS[criterion],
    ),
    lecturerActions: [
      ACADEMIC_BAND_SUGGESTIONS[academicBand],
      ...issueGroups.flatMap((group) => ISSUE_GROUP_SUGGESTIONS[group].lecturer),
    ],
    studentAffairsActions: issueGroups.flatMap(
      (group) => ISSUE_GROUP_SUGGESTIONS[group].studentAffairs,
    ),
    suggestedLevel: breakdown.drsLevel,
    suggestedLevelReasons: [
      ...breakdown.reasons,
      `Tổng DRS của riêng bản nhận xét này: ${breakdown.drs} điểm.`,
    ],
  };
}
