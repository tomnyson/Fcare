import {
  CLASS_MAJOR_RULES,
  DEPARTMENT_ALIASES,
  DEPARTMENTS,
  MAJOR_ALIASES,
  MAJORS,
} from './seed-data';

describe('dữ liệu danh mục seed', () => {
  it('có đúng 12 bộ môn thật, không còn bộ môn giả SE/AI/GD', () => {
    expect(DEPARTMENTS).toHaveLength(12);
    const codes = DEPARTMENTS.map((d) => d.code);
    expect(codes).toContain('CNTT');
    expect(codes).toContain('GDQP');
    expect(codes).not.toContain('SE');
    expect(codes).not.toContain('GD');
  });

  it('mã bộ môn là ASCII, không dấu — dùng làm khoá tra cứu', () => {
    for (const dept of DEPARTMENTS) {
      expect(dept.code).toMatch(/^[A-Z0-9]+$/);
    }
  });

  it('mọi alias trỏ tới một bộ môn có thật', () => {
    const codes = new Set(DEPARTMENTS.map((d) => d.code));
    for (const alias of DEPARTMENT_ALIASES) {
      expect(codes.has(alias.deptCode)).toBe(true);
    }
  });

  it('phủ hết 7 mã bộ môn của sheet "Lịch tool" trừ THUC-TAP-TN', () => {
    const aliases = new Set(DEPARTMENT_ALIASES.map((a) => a.alias));
    for (const raw of [
      'CONG-NGHE-THONG-TIN',
      'CO-BAN',
      'NGON-NGU',
      'THUONG-MAI-DIEN-TU',
      'KINH-TE',
      'THIET-KE-DO-HOA',
      'UNG-DUNG-PHAN-MEM',
    ]) {
      expect(aliases.has(raw)).toBe(true);
    }
    // THUC-TAP-TN cố ý KHÔNG seed: file nguồn không có bộ môn đối ứng,
    // nó phải hiện ra ở bản xem trước để admin ánh xạ tay.
    expect(aliases.has('THUC-TAP-TN')).toBe(false);
  });

  it('phủ hết 12 nhãn bộ môn của sheet "3.1.Môn-BM"', () => {
    const aliases = new Set(DEPARTMENT_ALIASES.map((a) => a.alias));
    for (const raw of [
      'CNTT',
      'Cơ bản',
      'Ngôn ngữ',
      'TMĐT',
      'Kinh tế',
      'TKĐH',
      'UDPM',
      'DLNHKS',
      'Cơ Điện',
      'Kbeauty',
      'QHDN',
      'GDQP',
    ]) {
      expect(aliases.has(raw)).toBe(true);
    }
  });

  it('alias không trùng nhau', () => {
    const aliases = DEPARTMENT_ALIASES.map((a) => a.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it('10 quy tắc lớp→ngành, mỗi quy tắc trỏ tới ngành có thật', () => {
    expect(CLASS_MAJOR_RULES).toHaveLength(10);
    const majorCodes = new Set(MAJORS.map((m) => m.code));
    for (const rule of CLASS_MAJOR_RULES) {
      expect(rule.classPrefix).toMatch(/^[A-Z]{2}$/);
      expect(majorCodes.has(rule.majorCode)).toBe(true);
    }
  });

  it('mọi alias ngành trỏ tới một ngành có thật và không trùng nhau', () => {
    const majorCodes = new Set(MAJORS.map((m) => m.code));
    for (const entry of MAJOR_ALIASES) {
      expect(majorCodes.has(entry.majorCode)).toBe(true);
    }
    const aliases = MAJOR_ALIASES.map((a) => a.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it('không seed alias ngành trùng chính Major.code — committer đã tra mã thật', () => {
    const majorCodes = new Set(MAJORS.map((m) => m.code));
    for (const entry of MAJOR_ALIASES) {
      expect(majorCodes.has(entry.alias)).toBe(false);
    }
  });

  it('phủ 12 mã ngành suy được của file DSSV lớp môn, chừa 4 mã chưa rõ', () => {
    const aliases = new Set(MAJOR_ALIASES.map((a) => a.alias));
    for (const raw of [
      'LTAI01',
      'LTWE02',
      'LTWE04',
      'PTPM02',
      'UDPM01',
      'UDPM02',
      'TKDH02',
      'DIMA01',
      'MASA01',
      'LOGI01',
      'LOGI02',
      'LOGI03',
    ]) {
      expect(aliases.has(raw)).toBe(true);
    }
    // Chưa xác định được ngành đối ứng → phải nổi lên ở bản xem trước.
    for (const unknown of ['CHNA', 'CE', 'UI_DP', '6340302_01']) {
      expect(aliases.has(unknown)).toBe(false);
    }
  });

  it('mọi ngành thuộc về một bộ môn có thật', () => {
    const codes = new Set(DEPARTMENTS.map((d) => d.code));
    expect(MAJORS).toHaveLength(10);
    for (const major of MAJORS) {
      expect(codes.has(major.deptCode)).toBe(true);
    }
  });
});
