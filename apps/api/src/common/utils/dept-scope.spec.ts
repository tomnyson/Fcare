import type { AuthUser } from '../types/auth-user';
import { deptFilter, isDeptScoped } from './dept-scope';

function makeUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'staff-1',
    staffCode: 'gv.test',
    fullName: 'Test',
    roles: ['LECTURER'],
    departmentId: 'dept-se',
    consented: true,
    mustChangePassword: false,
    ...overrides,
  };
}

describe('deptFilter', () => {
  it('giảng viên bị giới hạn theo bộ môn của mình', () => {
    const user = makeUser({ roles: ['LECTURER'] });
    expect(isDeptScoped(user)).toBe(true);
    expect(deptFilter(user)).toEqual({ departmentId: 'dept-se' });
  });

  it('trưởng bộ môn bị giới hạn theo bộ môn của mình', () => {
    const user = makeUser({ roles: ['HEAD_OF_DEPT'] });
    expect(deptFilter(user)).toEqual({ departmentId: 'dept-se' });
  });

  it('cán bộ đào tạo, CTSV và admin thấy toàn trường', () => {
    for (const role of [
      'ADMIN',
      'TRAINING_OFFICER',
      'SA_OFFICER',
      'SA_HEAD',
    ] as const) {
      const user = makeUser({ roles: [role] });
      expect(isDeptScoped(user)).toBe(false);
      expect(deptFilter(user)).toEqual({});
    }
  });

  it('giảng viên không có bộ môn thì không thấy sinh viên nào', () => {
    const user = makeUser({ roles: ['LECTURER'], departmentId: null });
    expect(deptFilter(user)).toEqual({ departmentId: '__no_department__' });
  });
});
