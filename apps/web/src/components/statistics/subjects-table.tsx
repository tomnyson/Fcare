'use client';

import { DataTable, Td } from '../ui/data-table';
import { usePagedList } from '../../lib/use-paged-list';
import type { SubjectStatistics } from '../../lib/types';

const HEADERS = [
  'Mã môn', 'Tên môn', 'TC', 'Bộ môn', 'Số lớp',
  'Lượt ĐK', 'Đạt', 'Trượt', 'Đang học', 'Cấm thi', 'Tỷ lệ đạt', 'Điểm TB',
];

export function SubjectsTable({
  rows,
  isLoading,
}: {
  rows: SubjectStatistics[];
  isLoading: boolean;
}) {
  const paged = usePagedList(rows, { pageSize: 10 });

  return (
    <DataTable
      fitViewport
      headers={HEADERS}
      isLoading={isLoading}
      skeletonRows={paged.pageSize}
      isEmpty={rows.length === 0}
      emptyMessage="Chưa có môn học nào trong phạm vi của bạn ở kỳ này."
      pagination={{
        page: paged.page,
        totalPages: paged.totalPages,
        total: paged.total,
        limit: paged.pageSize,
        isLoading,
        onPageChange: paged.setPage,
        onLimitChange: paged.setPageSize,
        label: 'Phân trang môn học',
      }}
    >
      {paged.pageItems.map((row) => (
        <tr key={row.id}>
          <Td className="font-semibold">{row.code}</Td>
          <Td>{row.name}</Td>
          {/* Số liệu dùng chữ số đều bề ngang để các cột thẳng hàng khi đọc dọc. */}
          <Td className="tabular-nums">{row.credits}</Td>
          <Td>{row.department.name}</Td>
          <Td className="tabular-nums">{row.sectionCount}</Td>
          <Td className="tabular-nums">{row.total}</Td>
          <Td className="tabular-nums">{row.pass}</Td>
          <Td className="tabular-nums">{row.fail}</Td>
          <Td className="tabular-nums">{row.inProgress}</Td>
          <Td className="tabular-nums">{row.examBanned}</Td>
          <Td className="tabular-nums">
            {row.passRate === null ? '—' : `${row.passRate}%`}
          </Td>
          <Td className="tabular-nums">{row.avgScore ?? '—'}</Td>
        </tr>
      ))}
    </DataTable>
  );
}
