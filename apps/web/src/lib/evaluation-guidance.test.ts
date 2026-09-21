import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_BAND_SUGGESTIONS,
  BAND_CLASSIFICATIONS,
  BAND_RANGE_LABELS,
  ATTITUDE_BAND_DESCRIPTIONS,
  ISSUE_GROUPS,
  ISSUE_GROUP_SUGGESTIONS,
  SCORE_BANDS,
  evaluationGuidance,
  issueGroupsFromCriteria,
  scoreBand,
} from '@fcare/shared-types';

describe('scoreBand', () => {
  it('gom điểm 1-10 vào đúng 5 dải của tài liệu', () => {
    expect(scoreBand(10)).toBe('10-9');
    expect(scoreBand(9)).toBe('10-9');
    expect(scoreBand(8)).toBe('8-7');
    expect(scoreBand(7)).toBe('8-7');
    expect(scoreBand(6)).toBe('6-5');
    expect(scoreBand(5)).toBe('6-5');
    expect(scoreBand(4)).toBe('4-3');
    expect(scoreBand(3)).toBe('4-3');
    expect(scoreBand(2)).toBe('2-1');
    expect(scoreBand(1)).toBe('2-1');
  });

  it('kẹp điểm ngoài biên về dải gần nhất thay vì trả undefined', () => {
    expect(scoreBand(0)).toBe('2-1');
    expect(scoreBand(-3)).toBe('2-1');
    expect(scoreBand(11)).toBe('10-9');
  });

  it('làm tròn điểm thập phân trước khi gom dải', () => {
    expect(scoreBand(8.6)).toBe('10-9');
    expect(scoreBand(8.4)).toBe('8-7');
  });
});

describe('bảng nội dung theo tài liệu', () => {
  it('có đủ 5 dải và mỗi dải có mô tả + gợi ý', () => {
    expect(SCORE_BANDS).toEqual(['10-9', '8-7', '6-5', '4-3', '2-1']);
    for (const band of SCORE_BANDS) {
      expect(ATTITUDE_BAND_DESCRIPTIONS[band].length).toBeGreaterThan(0);
      expect(ACADEMIC_BAND_SUGGESTIONS[band].length).toBeGreaterThan(0);
    }
  });

  it('mỗi dải có xếp loại học lực và nhãn dải đúng chữ trong tài liệu', () => {
    expect(BAND_CLASSIFICATIONS).toEqual({
      '10-9': 'Xuất sắc / Giỏi',
      '8-7': 'Khá',
      '6-5': 'Trung bình',
      '4-3': 'Yếu',
      '2-1': 'Kém',
    });
    expect(BAND_RANGE_LABELS).toEqual({
      '10-9': '9–10',
      '8-7': '7–8',
      '6-5': '5–6',
      '4-3': '3–4',
      '2-1': '1–2',
    });
  });

  it('nhóm vấn đề đúng 4 nhóm của tài liệu, không phải nhãn cũ trong UI', () => {
    expect(ISSUE_GROUPS.map((group) => group.value)).toEqual([1, 2, 3, 4]);
    expect(ISSUE_GROUPS[0]?.label).toContain('chuyên ngành');
    expect(ISSUE_GROUPS[1]?.label).toContain('làm thêm');
    expect(ISSUE_GROUPS[2]?.label).toContain('hoạt động khác');
    expect(ISSUE_GROUPS[3]?.label).toContain('tâm lí');
  });

  it('tách giải pháp của giảng viên và của CB CTSV cho từng nhóm', () => {
    for (const group of ISSUE_GROUPS) {
      const suggestion = ISSUE_GROUP_SUGGESTIONS[group.value];
      expect(suggestion.lecturer.length).toBeGreaterThan(0);
      expect(suggestion.studentAffairs.length).toBeGreaterThan(0);
    }
  });
});

describe('issueGroupsFromCriteria', () => {
  it('suy nhóm vấn đề từ tiêu chí đã tích, giữ thứ tự 1→4', () => {
    expect(
      issueGroupsFromCriteria(['P_PSYCHOLOGICAL', 'P_PART_TIME_JOB', 'P_NOT_FIT_MAJOR']),
    ).toEqual([1, 2, 4]);
  });

  it('tiêu chí học tập (H_*) không thuộc nhóm vấn đề nào', () => {
    expect(issueGroupsFromCriteria(['H_NO_QUIZ_CMS', 'H_EXAM_BAN_RISK'])).toEqual([]);
  });

  it('khó khăn tài chính dùng chung nhóm 2 với đi làm thêm', () => {
    expect(issueGroupsFromCriteria(['P_FINANCIAL_HARDSHIP'])).toEqual([2]);
  });
});

