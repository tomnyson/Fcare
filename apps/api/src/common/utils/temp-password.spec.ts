import { generateTempPassword } from './temp-password';

describe('generateTempPassword', () => {
  it('sinh mật khẩu 12 ký tự có cả chữ và số', () => {
    for (let index = 0; index < 20; index += 1) {
      const password = generateTempPassword();
      expect(password).toHaveLength(12);
      expect(password).toMatch(/[A-Za-z]/);
      expect(password).toMatch(/\d/);
    }
  });

  it('không sinh hai mật khẩu giống nhau liên tiếp', () => {
    expect(generateTempPassword()).not.toBe(generateTempPassword());
  });
});
