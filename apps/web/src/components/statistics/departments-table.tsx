'use client';

import { DataTable, Td } from '../ui/data-table';
import { STUDENT_STATUS_LABELS } from '../../lib/labels';
import type { DepartmentStatistics, StudentStatus } from '../../lib/types';

// Cùng năm trạng thái sinh viên với `STUDENT_STATUS_LABELS` — cố định thứ tự
// cột thay vì dựng cột theo dữ liệu trả về, để bảng không "nhảy" cột giữa các lần tải.
const STATUS_ORDER: StudentStatus[] = ['STUDYING', 'RESERVED', 'WARNED', 'DROPPED_OUT', 'GRADUATED'];

const HEADERS = [
  'Mã bộ môn',
  'Tên bộ môn',
  'Tổng SV',
  'Tổng GV/NV',
  'Cảnh báo mở',
  ...STATUS_ORDER.map((status) => STUDENT_STATUS_LABELS[status]),
];

/**
 * Bảng bộ môn dạng danh sách — `/dashboard` trình bày phần này bằng thẻ card,
 * nhưng ở đây dùng `DataTable` chung để nhất quán với ba tab còn lại và dễ
 * đọc/so sánh nhiều bộ môn cùng lúc.
 */
export function DepartmentsTable({
  rows,
  isLoading,
}: {
  rows: DepartmentStatistics[];
  isLoading: boolean;
}) {
  return (
    <DataTable
      headers={HEADERS}
      isLoading={isLoading}
      isEmpty={rows.length === 0}
      emptyMessage="Chưa có bộ môn nào trong phạm vi của bạn ở kỳ này."
    >
      {rows.map((row) => {
        const statusCounts = new Map(row.studentsByStatus.map((group) => [group.status, group.count]));
        return (
          <tr key={row.id}>
            <Td className="font-semibold">{row.code}</Td>
            <Td>{row.name}</Td>
            <Td className="tabular-nums">{row.totalStudents}</Td>
            <Td className="tabular-nums">{row.totalStaff ?? '—'}</Td>
            <Td className={`tabular-nums ${row.openAlerts > 0 ? 'font-semibold text-danger' : ''}`}>
              {row.openAlerts}
            </Td>
            {STATUS_ORDER.map((status) => (
              <Td key={status} className="tabular-nums">
                {statusCounts.get(status) ?? 0}
              </Td>
            ))}
          </tr>
        );
      })}
    </DataTable>
  );
}
