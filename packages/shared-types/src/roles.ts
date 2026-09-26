import { z } from 'zod';

/**
 * Vai trò hệ thống — map từ tài liệu "Quy định chung":
 * GV chỉ quản lý SV bộ môn mình; chỉ TBM + Đào tạo + CTSV được import/export Excel.
 */
export const ROLE_KEYS = [
  'ADMIN',
  'HEAD_OF_DEPT', // Trưởng bộ môn
  'LECTURER', // Giảng viên
  'TRAINING_OFFICER', // Cán bộ phòng Đào tạo
  'SA_OFFICER', // Cán bộ CTSV / DVSV
  'SA_HEAD', // Trưởng phòng CTSV
] as const;

export const roleKeySchema = z.enum(ROLE_KEYS);
export type RoleKey = z.infer<typeof roleKeySchema>;

/** Các role được phép import/export Excel (Quy định chung). */
export const EXCEL_IO_ROLES: readonly RoleKey[] = [
  'ADMIN',
  'HEAD_OF_DEPT',
  'TRAINING_OFFICER',
  'SA_OFFICER',
  'SA_HEAD',
];

export function canUseExcelIo(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => EXCEL_IO_ROLES.includes(role));
}

/** docs/plan-lert.md mục 4: CTSV chỉ xem và nhận cảnh báo từ mức này trở lên. */
export const SA_MIN_ALERT_LEVEL = 3;

const SA_ROLES: readonly RoleKey[] = ['SA_OFFICER', 'SA_HEAD'];

/**
 * Mức cảnh báo thấp nhất người dùng được thấy. Chỉ người thuần CTSV bị giới
 * hạn — kiêm thêm vai trò khác (quản trị, đào tạo, TBM, giảng viên) thì vai trò
 * đó vẫn cần thấy đủ mọi mức.
 */
export function minVisibleAlertLevel(roles: readonly RoleKey[]): number {
  const saOnly =
    roles.length > 0 && roles.every((role) => SA_ROLES.includes(role));
  return saOnly ? SA_MIN_ALERT_LEVEL : 1;
}
