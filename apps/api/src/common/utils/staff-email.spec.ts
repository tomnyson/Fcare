import { isAllowedStaffEmail } from './staff-email';

describe('isAllowedStaffEmail', () => {
  it('chỉ chấp nhận miền FPT/FE, không phân biệt hoa thường', () => {
    expect(isAllowedStaffEmail('an.nv@fpt.edu.vn')).toBe(true);
    expect(isAllowedStaffEmail('An.NV@FE.EDU.VN')).toBe(true);
    expect(isAllowedStaffEmail('an@gmail.com')).toBe(false);
    expect(isAllowedStaffEmail('an@fpt.edu.vn.evil.com')).toBe(false);
    expect(isAllowedStaffEmail('')).toBe(false);
  });
});
