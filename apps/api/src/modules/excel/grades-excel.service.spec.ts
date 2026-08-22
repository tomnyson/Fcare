import { EnrollmentResult } from '@prisma/client';
import { parseResult } from './grades-excel.service';

describe('parseResult', () => {
  it('Đạt → PASS', () => {
    expect(parseResult('Đạt')).toBe(EnrollmentResult.PASS);
  });

  it('Trượt → FAIL', () => {
    expect(parseResult('Trượt')).toBe(EnrollmentResult.FAIL);
  });

  it('Không đạt → FAIL (nhãn mới có trong file thật)', () => {
    expect(parseResult('Không đạt')).toBe(EnrollmentResult.FAIL);
  });

  it('rỗng → undefined', () => {
    expect(parseResult('')).toBeUndefined();
  });

  it('item 6: "Không  đạt" (hai dấu cách) → FAIL — nguồn chuẩn hoá dùng chung với gradebook.parser', () => {
    expect(parseResult('Không  đạt')).toBe(EnrollmentResult.FAIL);
  });
});
