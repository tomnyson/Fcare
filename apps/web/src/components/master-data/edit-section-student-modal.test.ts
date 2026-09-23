import { describe, expect, it } from 'vitest';

describe('EditSectionStudentModal logic', () => {
  it('kiểm tra giá trị điểm tổng kết hợp lệ trong khoảng 0..10', () => {
    const isValidScore = (score: number | null) => score === null || (score >= 0 && score <= 10);
    expect(isValidScore(8.5)).toBe(true);
    expect(isValidScore(null)).toBe(true);
    expect(isValidScore(-1)).toBe(false);
    expect(isValidScore(11)).toBe(false);
  });
});
