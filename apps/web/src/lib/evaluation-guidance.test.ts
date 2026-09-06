import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_BAND_SUGGESTIONS,
  ATTITUDE_BAND_DESCRIPTIONS,
  ISSUE_GROUPS,
  ISSUE_GROUP_SUGGESTIONS,
  SCORE_BANDS,
  evaluationGuidance,
  scoreBand,
  suggestUrgencyLevel,
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

describe('suggestUrgencyLevel', () => {
  it('sinh viên tốt mọi mặt → mức 1', () => {
    const result = suggestUrgencyLevel({ academicScore: 9, attitudeScore: 10, issueGroup: null });
    expect(result.level).toBe(1);
  });

  it('có nhóm vấn đề 1-3 nhưng điểm khá → tối thiểu mức 2', () => {
    const result = suggestUrgencyLevel({ academicScore: 8, attitudeScore: 8, issueGroup: 2 });
    expect(result.level).toBe(2);
    expect(result.reasons.join(' ')).toContain('Nhóm 2');
  });

  it('một điểm rơi dải 4-3 → mức 2', () => {
    expect(suggestUrgencyLevel({ academicScore: 4, attitudeScore: 9, issueGroup: null }).level).toBe(
      2,
    );
  });

  it('một điểm rơi dải 2-1 → mức 3', () => {
    expect(suggestUrgencyLevel({ academicScore: 2, attitudeScore: 8, issueGroup: null }).level).toBe(
      3,
    );
  });

  it('cả hai điểm rơi dải 2-1 → mức 4', () => {
    expect(suggestUrgencyLevel({ academicScore: 1, attitudeScore: 2, issueGroup: null }).level).toBe(
      4,
    );
  });

  it('nhóm 4 (tâm lí, gia đình, muốn nghỉ học) luôn là mức 4 dù điểm cao', () => {
    const result = suggestUrgencyLevel({ academicScore: 10, attitudeScore: 10, issueGroup: 4 });
    expect(result.level).toBe(4);
    expect(result.reasons.join(' ')).toContain('Nhóm 4');
  });

  it('lấy mức cao nhất trong các lý do áp dụng được', () => {
    const result = suggestUrgencyLevel({ academicScore: 2, attitudeScore: 4, issueGroup: 3 });
    expect(result.level).toBe(3);
    expect(result.reasons.length).toBeGreaterThan(1);
  });

  it('luôn trả mức trong khoảng 1-4', () => {
    for (let academic = 1; academic <= 10; academic += 1) {
      for (let attitude = 1; attitude <= 10; attitude += 1) {
        const { level } = suggestUrgencyLevel({
          academicScore: academic,
          attitudeScore: attitude,
          issueGroup: null,
        });
        expect(level).toBeGreaterThanOrEqual(1);
        expect(level).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe('evaluationGuidance', () => {
  it('gộp mô tả, giải pháp và mức đề xuất cho một lần đánh giá', () => {
    const guidance = evaluationGuidance({
      academicScore: 3,
      attitudeScore: 5,
      issueGroup: 2,
    });

    expect(guidance.academicBand).toBe('4-3');
    expect(guidance.attitudeBand).toBe('6-5');
    expect(guidance.lecturerActions.length).toBeGreaterThanOrEqual(2);
    expect(guidance.studentAffairsActions.length).toBeGreaterThanOrEqual(1);
    expect(guidance.suggestedLevel).toBe(2);
  });

  it('không có nhóm vấn đề thì không sinh việc cho CB CTSV', () => {
    const guidance = evaluationGuidance({
      academicScore: 9,
      attitudeScore: 9,
      issueGroup: null,
    });
    expect(guidance.studentAffairsActions).toEqual([]);
    expect(guidance.lecturerActions.length).toBeGreaterThan(0);
  });
});
