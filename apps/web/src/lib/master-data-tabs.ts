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
] as const;

export type MasterDataTab = (typeof MASTER_DATA_TABS)[number];
export type MasterDataTabKey = MasterDataTab['key'];

export function isMasterDataTabKey(value: string): value is MasterDataTabKey {
  return MASTER_DATA_TABS.some((tab) => tab.key === value);
}
