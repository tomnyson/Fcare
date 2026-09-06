import { describe, expect, it } from 'vitest';
import {
  editableAnalysisOutput,
  evidenceFromLines,
  evidenceToLines,
  parseEditableAnalysisOutput,
  uniqueTermsFromEnrollments,
} from './student-analysis-helpers';

describe('uniqueTermsFromEnrollments', () => {
  it('loại trùng và sắp xếp học kỳ giảm dần', () => {
    expect(
      uniqueTermsFromEnrollments([
        { id: '1', attendanceRate: null, midtermScore: null, finalScore: null, totalScore: null, isExamBanned: false, result: 'IN_PROGRESS', classSection: { id: 'a', code: 'A', term: 'SP25', subjectId: 's', lecturerId: null } },
        { id: '2', attendanceRate: null, midtermScore: null, finalScore: null, totalScore: null, isExamBanned: false, result: 'IN_PROGRESS', classSection: { id: 'b', code: 'B', term: 'SU25', subjectId: 's', lecturerId: null } },
        { id: '3', attendanceRate: null, midtermScore: null, finalScore: null, totalScore: null, isExamBanned: false, result: 'IN_PROGRESS', classSection: { id: 'c', code: 'C', term: 'SU25', subjectId: 's', lecturerId: null } },
      ]),
    ).toEqual(['SU25', 'SP25']);
  });
});

describe('evidence line conversion', () => {
  it('round-trip được finding/evidence', () => {
    const lines = evidenceToLines([
      { finding: 'Xu hướng điểm giảm', evidence: '2 môn gần nhất dưới 6' },
      { finding: 'Chuyên cần thấp', evidence: '1 học phần dưới 70%' },
    ]);
    expect(evidenceFromLines(lines)).toEqual([
      { finding: 'Xu hướng điểm giảm', evidence: '2 môn gần nhất dưới 6' },
      { finding: 'Chuyên cần thấp', evidence: '1 học phần dưới 70%' },
    ]);
  });
});

describe('editableAnalysisOutput', () => {
  it('chuyển qua lại giữa form text và structured output', () => {
    const source = {
      riskLevel: 'MEDIUM' as const,
      summary: 'Tóm tắt',
      strengths: ['Ổn định'],
      trends: [{ finding: 'Điểm giảm', evidence: 'môn A' }],
      riskFactors: [{ finding: 'Vắng học', evidence: '3 buổi' }],
      recommendations: ['Gặp cố vấn'],
      notificationSummary: 'Cần theo dõi sát',
      dataLimitations: ['Chưa có evaluation học kỳ hiện tại'],
    };
    expect(parseEditableAnalysisOutput(editableAnalysisOutput(source))).toEqual(source);
  });
});
