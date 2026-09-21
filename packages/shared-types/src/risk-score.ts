/**
 * Công thức điểm rủi ro DRS theo tài liệu "PHẦN II — II.2 CƠ CHẾ ĐÁNH GIÁ ĐỘ
 * KHẨN TỰ ĐỘNG KẾT HỢP AI" (docs/tailieu/cochedokhan.md).
 *
 * Bảng điểm ở đây là QUY ĐỊNH của Trường — sửa số nghĩa là sửa quy định.
 * RULE 1: không có bất kỳ trường PII nào của sinh viên trong file này.
 */
import { scoreBand, type ScoreBand } from './evaluations';

export const EVALUATION_CRITERIA = [
  'P_NOT_FIT_MAJOR',
  'P_PART_TIME_JOB',
  'P_OTHER_ACTIVITIES',
  'P_FAMILY_HARDSHIP',
  'P_FINANCIAL_HARDSHIP',
  'P_PSYCHOLOGICAL',
  'P_DROPOUT_INTENT',
  'H_NO_QUIZ_CMS',
  'H_EXAM_BAN_RISK',
  'H_NO_RESPONSE',
] as const;

export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number];

/** Điểm độ khẩn của từng tiêu chí — bảng II.2 mục 3 và mục 4. */
export const CRITERION_POINTS: Record<EvaluationCriterion, number> = {
  P_NOT_FIT_MAJOR: 2,
  P_PART_TIME_JOB: 2,
  P_OTHER_ACTIVITIES: 1,
  P_FAMILY_HARDSHIP: 2,
  P_FINANCIAL_HARDSHIP: 2,
  P_PSYCHOLOGICAL: 3,
  P_DROPOUT_INTENT: 9,
  H_NO_QUIZ_CMS: 2,
  H_EXAM_BAN_RISK: 3,
  H_NO_RESPONSE: 4,
};

export const CRITERION_LABELS: Record<EvaluationCriterion, string> = {
  P_NOT_FIT_MAJOR: 'Không phù hợp chuyên ngành',
  P_PART_TIME_JOB: 'Đi làm thêm ảnh hưởng việc học',
  P_OTHER_ACTIVITIES: 'Hoạt động cá nhân khác ảnh hưởng việc học',
  P_FAMILY_HARDSHIP: 'Khó khăn gia đình / cuộc sống',
  P_FINANCIAL_HARDSHIP: 'Khó khăn tài chính',
  P_PSYCHOLOGICAL: 'Vấn đề tâm lý / mất động lực',
  P_DROPOUT_INTENT: 'Có ý định nghỉ học',
  H_NO_QUIZ_CMS: 'Không làm Quiz trên CMS / học Udemy',
  H_EXAM_BAN_RISK: 'Nguy cơ cấm thi / không đủ điều kiện dự thi',
  H_NO_RESPONSE: 'Không phản hồi giảng viên hoặc CTSV',
};

/** Điểm độ khẩn theo dải điểm 1-10 — bảng II.2 mục 1 và mục 2. */
const BAND_POINTS: Record<ScoreBand, number> = {
  '10-9': 0,
  '8-7': 1,
  '6-5': 2,
  '4-3': 3,
  '2-1': 4,
};

export type UrgencyLevel = 1 | 2 | 3 | 4;

export interface EvaluationInput {
  academicScore: number;
  attitudeScore: number;
  /** Số buổi vắng giảng viên ghi nhận; null = giảng viên chưa nhận xét chuyên cần. */
  absentSessions: number | null;
  criteria: EvaluationCriterion[];
}

export interface RiskScoreBreakdown {
  components: { RL: number; RA: number; RC: number; RH: number; RP: number };
  drs: number;
  drsLevel: UrgencyLevel;
  /** Luật ép cấp độ suy được thuần từ dữ liệu; 1 nghĩa là không ép. */
  dataForcedLevel: 1 | 3;
  evaluationCount: number;
  medianAcademic: number;
  medianAttitude: number;
  triggeredCriteria: EvaluationCriterion[];
  reasons: string[];
}

