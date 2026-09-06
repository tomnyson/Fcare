import type { RoleKey } from '@fcare/shared-types';

/** Cấu hình các danh mục Đào tạo — dùng chung cho sidebar, route và view CRUD. */
export const MASTER_DATA_TABS = [
  { key: 'departments', label: 'Bộ môn', singular: 'bộ môn', path: '/departments' },
  { key: 'majors', label: 'Ngành học', singular: 'ngành học', path: '/majors' },
  { key: 'subjects', label: 'Môn học', singular: 'môn học', path: '/subjects' },
  {
    key: 'class-sections',
    label: 'Lớp học phần',
    singular: 'lớp học phần',
    path: '/class-sections',
  },
  {
    key: 'department-aliases',
    label: 'Ánh xạ bộ môn',
    singular: 'ánh xạ bộ môn',
    path: '/department-aliases',
  },
  {
    key: 'class-major-rules',
    label: 'Quy tắc lớp → ngành',
    singular: 'quy tắc lớp → ngành',
    path: '/class-major-rules',
  },
] as const;

export type MasterDataTab = (typeof MASTER_DATA_TABS)[number];
export type MasterDataTabKey = MasterDataTab['key'];

/** Các role được phép mở khu vực danh mục Đào tạo. */
export const TRAINING_AREA_ROLES: readonly RoleKey[] = [
  'ADMIN',
  'HEAD_OF_DEPT',
  'TRAINING_OFFICER',
  'SA_HEAD',
];

export function canViewTrainingArea(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => TRAINING_AREA_ROLES.includes(role));
}

export function isMasterDataTabKey(value: string): value is MasterDataTabKey {
  return MASTER_DATA_TABS.some((tab) => tab.key === value);
}
