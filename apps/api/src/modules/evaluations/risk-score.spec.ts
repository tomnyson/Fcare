import { computeRiskScore, levelFromDrs } from '@fcare/shared-types';
import type { EvaluationInput } from '@fcare/shared-types';

/** Nhận xét "sạch": mọi thành phần bằng 0 — dùng làm nền cho từng ca kiểm. */
function clean(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    academicScore: 10,
    attitudeScore: 10,
    absentSessions: null,
    criteria: [],
    ...overrides,
  };
}

describe('computeRiskScore', () => {
  it('không có nhận xét nào thì mọi thành phần bằng 0 và cấp 1', () => {
    const result = computeRiskScore([]);
    expect(result.components).toEqual({ RL: 0, RA: 0, RC: 0, RH: 0, RP: 0 });
    expect(result.drs).toBe(0);
    expect(result.drsLevel).toBe(1);
    expect(result.evaluationCount).toBe(0);
  });

  it('quy dải điểm học lực và thái độ theo bảng II.2', () => {
    // 5 điểm -> dải 6-5 -> 2đ ; 3 điểm -> dải 4-3 -> 3đ
    const result = computeRiskScore([
      clean({ academicScore: 5, attitudeScore: 3 }),
    ]);
    expect(result.components.RL).toBe(2);
    expect(result.components.RA).toBe(3);
  });

  it('nhiều giảng viên thì lấy TRUNG VỊ chứ không phải trung bình (số lẻ)', () => {
    // [10, 1, 1] -> trung bình 4 (dải 4-3, 3đ) nhưng trung vị 1 (dải 2-1, 4đ)
    const result = computeRiskScore([
      clean({ academicScore: 10 }),
      clean({ academicScore: 1 }),
      clean({ academicScore: 1 }),
    ]);
    expect(result.medianAcademic).toBe(1);
    expect(result.components.RL).toBe(4);
  });

  it('trung vị số chẵn lấy trung bình hai phần tử giữa', () => {
    // [3, 5, 7, 9] -> trung vị (5+7)/2 = 6 -> dải 6-5 -> 2đ
    const result = computeRiskScore([
      clean({ academicScore: 3 }),
      clean({ academicScore: 5 }),
      clean({ academicScore: 7 }),
      clean({ academicScore: 9 }),
    ]);
    expect(result.medianAcademic).toBe(6);
    expect(result.components.RL).toBe(2);
  });

  it('R_P cộng điểm các tiêu chí KHÁC nhau của nhiều giảng viên', () => {
    const result = computeRiskScore([
      clean({ criteria: ['P_PART_TIME_JOB'] }), // +2
      clean({ criteria: ['P_PSYCHOLOGICAL'] }), // +3
    ]);
    expect(result.components.RP).toBe(5);
  });

  it('R_P chỉ tính MỘT lần khi nhiều giảng viên tích cùng một tiêu chí', () => {
    const result = computeRiskScore([
      clean({ criteria: ['P_PART_TIME_JOB'] }),
      clean({ criteria: ['P_PART_TIME_JOB'] }),
      clean({ criteria: ['P_PART_TIME_JOB'] }),
    ]);
    expect(result.components.RP).toBe(2);
  });

  it('R_H hợp nhất tiêu chí trùng, cộng tiêu chí khác nhau', () => {
    const result = computeRiskScore([
      clean({ criteria: ['H_NO_QUIZ_CMS', 'H_EXAM_BAN_RISK'] }), // 2 + 3
      clean({ criteria: ['H_NO_QUIZ_CMS', 'H_NO_RESPONSE'] }), // trùng + 4
    ]);
    expect(result.components.RH).toBe(9);
  });

  it('R_C lấy số buổi vắng cao nhất khi các giảng viên vắng khác nhau', () => {
    const result = computeRiskScore([
      clean({ absentSessions: 0 }),
      clean({ absentSessions: 3 }),
    ]);
    expect(result.components.RC).toBe(3);
  });

  it('R_C = 9 khi TẤT CẢ giảng viên đều ghi vắng 2 buổi', () => {
    const result = computeRiskScore([
      clean({ absentSessions: 2 }),
      clean({ absentSessions: 2 }),
    ]);
    expect(result.components.RC).toBe(9);
  });

  it('R_C = 12 khi TẤT CẢ giảng viên đều ghi vắng từ 3 buổi', () => {
    const result = computeRiskScore([
      clean({ absentSessions: 3 }),
      clean({ absentSessions: 4 }),
    ]);
    expect(result.components.RC).toBe(12);
  });

  it('MỘT giảng viên đơn lẻ không kích hoạt luật "tất cả giảng viên"', () => {
    expect(computeRiskScore([clean({ absentSessions: 2 })]).components.RC).toBe(
      2,
    );
    expect(computeRiskScore([clean({ absentSessions: 3 })]).components.RC).toBe(
      3,
    );
  });

  it('bản nhận xét bỏ trống số buổi vắng không được tính là "tất cả đều vắng"', () => {
    const result = computeRiskScore([
      clean({ absentSessions: 3 }),
      clean({ absentSessions: null }),
    ]);
    expect(result.components.RC).toBe(3);
  });

  it('ép cấp 3 từ dữ liệu khi tất cả giảng viên đều vắng từ 3 buổi', () => {
    const result = computeRiskScore([
      clean({ absentSessions: 3 }),
      clean({ absentSessions: 3 }),
    ]);
    expect(result.dataForcedLevel).toBe(3);
  });

  it.each([
    [0, 1],
    [4, 1],
    [5, 2],
    [8, 2],
    [9, 3],
    [12, 3],
    [13, 4],
    [30, 4],
  ])('DRS %i rơi vào cấp %i', (drs, level) => {
    expect(levelFromDrs(drs)).toBe(level);
  });

  it('cộng đủ 5 thành phần thành DRS và ra đúng cấp độ', () => {
    // R_L 3 + R_A 3 + R_C 3 + R_H 3 (cấm thi) + R_P 2 (làm thêm) = 14 -> cấp 4
    const result = computeRiskScore([
      clean({
        academicScore: 3,
        attitudeScore: 3,
        absentSessions: 3,
        criteria: ['H_EXAM_BAN_RISK', 'P_PART_TIME_JOB'],
      }),
    ]);
    expect(result.components).toEqual({ RL: 3, RA: 3, RC: 3, RH: 3, RP: 2 });
    expect(result.drs).toBe(14);
    expect(result.drsLevel).toBe(4);
  });
});
