import type { RoleKey } from '@fcare/shared-types';
import { describe, expect, it } from 'vitest';
import { canAccessRoute } from './route-access';

const can = (path: string, ...roles: RoleKey[]) => canAccessRoute(path, roles);

describe('canAccessRoute — trang nào vai nào được mở', () => {
  it('trang chung: mọi vai đã đăng nhập đều mở được', () => {
    for (const path of [
      '/dashboard',
      '/students',
      '/students/abc',
      '/alerts',
      '/class-sections/x/grades',
    ]) {
      expect(can(path, 'LECTURER')).toBe(true);
    }
  });

  it('/admin/* chỉ ADMIN', () => {
    expect(can('/admin/users', 'ADMIN')).toBe(true);
    expect(can('/admin/mail', 'HEAD_OF_DEPT', 'TRAINING_OFFICER')).toBe(false);
    expect(can('/admin/backups', 'LECTURER')).toBe(false);
  });

  it('Import / Export theo quyền Excel của API — giảng viên không bao giờ được', () => {
    expect(can('/import-export', 'LECTURER')).toBe(false);
    expect(can('/import-export', 'HEAD_OF_DEPT')).toBe(true);
    expect(can('/import-export', 'SA_OFFICER')).toBe(true);
  });

  it('danh mục Đào tạo theo vai khu vực Đào tạo', () => {
    expect(can('/master-data/subjects', 'LECTURER')).toBe(false);
    expect(can('/master-data/subjects', 'SA_OFFICER')).toBe(false);
    expect(can('/master-data/subjects', 'SA_HEAD')).toBe(true);
    expect(can('/terms', 'LECTURER')).toBe(false);
  });

  it('thống kê chăm sóc chỉ ADMIN/CBĐT/TBM; các tab thống kê khác ai cũng xem', () => {
    expect(can('/statistics/care', 'LECTURER')).toBe(false);
    expect(can('/statistics/care', 'HEAD_OF_DEPT')).toBe(true);
    expect(can('/statistics/classes', 'LECTURER')).toBe(true);
  });

  it('không nhầm tiền tố: /administrator không phải /admin', () => {
    expect(can('/administrator', 'LECTURER')).toBe(true);
  });
});
