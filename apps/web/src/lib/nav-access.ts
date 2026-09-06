import { canUseExcelIo, type RoleKey } from '@fcare/shared-types';

/**
 * Ai được nhìn thấy mục Import / Export trên sidebar.
 *
 * Đây là quyết định hiển thị, KHÔNG phải phân quyền: quyền thật vẫn nằm ở CASL
 * phía API (`can(['import','export'], 'Excel')`). CTSV tuy vẫn được API cho
 * phép nhưng không dùng luồng Excel trong thực tế nên bỏ mục này khỏi menu cho
 * đỡ rối — cắt ở đây không cắt ở CASL để không đụng RULE 3.
 */
const EXCEL_MENU_HIDDEN_ROLES: readonly RoleKey[] = ['SA_OFFICER', 'SA_HEAD'];

export function canSeeExcelMenu(roles: readonly RoleKey[]): boolean {
  if (!canUseExcelIo(roles)) return false;
  // Ai kiêm thêm vai khác (ví dụ ADMIN) thì vẫn thấy — chỉ ẩn với người thuần CTSV.
  return roles.some((role) => canUseExcelIo([role]) && !EXCEL_MENU_HIDDEN_ROLES.includes(role));
}
