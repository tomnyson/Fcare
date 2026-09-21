import { describe, expect, it } from 'vitest';
import { canEvaluateSection, seesAllSections } from './evaluation-access';
import type { RoleKey } from '@fcare/shared-types';
import type { AuthUser } from './types';

function user(roles: RoleKey[], id = 'u1'): AuthUser {
  return {
    id,
    staffCode: 'S1',
    fullName: 'Người dùng',
    roles,
    departmentId: null,
    consented: true,
    mustChangePassword: false,
  };
}

describe('quyền nhận xét một lớp học phần', () => {
  it('giảng viên chỉ nhận xét lớp mình đứng lớp', () => {
    expect(canEvaluateSection(user(['LECTURER']), { lecturerId: 'u1' })).toBe(true);
    expect(canEvaluateSection(user(['LECTURER']), { lecturerId: 'u2' })).toBe(false);
    expect(canEvaluateSection(user(['LECTURER']), { lecturerId: null })).toBe(false);
  });

  it('TBM và ADMIN nhận xét mọi lớp của sinh viên', () => {
    expect(canEvaluateSection(user(['HEAD_OF_DEPT']), { lecturerId: 'u2' })).toBe(true);
    expect(canEvaluateSection(user(['ADMIN']), { lecturerId: null })).toBe(true);
    expect(seesAllSections(user(['HEAD_OF_DEPT']))).toBe(true);
    expect(seesAllSections(user(['LECTURER']))).toBe(false);
  });

  it('vai không được nhận xét thì không được, kể cả khi trùng id', () => {
    expect(canEvaluateSection(user(['SA_OFFICER']), { lecturerId: 'u1' })).toBe(false);
    expect(canEvaluateSection(user(['TRAINING_OFFICER']), { lecturerId: 'u2' })).toBe(false);
  });
});
