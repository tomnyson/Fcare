import {
  containsForbiddenAnalysisPii,
  hashAnalysisSource,
  redactAnalysisText,
  type AnalysisSourceSnapshot,
} from './analysis-source';

const snapshot: AnalysisSourceSnapshot = {
  focusTerm: '2025A',
  enrollments: [
    {
      term: '2025A',
      subjectCode: 'INT101',
      subjectName: 'Nhap mon',
      attendanceRate: 0.9,
      midtermScore: 7,
      finalScore: 8,
      totalScore: 7.6,
      isExamBanned: false,
      result: 'PASS',
      updatedAt: '2026-08-24T00:00:00.000Z',
    },
  ],
  evaluations: [
    {
      term: '2025A',
      academicScore: 7,
      attitudeScore: 8,
      absentSessions: 1,
      criteria: ['P_PART_TIME_JOB'],
      note: 'Da redact',
      updatedAt: '2026-08-24T00:00:00.000Z',
    },
  ],
  careLogs: [],
  riskScore: {
    components: { RL: 1, RA: 1, RC: 0, RH: 0, RP: 2 },
    drs: 4,
    drsLevel: 1,
    dataForcedLevel: 1,
    evaluationCount: 1,
    medianAcademic: 7,
    medianAttitude: 8,
    triggeredCriteria: ['P_PART_TIME_JOB'],
    reasons: [],
  },
  limitations: [],
};

describe('analysis-source helpers', () => {
  it('redactAnalysisText an cac dinh danh da biet va PII thong dung', () => {
    const redacted = redactAnalysisText(
      'Nguyen Van A lien he 0912 345 678, email a@example.edu, CCCD 123456789 va uuid 123e4567-e89b-42d3-a456-426614174000.',
      ['Nguyen Van A'],
    );

    expect(redacted).toContain('[ĐÃ ẨN]');
    expect(redacted).toContain('[SĐT ĐÃ ẨN]');
    expect(redacted).toContain('[EMAIL ĐÃ ẨN]');
    expect(redacted).toContain('[ĐỊNH DANH ĐÃ ẨN]');
    expect(redacted).not.toContain('0912 345 678');
    expect(redacted).not.toContain('a@example.edu');
  });

  it('containsForbiddenAnalysisPii phat hien email chua duoc loai bo', () => {
    expect(
      containsForbiddenAnalysisPii('Sinh vien de lai email raw@example.edu'),
    ).toBe(true);
  });

  it('redact dia chi tieng Viet co dau ma khong phu thuoc word boundary ASCII', () => {
    const raw = 'Địa chỉ: 123 Nguyễn Trãi';
    expect(redactAnalysisText(raw, [])).toBe('[ĐỊA CHỈ ĐÃ ẨN]');
    expect(containsForbiddenAnalysisPii(raw)).toBe(true);
  });

  it('hashAnalysisSource cho ket qua on dinh voi cung mot snapshot', () => {
    expect(hashAnalysisSource(snapshot)).toBe(hashAnalysisSource(snapshot));
  });
});
