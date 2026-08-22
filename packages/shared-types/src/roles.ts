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
