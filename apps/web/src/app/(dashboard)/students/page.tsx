'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { DataTable, Td } from '../../../components/ui/data-table';
import {
  FilterBar,
  FilterChip,
  FilterField,
  FilterFooter,
  FilterGrid,
  FilterSearchInput,
  FilterSearchRow,
} from '../../../components/ui/filter-bar';
import { FormError, FormSuccess, Select } from '../../../components/ui/form';
import { PageHeader } from '../../../components/ui/page-header';
import { ApiError, apiFetch } from '../../../lib/api';
import { useMe } from '../../../lib/hooks';
import { formatDate, STUDENT_STATUS_LABELS, STUDENT_STATUS_TONES } from '../../../lib/labels';
import {
  buildStudentListQuery,
  clearFiltersPatch,
  parseStudentFilters,
} from '../../../lib/student-filters';
import type { Paginated, Student, StudentFilterOptions } from '../../../lib/types';

const PAGE_SIZE = 20;

// Danh mục kỳ/lớp/ngành/giảng viên đổi theo học kỳ chứ không theo phút — giữ
// cache 5 phút để đổi bộ lọc liên tục không gọi lại API.
const FILTER_OPTIONS_STALE_MS = 5 * 60_000;

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
  const filters = parseStudentFilters(params);
  const submittedSearch = filters.search;
  const missingMajor = filters.missingMajor;
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const [search, setSearch] = useState(submittedSearch);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [majorId, setMajorId] = useState('');

  // Back/forward đổi query param `search` trên URL mà không đi qua ô input —
  // đồng bộ lại state để ô tìm kiếm không giữ giá trị cũ.
  useEffect(() => {
    setSearch(submittedSearch);
  }, [submittedSearch]);

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

  const listQuery = buildStudentListQuery(filters, page, PAGE_SIZE).toString();
  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['students', listQuery],
    queryFn: () => apiFetch<Paginated<Student>>(`/students?${listQuery}`),
    // Đổi trang/đổi bộ lọc giữ nguyên bảng cũ (chỉ mờ đi) thay vì xóa trắng
    // rồi vẽ lại — đây là nguồn giật rõ nhất của trang danh sách.
    placeholderData: keepPreviousData,
  });

  // Nguồn option cho 4 bộ lọc, đã giới hạn theo bộ môn phía API. Dữ liệu master
  // gần như tĩnh nên giữ cache lâu thay vì gọi lại mỗi lần đổi bộ lọc.
  const options = useQuery({
    queryKey: ['student-filter-options'],
    queryFn: () => apiFetch<StudentFilterOptions>('/students/filter-options'),
    staleTime: FILTER_OPTIONS_STALE_MS,
  });
  // Dùng chung cho ô lọc ngành và ô gán ngành hàng loạt: danh sách này đã theo
  // đúng bộ môn người dùng nên không còn chọn nhầm ngành bộ môn khác.
  const majorOptions = options.data?.majors ?? [];
  // Lớp học phần thường rất nhiều: khi đã chọn học kỳ thì chỉ hiện lớp của kỳ
  // đó, nhưng luôn giữ lại lớp đang được chọn để bộ lọc không tự mất giá trị.
  const sectionOptions = (options.data?.sections ?? []).filter(
    (section) => !filters.term || section.term === filters.term || section.id === filters.sectionId,
  );

  const assignMajor = useMutation({
    mutationFn: async () => {
      const studentIds = [...selected];
      const result = await apiFetch<{ updated: number }>('/students/bulk-assign-major', {
        method: 'PATCH',
        body: JSON.stringify({ studentIds, majorId }),
      });
      return { updated: result.updated, requested: studentIds.length };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      // API không liệt kê id trượt — nếu thiếu, giữ nguyên `selected` để
      // người dùng còn thấy mình vừa chọn ai (thường lệch bộ môn).
      if (result.updated < result.requested) return;
      setSelected([]);
      setMajorId('');
    },
  });

  // Chip tóm tắt bộ lọc đang bật: nhìn một dòng là biết đang xem tập nào, và
  // gỡ từng tiêu chí thay vì xóa sạch rồi chọn lại từ đầu.
  const chips: Array<{ key: string; label: string; value: string }> = [];
  if (filters.search.trim())
    chips.push({ key: 'search', label: 'Từ khóa', value: filters.search.trim() });
  if (filters.term) chips.push({ key: 'term', label: 'Học kỳ', value: filters.term });
  if (filters.classCode) chips.push({ key: 'classCode', label: 'Lớp', value: filters.classCode });
  if (filters.majorId)
    chips.push({
      key: 'majorId',
      label: 'Ngành',
      value: majorOptions.find((major) => major.id === filters.majorId)?.name ?? 'đã chọn',
    });
  if (filters.lecturerId)
    chips.push({
      key: 'lecturerId',
      label: 'Giảng viên',
      value:
        options.data?.lecturers.find((lecturer) => lecturer.id === filters.lecturerId)?.fullName ??
        'đã chọn',
    });
  if (filters.sectionId)
    chips.push({
      key: 'sectionId',
      label: 'Lớp học phần',
      value:
        options.data?.sections.find((section) => section.id === filters.sectionId)?.code ??
        'đã chọn',
    });
  if (filters.status)
    chips.push({
      key: 'status',
      label: 'Trạng thái',
      value:
        (STUDENT_STATUS_LABELS as Record<string, string>)[filters.status] ??
        filters.status,
    });
  if (missingMajor)
    chips.push({ key: 'missingMajor', label: 'Lọc riêng', value: 'Chưa gán ngành' });

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
          // Lần tải đầu chưa biết tổng số — nói "Đang tải" thay vì hiện "0 sinh viên"
          // rồi nhảy sang số thật.
          isLoading
            ? 'Đang tải danh sách sinh viên…'
            : missingMajor
              ? `${total} sinh viên chưa gán ngành — cần bổ sung để thống kê theo ngành chính xác.`
              : `${total} sinh viên trong phạm vi truy cập của bạn.`
        }
      />

      <FilterBar
        label="Bộ lọc sinh viên"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ search: search.trim() || null });
        }}
      >
        <FilterSearchRow>
          <FilterSearchInput
            id="student-search"
            aria-label="Tìm sinh viên"
            placeholder="Tìm theo MSSV hoặc họ tên…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button type="submit" variant="secondary" className="h-11 shrink-0 sm:w-32">
            Tìm kiếm
          </Button>
        </FilterSearchRow>

        <FilterGrid>
          <FilterField label="Học kỳ" htmlFor="student-term">
            <Select
              id="student-term"
              value={filters.term}
              onChange={(event) => setFilters({ term: event.target.value || null })}
            >
              <option value="">Mọi học kỳ</option>
              {(options.data?.terms ?? []).map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Lớp" htmlFor="student-class">
            <Select
              id="student-class"
              value={filters.classCode}
              onChange={(event) => setFilters({ classCode: event.target.value || null })}
            >
              <option value="">Mọi lớp</option>
              {(options.data?.classCodes ?? []).map((classCode) => (
                <option key={classCode} value={classCode}>
                  {classCode}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Ngành" htmlFor="student-major">
            <Select
              id="student-major"
              value={filters.majorId}
              // Lọc "chưa gán ngành" đã loại hết sinh viên có ngành nên chọn
              // ngành cụ thể lúc này luôn ra rỗng — khóa lại cho khỏi rối.
              disabled={missingMajor}
              onChange={(event) => setFilters({ majorId: event.target.value || null })}
            >
              <option value="">Mọi ngành</option>
              {majorOptions.map((major) => (
                <option key={major.id} value={major.id}>
                  {major.name}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Giảng viên" htmlFor="student-lecturer">
            <Select
              id="student-lecturer"
              value={filters.lecturerId}
              onChange={(event) => setFilters({ lecturerId: event.target.value || null })}
            >
              <option value="">Mọi giảng viên</option>
              {(options.data?.lecturers ?? []).map((lecturer) => (
                <option key={lecturer.id} value={lecturer.id}>
                  {lecturer.fullName} ({lecturer.staffCode})
                </option>
              ))}
            </Select>
          </FilterField>

          {/* Tên lớp học phần dài nhất nên cho chiếm hai cột, hàng lưới vẫn đầy. */}
          <FilterField label="Lớp học phần" htmlFor="student-section" className="sm:col-span-2">
            <Select
              id="student-section"
              value={filters.sectionId}
              onChange={(event) => setFilters({ sectionId: event.target.value || null })}
            >
              <option value="">Mọi lớp học phần</option>
              {sectionOptions.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.code}
                  {section.subject ? ` — ${section.subject.name}` : ''}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Trạng thái" htmlFor="student-status">
            <Select
              id="student-status"
              value={filters.status}
              onChange={(event) => setFilters({ status: event.target.value || null })}
            >
              <option value="">Mọi trạng thái</option>
              {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FilterField>

          {/* Ô duy nhất không phải dropdown — cho nó tự thành một ô của lưới để
              vẫn thẳng hàng đáy với các ô còn lại. */}
          <label className="flex min-w-0 cursor-pointer items-center gap-2 self-end rounded-md border border-border bg-surface px-3 py-2.5 text-sm font-semibold text-ink transition-colors duration-[var(--duration-fast)] hover:border-fpt-orange has-[:checked]:border-fpt-orange has-[:checked]:bg-fpt-orange-50">
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
        </FilterGrid>

        {chips.length > 0 || options.isError ? (
          <FilterFooter>
            {options.isError ? (
              <p className="text-sm text-danger">
                Không tải được danh mục bộ lọc — bạn vẫn lọc được bằng ô tìm kiếm và trạng thái.
              </p>
            ) : null}
            {chips.map((chip) => (
              <FilterChip
                key={chip.key}
                label={chip.label}
                value={chip.value}
                onRemove={() => {
                  if (chip.key === 'search') setSearch('');
                  setFilters({ [chip.key]: null });
                }}
              />
            ))}
            {chips.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="ml-auto h-8 px-2 text-xs"
                onClick={() => {
                  setSearch('');
                  setFilters(clearFiltersPatch());
                }}
              >
                Xóa tất cả
              </Button>
            ) : null}
          </FilterFooter>
        ) : null}
      </FilterBar>

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
            {majorOptions.map((major) => (
              <option key={major.id} value={major.id}>
                {major.name}
              </option>
            ))}
          </Select>
          {options.isError ? (
            <FormError>
              {options.error instanceof ApiError
                ? options.error.message
                : 'Không tải được danh sách ngành.'}
            </FormError>
          ) : null}
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
          {assignMajor.isSuccess && assignMajor.data.updated < assignMajor.data.requested ? (
            <FormError>
              {`Đã gán ${assignMajor.data.updated}/${assignMajor.data.requested} sinh viên. ` +
                `${assignMajor.data.requested - assignMajor.data.updated} sinh viên không đổi được ngành — thường do khác bộ môn.`}
            </FormError>
          ) : null}
          {assignMajor.isSuccess && assignMajor.data.updated >= assignMajor.data.requested ? (
            <FormSuccess>Đã gán ngành cho {assignMajor.data.updated} sinh viên.</FormSuccess>
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
        isLoading={isLoading}
        isRefreshing={isFetching}
        skeletonRows={PAGE_SIZE}
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
        <p className="text-muted">{isLoading ? 'Đang tải…' : `Trang ${page}/${totalPages}`}</p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            type="button"
            disabled={isLoading || page <= 1}
            onClick={() => setFilters({ page: String(page - 1) })}
          >
            ← Trước
          </Button>
          <Button
            variant="ghost"
            type="button"
            disabled={isLoading || page >= totalPages}
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
