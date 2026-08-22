'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable, Td } from '../../../components/ui/data-table';
import { Input, Select } from '../../../components/ui/form';
import { PageHeader } from '../../../components/ui/page-header';
import { apiFetch } from '../../../lib/api';
import {
  formatDate,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_TONES,
} from '../../../lib/labels';
import type { Paginated, Student } from '../../../lib/types';

const PAGE_SIZE = 20;

export default function StudentsPage() {
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['students', { search: submittedSearch, status, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (submittedSearch) params.set('search', submittedSearch);
      if (status) params.set('status', status);
      return apiFetch<Paginated<Student>>(`/students?${params.toString()}`);
    },
  });

  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Sinh viên"
        description={`${total} sinh viên trong phạm vi truy cập của bạn.`}
      />

      <form
        className="mb-4 flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSubmittedSearch(search.trim());
        }}
      >
        <Input
          aria-label="Tìm theo MSSV hoặc họ tên"
          placeholder="Tìm theo MSSV hoặc họ tên…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        <Select
          aria-label="Lọc theo trạng thái"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="max-w-44"
        >
          <option value="">Mọi trạng thái</option>
          {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Tìm kiếm
        </Button>
      </form>

      <DataTable
        headers={['MSSV', 'Họ tên', 'Lớp', 'Ngành', 'Bộ môn', 'Ngày sinh', 'Trạng thái', 'Cảnh báo mở']}
        isEmpty={!isLoading && (data?.items.length ?? 0) === 0}
        emptyMessage="Không có sinh viên nào khớp bộ lọc."
      >
        {(data?.items ?? []).map((student) => (
          <tr key={student.id} className="transition-colors hover:bg-fpt-orange-50/40">
            <Td>
              <Link
                href={`/students/${student.id}`}
                className="font-semibold text-fpt-blue hover:underline"
              >
                {student.studentCode}
              </Link>
            </Td>
            <Td className="font-medium text-ink">{student.fullName}</Td>
            <Td>{student.classCode}</Td>
            <Td>{student.major?.name ?? '—'}</Td>
            <Td>{student.department?.code ?? '—'}</Td>
            <Td>{formatDate(student.dateOfBirth)}</Td>
            <Td>
              <Badge tone={STUDENT_STATUS_TONES[student.status]}>
                {STUDENT_STATUS_LABELS[student.status]}
              </Badge>
            </Td>
            <Td>
              {(student._count?.alerts ?? 0) > 0 ? (
                <Badge tone="danger">{student._count?.alerts}</Badge>
              ) : (
                <span className="text-muted">0</span>
              )}
            </Td>
          </tr>
        ))}
      </DataTable>

      <nav aria-label="Phân trang" className="mt-4 flex items-center justify-between text-sm">
        <p className="text-muted">
          Trang {page}/{totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            ← Trước
          </Button>
          <Button
            variant="ghost"
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Sau →
          </Button>
        </div>
      </nav>
    </>
  );
}
