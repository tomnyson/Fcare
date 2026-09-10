import { academicAnalysisOutputSchema } from './analysis-output';

const validOutput = {
  riskLevel: 'MEDIUM' as const,
  summary: 'Tiep tuc theo doi ket qua hoc tap hoc ky hien tai.',
  strengths: ['Chuyen can on dinh'],
  trends: [{ finding: 'Diem giua ky cai thien', evidence: 'Tu 6.5 len 7.2' }],
  riskFactors: [
    { finding: 'Diem cuoi ky giam', evidence: 'Mon CS102 dat 5.1' },
  ],
  recommendations: ['Hen gap giang vien co van trong 2 tuan toi'],
  notificationSummary: 'Can theo doi sat mot so hoc phan.',
  dataLimitations: ['Chua co nhan xet tu mot so hoc phan'],
  suggestedLevel: 2 as const,
  forcedEscalation: null,
};

describe('academicAnalysisOutputSchema', () => {
  it('chap nhan payload hop le dung cau truc phan tich hoc tap', () => {
    expect(academicAnalysisOutputSchema.parse(validOutput)).toEqual(
      validOutput,
    );
  });

  it('chấp nhận forcedEscalation có đủ luật, trích dẫn và cấp', () => {
    const parsed = academicAnalysisOutputSchema.safeParse({
      ...validOutput,
      suggestedLevel: 4,
      forcedEscalation: {
        rule: 'NO_LONGER_WANTS_TO_STUDY',
        quote: 'em không còn muốn học nữa',
        level: 4,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('từ chối forcedEscalation thiếu trích dẫn', () => {
    const parsed = academicAnalysisOutputSchema.safeParse({
      ...validOutput,
      suggestedLevel: 4,
      forcedEscalation: {
        rule: 'NO_LONGER_WANTS_TO_STUDY',
        quote: '',
        level: 4,
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('tu choi payload khong co khuyen nghi bat buoc', () => {
    const result = academicAnalysisOutputSchema.safeParse({
      ...validOutput,
      recommendations: [],
    });

    expect(result.success).toBe(false);
  });
});
