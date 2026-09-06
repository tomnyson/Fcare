'use client';

import { DataTable, Td } from '../ui/data-table';
import type { LecturerStatistics } from '../../lib/types';

const HEADERS = [
  'Mã NV', 'Họ tên', 'Bộ môn', 'Số lớp',
  'Lượt ĐK', 'Đạt', 'Trượt', 'Đang học', 'Cấm thi', 'Tỷ lệ đạt', 'Đã đánh giá',
];

export function LecturersTable({
  rows,
  isLoading,
}: {
  rows: LecturerStatistics[];
  isLoading: boolean;
}) {
  return (
    <DataTable
      headers={HEADERS}
      isLoading={isLoading}
      isEmpty={rows.length === 0}
      emptyMessage="Chưa có giảng viên nào có lớp trong phạm vi của bạn ở kỳ này."
    >
      {rows.map((row) => (
        <tr key={row.id}>
          <Td className="font-semibold">{row.staffCode}</Td>
          <Td>{row.fullName}</Td>
          <Td>{row.department?.name ?? '—'}</Td>
          <Td className="tabular-nums">{row.sectionCount}</Td>
          <Td className="tabular-nums">{row.total}</Td>
          <Td className="tabular-nums">{row.pass}</Td>
          <Td className="tabular-nums">{row.fail}</Td>
          <Td className="tabular-nums">{row.inProgress}</Td>
          <Td className="tabular-nums">{row.examBanned}</Td>
          <Td className="tabular-nums">
            {row.passRate === null ? '—' : `${row.passRate}%`}
          </Td>
          <Td className="tabular-nums">{row.evaluationCount}</Td>
        </tr>
      ))}
    </DataTable>
  );
}
