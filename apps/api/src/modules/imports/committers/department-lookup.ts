import { aliasKey } from '../alias-match';
import type { PrismaTx } from '../types';

// Committer bộ môn vẫn dùng chung khoá tra với importer khác.
export { aliasKey };

/**
 * Bảng tra "mã bộ môn trong file" → id bộ môn, nạp một lần cho cả lô (tránh
 * N+1). Gồm cả `DepartmentAlias` lẫn `Department.code`: file nhà trường nhiều
 * khi ghi thẳng mã thật, bắt admin khai lại ánh xạ trùng chính nó là vô ích.
 * Alias thắng khi trùng khoá — admin đã gán tay thì đó là ý muốn tường minh.
 */
export async function loadDepartmentByAlias(
  tx: PrismaTx,
): Promise<Map<string, string>> {
  const [aliases, departments] = await Promise.all([
    tx.departmentAlias.findMany({
      select: { alias: true, departmentId: true },
    }),
    tx.department.findMany({ select: { id: true, code: true } }),
  ]);
  return new Map<string, string>([
    ...departments.map(
      (entry) => [aliasKey(entry.code), entry.id] as [string, string],
    ),
    ...aliases.map(
      (entry) =>
        [aliasKey(entry.alias), entry.departmentId] as [string, string],
    ),
  ]);
}
