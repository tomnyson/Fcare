import { buildSectionCode, parseClassCode } from './class-code';

describe('parseClassCode', () => {
  it('nhận diện lớp hành chính và tách khoá + tiền tố ngành', () => {
    expect(parseClassCode('SD20301')).toEqual({
      kind: 'ADMIN',
      raw: 'SD20301',
      cohort: '20',
      majorPrefix: 'SD',
    });
  });

  it('tách đúng khoá của lớp khoá 21', () => {
    expect(parseClassCode('AI21301')).toEqual({
      kind: 'ADMIN',
      raw: 'AI21301',
      cohort: '21',
      majorPrefix: 'AI',
    });
  });

  it('nhận diện lớp học phần có hậu tố số thứ tự', () => {
    expect(parseClassCode('WEB2064.02')).toEqual({
      kind: 'SECTION',
      raw: 'WEB2064.02',
      cohort: null,
      majorPrefix: null,
    });
  });

  it('nhận diện lớp học phần không có hậu tố', () => {
    expect(parseClassCode('WEB2072')).toEqual({
      kind: 'SECTION',
      raw: 'WEB2072',
      cohort: null,
      majorPrefix: null,
    });
  });

  it('cắt khoảng trắng và viết hoa trước khi phân loại', () => {
    expect(parseClassCode('  sd20301 ')?.kind).toBe('ADMIN');
    expect(parseClassCode('  sd20301 ')?.raw).toBe('SD20301');
  });

  it('trả null cho ô rỗng', () => {
    expect(parseClassCode('')).toBeNull();
    expect(parseClassCode('   ')).toBeNull();
  });
});

describe('buildSectionCode', () => {
  it('lớp hành chính ghép mã môn + lớp + học kỳ', () => {
    const parsed = parseClassCode('SD20301')!;
    expect(buildSectionCode('PMA1011', parsed, 'SU26')).toBe(
      'PMA1011-SD20301-SU26',
    );
  });

  it('lớp học phần chỉ ghép mã lớp + học kỳ', () => {
    const parsed = parseClassCode('WEB2064.02')!;
    expect(buildSectionCode('WEB2064', parsed, 'SU26')).toBe('WEB2064.02-SU26');
  });

  it('hai lớp hành chính khác nhau trong cùng một sheet cho ra hai mã khác nhau', () => {
    // Sheet PMA1011 thật có cả SD20301 lẫn WD20301.
    const a = buildSectionCode('PMA1011', parseClassCode('SD20301')!, 'SU26');
    const b = buildSectionCode('PMA1011', parseClassCode('WD20301')!, 'SU26');
    expect(a).not.toBe(b);
  });
});
