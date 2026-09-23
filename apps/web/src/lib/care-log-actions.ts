/** Chỉ ADMIN có `delete CareLog` (CASL `manage all`) — nút xoá theo đúng quyền API. */
export function canDeleteCareLog(roles: readonly string[] | undefined): boolean {
  return roles?.includes('ADMIN') ?? false;
}

/** Xoá một lượt đổi số lượt/SV chăm sóc và có thể bật lại banner điểm danh. */
export const CARE_LOG_DELETE_INVALIDATION_KEYS: ReadonlyArray<readonly [string]> = [
  ['care-logs'],
  ['statistics'],
  ['care-statistics'],
  ['attendance-alerts'],
];

export function careLogDeletedMessage(ownerCareReset: boolean): string {
  return ownerCareReset
    ? 'Đã xoá lượt chăm sóc. Cảnh báo điểm danh sẽ hiện lại "cần chăm sóc" cho giảng viên đứng lớp.'
    : 'Đã xoá lượt chăm sóc.';
}
