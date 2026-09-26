import type { AuthUser } from '../common/types/auth-user';
import { AbilityFactory } from './ability.factory';

function makeUser(roles: AuthUser['roles']): AuthUser {
  return {
    id: 'staff-1',
    staffCode: 'test',
    fullName: 'Test',
    roles,
    departmentId: 'dept-se',
    consented: true,
    mustChangePassword: false,
  };
}

describe('AbilityFactory — ma trận phân quyền theo Quy định chung', () => {
  const factory = new AbilityFactory();

  it('giảng viên KHÔNG được import/export Excel', () => {
    const ability = factory.createForUser(makeUser(['LECTURER']));
    expect(ability.can('import', 'Excel')).toBe(false);
    expect(ability.can('export', 'Excel')).toBe(false);
  });

  it('trưởng bộ môn, cán bộ đào tạo và CTSV được import/export Excel', () => {
    for (const role of [
      'HEAD_OF_DEPT',
      'TRAINING_OFFICER',
      'SA_OFFICER',
      'SA_HEAD',
    ] as const) {
      const ability = factory.createForUser(makeUser([role]));
      expect(ability.can('import', 'Excel')).toBe(true);
      expect(ability.can('export', 'Excel')).toBe(true);
    }
  });

  it('giảng viên được đánh giá/chăm sóc/cảnh báo nhưng không quản lý danh mục', () => {
    const ability = factory.createForUser(makeUser(['LECTURER']));
    expect(ability.can('create', 'Evaluation')).toBe(true);
    expect(ability.can('create', 'CareLog')).toBe(true);
    expect(ability.can('create', 'Alert')).toBe(true);
    expect(ability.can('update', 'MasterData')).toBe(false);
    // Được gọi chốt; service chặn tiếp nếu không đứng lớp của cảnh báo.
    expect(ability.can('resolve', 'Alert')).toBe(true);
    expect(ability.can('acknowledge', 'Alert')).toBe(false);
  });

  it('chốt cảnh báo: chỉ ADMIN, TBM, GV — CTSV và Đào tạo chỉ tiếp nhận', () => {
    for (const role of ['ADMIN', 'HEAD_OF_DEPT', 'LECTURER'] as const) {
      expect(
        factory.createForUser(makeUser([role])).can('resolve', 'Alert'),
      ).toBe(true);
    }
    for (const role of ['TRAINING_OFFICER', 'SA_OFFICER', 'SA_HEAD'] as const) {
      expect(
        factory.createForUser(makeUser([role])).can('resolve', 'Alert'),
      ).toBe(false);
    }
    for (const role of [
      'ADMIN',
      'HEAD_OF_DEPT',
      'TRAINING_OFFICER',
      'SA_HEAD',
    ] as const) {
      expect(
        factory.createForUser(makeUser([role])).can('acknowledge', 'Alert'),
      ).toBe(true);
    }
  });

  it('chỉ admin được quản trị người dùng', () => {
    expect(
      factory.createForUser(makeUser(['ADMIN'])).can('update', 'Staff'),
    ).toBe(true);
    for (const role of [
      'HEAD_OF_DEPT',
      'LECTURER',
      'TRAINING_OFFICER',
      'SA_HEAD',
    ] as const) {
      expect(
        factory.createForUser(makeUser([role])).can('update', 'Staff'),
      ).toBe(false);
    }
  });

  it('chỉ admin được xem/cấu hình giám sát lỗi hệ thống', () => {
    for (const role of [
      'LECTURER',
      'HEAD_OF_DEPT',
      'TRAINING_OFFICER',
      'SA_OFFICER',
      'SA_HEAD',
    ] as const) {
      expect(
        factory.createForUser(makeUser([role])).can('manage', 'Monitoring'),
      ).toBe(false);
      expect(
        factory.createForUser(makeUser([role])).can('read', 'Monitoring'),
      ).toBe(false);
    }
    expect(
      factory.createForUser(makeUser(['ADMIN'])).can('manage', 'Monitoring'),
    ).toBe(true);
  });

  it('chỉ admin được xoá lượt chăm sóc', () => {
    expect(
      factory.createForUser(makeUser(['ADMIN'])).can('delete', 'CareLog'),
    ).toBe(true);
    for (const role of [
      'LECTURER',
      'HEAD_OF_DEPT',
      'TRAINING_OFFICER',
      'SA_OFFICER',
      'SA_HEAD',
    ] as const) {
      expect(
        factory.createForUser(makeUser([role])).can('delete', 'CareLog'),
      ).toBe(false);
    }
  });

  it('nhiều vai trò được cộng gộp quyền', () => {
    const ability = factory.createForUser(
      makeUser(['LECTURER', 'HEAD_OF_DEPT']),
    );
    expect(ability.can('import', 'Excel')).toBe(true);
    expect(ability.can('resolve', 'Alert')).toBe(true);
  });

  it('LECTURER không có quyền import — chặn cả module imports mới', () => {
    const ability = factory.createForUser(makeUser(['LECTURER']));
    expect(ability.can('import', 'Excel')).toBe(false);
    expect(ability.can('export', 'Excel')).toBe(false);
  });

  it('HEAD_OF_DEPT, TRAINING_OFFICER, SA_OFFICER, SA_HEAD, ADMIN đều import được', () => {
    for (const role of [
      'HEAD_OF_DEPT',
      'TRAINING_OFFICER',
      'SA_OFFICER',
      'SA_HEAD',
      'ADMIN',
    ] as const) {
      const ability = factory.createForUser(makeUser([role]));
      expect(ability.can('import', 'Excel')).toBe(true);
    }
  });
});
