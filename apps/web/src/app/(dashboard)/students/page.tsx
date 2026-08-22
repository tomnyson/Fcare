'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { DataTable, Td } from '../../../components/ui/data-table';
import { FormError, FormSuccess, Input, Select } from '../../../components/ui/form';
import { PageHeader } from '../../../components/ui/page-header';
import { ApiError, apiFetch } from '../../../lib/api';
import { useMe } from '../../../lib/hooks';
import {
  formatDate,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_TONES,
} from '../../../lib/labels';
import type { Major, Paginated, Student } from '../../../lib/types';

const PAGE_SIZE = 20;

// Gán ngành hàng loạt cần `update Student` — ADMIN, HEAD_OF_DEPT,
// TRAINING_OFFICER (xem apps/api/src/casl/ability.factory.ts).
const STUDENT_WRITE_ROLES = ['ADMIN', 'HEAD_OF_DEPT', 'TRAINING_OFFICER'];

function StudentsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canAssignMajor = me?.user.roles.some((role) => STUDENT_WRITE_ROLES.includes(role)) ?? false;

  // URL là nguồn sự thật của bộ lọc: gửi link cho đồng nghiệp là gửi đúng bộ lọc.
  const submittedSearch = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const missingMajor = params.get('missingMajor') === 'true';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const [search, setSearch] = useState(submittedSearch);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [majorId, setMajorId] = useState('');

  /** Ghi bộ lọc vào URL. Mọi thay đổi bộ lọc đều đưa về trang 1. */
  function setFilters(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries({ page: null, ...patch })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setSelected([]);
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['students', { search: submittedSearch, status, missingMajor, page }],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (submittedSearch) query.set('search', submittedSearch);
      if (status) query.set('status', status);
      if (missingMajor) query.set('missingMajor', 'true');
      return apiFetch<Paginated<Student>>(`/students?${query.toString()}`);
    },
  });

  const majors = useQuery({
    queryKey: ['majors'],
    queryFn: () => apiFetch<Major[]>('/majors'),
    enabled: missingMajor && canAssignMajor,
  });

  const assignMajor = useMutation({
    mutationFn: () =>
      apiFetch<{ updated: number }>('/students/bulk-assign-major', {
        method: 'PATCH',
        body: JSON.stringify({ studentIds: [...selected], majorId }),
      }),
    onSuccess: () => {
      setSelected([]);
      setMajorId('');
      void queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });

  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showSelectColumn = missingMajor && canAssignMajor;
  const allSelected = items.length > 0 && selected.length === items.length;

  function toggleOne(id: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    );
  }

  return (
    <>
      <PageHeader
        title="Sinh viên"
        description={
          missingMajor
            ? `${total} sinh viên chưa gán ngành — cần bổ sung để thống kê theo ngành chính xác.`
            : `${total} sinh viên trong phạm vi truy cập của bạn.`
        }
      />

      <form
        className="mb-4 flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ search: search.trim() || null });
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
          onChange={(event) => setFilters({ status: event.target.value || null })}
          className="max-w-44"
        >
          <option value="">Mọi trạng thái</option>
          {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            checked={missingMajor}
            onChange={(event) =>
              setFilters({ missingMajor: event.target.checked ? 'true' : null })
            }
            className="size-4 accent-fpt-orange"
          />
          Chưa gán ngành
        </label>
        <Button type="submit" variant="secondary">
          Tìm kiếm
        </Button>
      </form>

      {isError ? (
        <div className="mb-4">
          <FormError>
            {error instanceof ApiError ? error.message : 'Không tải được danh sách sinh viên.'}
          </FormError>
        </div>
      ) : null}

      {showSelectColumn ? (
        <section
          aria-label="Gán ngành hàng loạt"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-fpt-orange-50/40 px-4 py-3"
        >
          <p className="text-sm text-muted">
            Đã chọn <strong className="text-ink">{selected.length}</strong> sinh viên.
          </p>
          <Select
            aria-label="Ngành cần gán"
            value={majorId}
            onChange={(event) => setMajorId(event.target.value)}
            className="max-w-64"
          >
            <option value="">Chọn ngành…</option>
            {(majors.data ?? []).map((major) => (
              <option key={major.id} value={major.id}>
                {major.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            disabled={selected.length === 0 || !majorId || assignMajor.isPending}
            onClick={() => assignMajor.mutate()}
          >
            {assignMajor.isPending ? 'Đang gán…' : 'Gán ngành cho sinh viên đã chọn'}
          </Button>
          {assignMajor.isError ? (
            <FormError>
              {assignMajor.error instanceof ApiError
                ? assignMajor.error.message
                : 'Gán ngành thất bại.'}
            </FormError>
          ) : null}
          {assignMajor.isSuccess ? (
            <FormSuccess>
              Đã gán ngành cho {assignMajor.data.updated} sinh viên.
            </FormSuccess>
          ) : null}
        </section>
      ) : null}

      <DataTable
        headers={[
          ...(showSelectColumn ? ['Chọn'] : []),
          'MSSV',
          'Họ tên',
          'Lớp',
          'Ngành',
          'Bộ môn',
          'Ngày sinh',
          'Trạng thái',
          'Cảnh báo mở',
        ]}
        isEmpty={!isLoading && !isError && items.length === 0}
        emptyMessage="Không có sinh viên nào khớp bộ lọc."
      >
        {items.map((student) => (
          <tr key={student.id} className="transition-colors hover:bg-fpt-orange-50/40">
            {showSelectColumn ? (
              <Td>
                <input
                  type="checkbox"
                  aria-label={`Chọn sinh viên ${student.studentCode}`}
                  checked={selected.includes(student.id)}
                  onChange={(event) => toggleOne(student.id, event.target.checked)}
                  className="size-4 accent-fpt-orange"
                />
              </Td>
            ) : null}
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

      {showSelectColumn && items.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          className="mt-2"
          onClick={() => setSelected(allSelected ? [] : items.map((item) => item.id))}
        >
          {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả trên trang này'}
        </Button>
      ) : null}

      <nav aria-label="Phân trang" className="mt-4 flex items-center justify-between text-sm">
        <p className="text-muted">
          Trang {page}/{totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            type="button"
            disabled={page <= 1}
            onClick={() => setFilters({ page: String(page - 1) })}
          >
            ← Trước
          </Button>
          <Button
            variant="ghost"
            type="button"
            disabled={page >= totalPages}
            onClick={() => setFilters({ page: String(page + 1) })}
          >
            Sau →
          </Button>
        </div>
      </nav>
    </>
  );
}

export default function StudentsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Đang tải danh sách sinh viên…</p>}>
      <StudentsPageContent />
    </Suspense>
  );
}