/** Trung vị: lẻ lấy phần tử giữa, chẵn lấy trung bình hai phần tử giữa. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** Thang điểm cuối — bảng "CÔNG THỨC ĐIỂM RỦI RO". */
export function levelFromDrs(drs: number): UrgencyLevel {
  if (drs >= 13) return 4;
  if (drs >= 9) return 3;
  if (drs >= 5) return 2;
  return 1;
}

function absentPoint(sessions: number): number {
  if (sessions < 2) return 0;
  if (sessions === 2) return 2;
  return 3;
}

/**
 * R_C. Luật "tất cả giảng viên đều vắng" chỉ áp dụng khi có từ 2 bản nhận xét
 * có ghi số buổi vắng trở lên (quy ước đã chốt — xem spec mục 2).
 * Thứ tự kiểm tra quan trọng: "đều >= 3" phải xét TRƯỚC "đều >= 2".
 */
function attendanceScore(sessions: number[]): number {
  if (sessions.length === 0) return 0;
  const worst = Math.max(...sessions.map(absentPoint));
  if (sessions.length < 2) return worst;
  if (sessions.every((count) => count >= 3)) return 12;
  if (sessions.every((count) => count >= 2)) return 9;
  return worst;
}

function sumCriteria(
  marked: Set<EvaluationCriterion>,
  prefix: 'P_' | 'H_',
): number {
  let total = 0;
  for (const criterion of marked) {
    if (criterion.startsWith(prefix)) total += CRITERION_POINTS[criterion];
  }
  return total;
}

export function computeRiskScore(
  inputs: EvaluationInput[],
): RiskScoreBreakdown {
  const medianAcademic = median(inputs.map((item) => item.academicScore));
  const medianAttitude = median(inputs.map((item) => item.attitudeScore));
  const sessions = inputs
    .map((item) => item.absentSessions)
    .filter((value): value is number => value !== null);
  const marked = new Set<EvaluationCriterion>(
    inputs.flatMap((item) => item.criteria),
  );

  const RL = inputs.length === 0 ? 0 : BAND_POINTS[scoreBand(medianAcademic)];
  const RA = inputs.length === 0 ? 0 : BAND_POINTS[scoreBand(medianAttitude)];
  const RC = attendanceScore(sessions);
  const RP = sumCriteria(marked, 'P_');
  const RH = sumCriteria(marked, 'H_');
  const drs = RL + RA + RC + RH + RP;

  const allAbsentThree =
    sessions.length >= 2 && sessions.every((count) => count >= 3);

  const reasons: string[] = [];
  if (inputs.length > 0) {
    reasons.push(
      `Học lực: trung vị ${medianAcademic} (dải ${scoreBand(medianAcademic)}) → ${RL} điểm.`,
      `Thái độ: trung vị ${medianAttitude} (dải ${scoreBand(medianAttitude)}) → ${RA} điểm.`,
    );
  }
  if (RC > 0) {
    reasons.push(
      allAbsentThree
        ? `Chuyên cần: tất cả ${sessions.length} giảng viên đều ghi vắng từ 3 buổi → ${RC} điểm.`
        : `Chuyên cần: vắng nhiều nhất ${Math.max(...sessions)} buổi → ${RC} điểm.`,
    );
  }
  for (const criterion of marked) {
    reasons.push(
      `${CRITERION_LABELS[criterion]} → +${CRITERION_POINTS[criterion]} điểm.`,
    );
  }

  return {
    components: { RL, RA, RC, RH, RP },
    drs,
    drsLevel: levelFromDrs(drs),
    dataForcedLevel: allAbsentThree ? 3 : 1,
    evaluationCount: inputs.length,
    medianAcademic,
    medianAttitude,
    triggeredCriteria: [...marked],
    reasons,
  };
}
