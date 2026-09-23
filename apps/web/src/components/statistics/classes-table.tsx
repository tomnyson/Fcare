'use client';

import Link from 'next/link';
import { DataTable, Td } from '../ui/data-table';
import { usePagedList } from '../../lib/use-paged-list';
import type { ClassStatistics } from '../../lib/types';

const HEADERS = [
  'Lớp học phần', 'Môn', 'Giảng viên', 'Sĩ số', 'Đạt', 'Trượt', 'Cấm thi', 'Tỷ lệ đạt',
];

/** Bảng "Kết quả theo lớp học phần" — tab con `/statistics/classes` của menu Thống kê. */
export function ClassesTable({
  rows,
  isLoading,
}: {
  rows: ClassStatistics[];
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
      emptyMessage="Chưa có lớp học phần nào trong phạm vi của bạn ở kỳ này."
      pagination={{
        page: paged.page,
        totalPages: paged.totalPages,
        total: paged.total,
        limit: paged.pageSize,
        isLoading,
        onPageChange: paged.setPage,
        onLimitChange: paged.setPageSize,
        label: 'Phân trang lớp học phần',
      }}
    >
      {paged.pageItems.map((section) => (
        <tr key={section.id} className="transition-colors hover:bg-fpt-orange-50/40">
          <Td className="font-semibold text-ink">
            {/* Bấm mã lớp để xem thẳng danh sách sinh viên của lớp đó. */}
            <Link
              href={`/students?sectionId=${section.id}`}
              className="rounded-sm decoration-fpt-orange decoration-2 underline-offset-4 transition-colors hover:text-fpt-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue"
            >
              {section.code}
            </Link>
          </Td>
          <Td>{section.subject.name}</Td>
          <Td>{section.lecturer?.fullName ?? '—'}</Td>
          <Td className="tabular-nums">{section.total}</Td>
          <Td className="font-semibold text-success tabular-nums">{section.pass}</Td>
          <Td className="font-semibold text-danger tabular-nums">{section.fail}</Td>
          <Td className="tabular-nums">{section.examBanned}</Td>
          <Td className="font-semibold tabular-nums">
            {section.passRate === null ? '—' : `${section.passRate}%`}
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}