describe('evaluationGuidance', () => {
  it('gộp mô tả, giải pháp và mức đề xuất cho một bản nhận xét', () => {
    const guidance = evaluationGuidance({
      academicScore: 3,
      attitudeScore: 5,
      criteria: ['P_PART_TIME_JOB'],
    });

    expect(guidance.academicBand).toBe('4-3');
    expect(guidance.attitudeBand).toBe('6-5');
    expect(guidance.criterionLabels).toEqual(['Đi làm thêm ảnh hưởng việc học']);
    expect(guidance.lecturerActions.length).toBeGreaterThanOrEqual(2);
    expect(guidance.studentAffairsActions.length).toBeGreaterThanOrEqual(1);
    // R_L 3 + R_A 2 + R_P 2 = 7 → dải 5-8 → cấp 2.
    expect(guidance.suggestedLevel).toBe(2);
    expect(guidance.suggestedLevelReasons.at(-1)).toBe(
      'Tổng DRS của riêng bản nhận xét này: 7 điểm.',
    );
  });

  it('không tích tiêu chí nào thì không sinh việc cho CB CTSV', () => {
    const guidance = evaluationGuidance({
      academicScore: 9,
      attitudeScore: 9,
      criteria: [],
    });
    expect(guidance.studentAffairsActions).toEqual([]);
    expect(guidance.lecturerActions.length).toBeGreaterThan(0);
    expect(guidance.suggestedLevel).toBe(1);
  });

  it('ý định nghỉ học nặng 9 điểm nên đẩy lên cấp 3 dù điểm đẹp', () => {
    const guidance = evaluationGuidance({
      academicScore: 10,
      attitudeScore: 10,
      criteria: ['P_DROPOUT_INTENT'],
    });
    expect(guidance.issueGroups).toEqual([4]);
    expect(guidance.suggestedLevel).toBe(3);
  });

  it('mức đề xuất luôn nằm trong khoảng 1-4', () => {
    for (let academic = 1; academic <= 10; academic += 1) {
      for (let attitude = 1; attitude <= 10; attitude += 1) {
        const { suggestedLevel } = evaluationGuidance({
          academicScore: academic,
          attitudeScore: attitude,
          criteria: [],
        });
        expect(suggestedLevel).toBeGreaterThanOrEqual(1);
        expect(suggestedLevel).toBeLessThanOrEqual(4);
      }
    }
  });

  it('số buổi vắng được chấm vào R_C của mức đề xuất (trước đây luôn bỏ qua)', () => {
    const base = { academicScore: 6, attitudeScore: 6, criteria: [] };
    const none = evaluationGuidance(base);
    const two = evaluationGuidance({ ...base, absentSessions: 2 });
    const three = evaluationGuidance({ ...base, absentSessions: 3 });

    // Dải 6-5 → R_L 2 + R_A 2 = 4 (cấp 1); vắng 2 buổi +2 = 6, vắng 3 buổi +3 = 7 (cấp 2).
    expect(none.suggestedLevel).toBe(1);
    expect(two.suggestedLevel).toBe(2);
    expect(three.suggestedLevel).toBe(2);
    expect(two.suggestedLevelReasons.join(' ')).toContain('vắng nhiều nhất 2 buổi → 2 điểm');
    expect(three.suggestedLevelReasons.join(' ')).toContain('vắng nhiều nhất 3 buổi → 3 điểm');
  });

  it('vắng dưới 2 buổi hoặc bỏ trống thì không cộng điểm chuyên cần', () => {
    const base = { academicScore: 4, attitudeScore: 4, criteria: [] };
    expect(evaluationGuidance({ ...base, absentSessions: 1 }).suggestedLevelReasons.join(' '))
      .not.toContain('Chuyên cần');
    expect(evaluationGuidance({ ...base, absentSessions: null }).suggestedLevelReasons.join(' '))
      .not.toContain('Chuyên cần');
  });

  it('vắng 3 buổi đẩy bản nhận xét đang ở cấp 2 lên cấp 3', () => {
    // Dải 4-3 → R_L 3 + R_A 3 = 6 (cấp 2); +3 chuyên cần = 9 → cấp 3.
    const base = { academicScore: 4, attitudeScore: 4, criteria: [] };
    expect(evaluationGuidance(base).suggestedLevel).toBe(2);
    expect(evaluationGuidance({ ...base, absentSessions: 3 }).suggestedLevel).toBe(3);
  });
});
