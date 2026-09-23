import { canUseExcelIo, type RoleKey } from '@fcare/shared-types';
import { canViewCareStatistics } from './care-statistics';
import { canViewTrainingArea } from './master-data-tabs';

interface RouteRule {
  prefix: string;
  allows: (roles: readonly RoleKey[]) => boolean;
}

/**
 * Trang nào cần vai nào — chỉ để web hiện trang "không có quyền" thay vì một
 * màn hình lỗi API. Quyền thật vẫn ở CASL phía API; các hàm dưới cũng chính là
 * hàm sidebar dùng để ẩn/hiện menu, nên menu và trang luôn khớp nhau.
 */
const ROUTE_RULES: readonly RouteRule[] = [
  { prefix: '/admin', allows: (roles) => roles.includes('ADMIN') },
  { prefix: '/import-export', allows: canUseExcelIo },
  { prefix: '/master-data', allows: canViewTrainingArea },
  { prefix: '/terms', allows: canViewTrainingArea },
  { prefix: '/statistics/care', allows: canViewCareStatistics },
  { prefix: '/statistics/care-staff', allows: canViewCareStatistics },
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function canAccessRoute(pathname: string, roles: readonly RoleKey[]): boolean {
  return ROUTE_RULES.every((rule) => !matches(pathname, rule.prefix) || rule.allows(roles));
}
