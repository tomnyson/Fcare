'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CatalogSearch, type useCatalogPaging } from './catalog-paging';
import { DataTable, Td } from '../ui/data-table';
import type { ClassSection, Subject } from '../../lib/types';

/** Trạng thái query đủ để vẽ bảng — không cần cả UseQueryResult. */
interface CatalogQueryState {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

interface CatalogTableProps<T> {
  query: CatalogQueryState;
  paging: ReturnType<typeof useCatalogPaging<T>>;
  actionHeader: string[];
  rowActions: (entity: T) => ReactNode;
  errorBanner: (query: CatalogQueryState) => ReactNode;
}

/** Bảng môn học trong tab Đào tạo: tìm nhanh + lật trang 20 dòng phía web. */
export function SubjectsTable({
  query,
  paging,
  actionHeader,
  rowActions,
  errorBanner,
}: CatalogTableProps<Subject>) {
  return (
    <>
      {errorBanner(query)}
      <CatalogSearch
        id="subject-search"
        label="Tìm môn học"
        placeholder="Mã hoặc tên môn…"
        value={paging.search}
        onChange={paging.setSearch}
        matched={paging.total}
        isLoading={query.isLoading}
      />
      <DataTable
        headers={['Mã môn', 'Tên môn học', 'Tín chỉ', 'Bộ môn', 'Lớp học phần', ...actionHeader]}
        isLoading={query.isLoading}
        skeletonRows={5}
        isEmpty={!query.isLoading && !query.isError && paging.total === 0}
        emptyMessage={
          paging.search.trim()
            ? 'Không có môn học nào khớp từ khoá.'
            : 'Chưa có môn học nào — bấm “+ Thêm môn học” để tạo danh mục đầu tiên.'
        }
        pagination={{
          page: paging.page,
          totalPages: paging.totalPages,
          total: paging.total,
          limit: paging.pageSize,
          isLoading: query.isLoading,
          onPageChange: paging.setPage,
          onLimitChange: paging.setPageSize,
          label: 'Phân trang môn học',
        }}
      >
        {paging.pageItems.map((subject) => (
          <tr key={subject.id} className="transition-colors hover:bg-fpt-orange-50/40">
            <Td className="font-semibold">{subject.code}</Td>
            <Td>{subject.name}</Td>
            <Td className="tabular-nums">{subject.credits}</Td>
            <Td>{subject.department?.name ?? '—'}</Td>
            <Td className="tabular-nums">{subject._count?.classSections ?? 0}</Td>
            {rowActions(subject)}
          </tr>
        ))}
      </DataTable>
    </>
  );
}

/** Bảng lớp học phần trong tab Đào tạo — cùng cơ chế tìm + lật trang. */
export function ClassSectionsTable({
  query,
  paging,
  actionHeader,
  rowActions,
  errorBanner,
}: CatalogTableProps<ClassSection>) {
  return (
    <>
      {errorBanner(query)}
      <CatalogSearch
        id="section-search"
        label="Tìm lớp học phần"
        placeholder="Mã lớp, môn, giảng viên hoặc học kỳ…"
        value={paging.search}
        onChange={paging.setSearch}
        matched={paging.total}
        isLoading={query.isLoading}
      />
      <DataTable
        headers={['Mã lớp', 'Môn', 'Giảng viên', 'Học kỳ', 'Sĩ số', 'Bảng điểm', ...actionHeader]}
        isLoading={query.isLoading}
        skeletonRows={6}
        isEmpty={!query.isLoading && !query.isError && paging.total === 0}
        emptyMessage={
          paging.search.trim()
            ? 'Không có lớp học phần nào khớp từ khoá.'
            : 'Chưa có lớp học phần nào — bấm “+ Thêm lớp học phần” để tạo.'
        }
        pagination={{
          page: paging.page,
          totalPages: paging.totalPages,
          total: paging.total,
          limit: paging.pageSize,
          isLoading: query.isLoading,
          onPageChange: paging.setPage,
          onLimitChange: paging.setPageSize,
          label: 'Phân trang lớp học phần',
        }}
      >
        {paging.pageItems.map((section) => (
          <tr key={section.id} className="transition-colors hover:bg-fpt-orange-50/40">
            <Td className="font-semibold">{section.code}</Td>
            <Td>{section.subject?.name ?? '—'}</Td>
            <Td>{section.lecturer?.fullName ?? '—'}</Td>
            <Td>{section.term}</Td>
            <Td className="tabular-nums">{section._count?.enrollments ?? 0}</Td>
            <Td>
              <Link
                href={`/class-sections/${section.id}/grades`}
                className="rounded-md px-3 py-2 text-sm font-semibold text-fpt-blue hover:underline"
              >
                Bảng điểm
              </Link>
            </Td>
            {rowActions(section)}
          </tr>
        ))}
      </DataTable>
    </>
  );
}
