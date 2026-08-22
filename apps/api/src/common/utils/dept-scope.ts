import type { RoleKey } from '@fcare/shared-types';
import type { AuthUser } from '../types/auth-user';

/** Các vai trò được xem dữ liệu sinh viên toàn trường. */
const UNSCOPED_ROLES: readonly RoleKey[] = [
  'ADMIN',
  'TRAINING_OFFICER',
  'SA_OFFICER',
  'SA_HEAD',
];

/** Giảng viên và trưởng bộ môn chỉ được thao tác trên sinh viên thuộc bộ môn mình. */
export function isDeptScoped(user: AuthUser): boolean {
  return !user.roles.some((role) => UNSCOPED_ROLES.includes(role));
}

/**
 * Điều kiện Prisma giới hạn theo bộ môn. Người dùng bị scope mà không có
 * bộ môn thì không thấy gì (filter theo giá trị không tồn tại).
 */
export function deptFilter(user: AuthUser): { departmentId?: string } {
  if (!isDeptScoped(user)) {
    return {};
  }
  return { departmentId: user.departmentId ?? '__no_department__' };
}
