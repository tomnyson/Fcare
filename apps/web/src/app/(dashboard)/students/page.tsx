'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
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
import {
  ALERT_LEVEL_LABELS,
  ALERT_LEVEL_TONES,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_TONES,
} from '../../../lib/labels';
import { QuickEvaluationModal } from '../../../components/students/quick-evaluation-modal';
import {
  buildStudentListQuery,
  clearFiltersPatch,
  defaultLecturerFilter,
  majorsForClass,
  nextStudentSort,
  parseStudentFilters,
  parseStudentSort,
  studentCareHref,
  studentSortPatch,
  type StudentSort,
  type StudentSortField,
} from '../../../lib/student-filters';
import type { Evaluation, Paginated, Student, StudentFilterOptions } from '../../../lib/types';
import { useCurrentTerm } from '../../../lib/use-current-term';
import { pageCount, parsePageParam } from '../../../lib/pagination';

const PAGE_SIZE = 10;

const SORT_LABELS: Record<StudentSortField, string> = {
  absentSessions: 'số buổi vắng',
  openAlerts: 'số cảnh báo mở',
  risk: 'mức nguy cơ',
};

const ALERT_LEVEL_OPTIONS = [1, 2, 3, 4] as const;

/** Mức cảnh báo mở cao nhất + số cảnh báo mở: nhìn là biết ai cần chăm sóc trước. */
function OpenAlertsCell({ count, maxLevel }: { count: number; maxLevel?: number | null }) {
  if (count === 0) return <span className="text-muted">0</span>;
  if (!maxLevel) return <Badge tone="danger">{count}</Badge>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Badge tone={ALERT_LEVEL_TONES[maxLevel] ?? 'danger'} pulse={maxLevel >= 3}>
        Mức {maxLevel}
      </Badge>
      <span className="text-xs text-muted">{count} mở</span>
    </span>
  );
}

/** Trạng thái + hành động cho một tiêu đề cột sắp xếp được của `DataTable`. */
function sortableColumn(
  sort: StudentSort,
  field: StudentSortField,
  setFilters: (patch: Record<string, string | null>) => void,
) {
  return {
    direction: sort?.by === field ? sort.dir : null,
    onSort: () => setFilters(studentSortPatch(nextStudentSort(sort, field))),
  };
}

// Ngưỡng cảnh báo điểm danh tự động tính theo TỪNG lớp học phần (2 → L2, ≥ 3 → L3).
const ABSENCE_WARNING_THRESHOLD = 2;
const ABSENCE_DANGER_THRESHOLD = 3;

function AbsenceCell({
  absentSessions,
  maxSectionAbsent,
}: {
  absentSessions?: number | null;
  maxSectionAbsent?: number | null;
}) {
  // Chưa import điểm danh (null) hiển thị như 0 buổi vắng theo yêu cầu nghiệp vụ.
  const total = absentSessions ?? 0;
  const peak = maxSectionAbsent ?? 0;
  if (peak >= ABSENCE_DANGER_THRESHOLD) return <Badge tone="danger">{total}</Badge>;
  if (peak >= ABSENCE_WARNING_THRESHOLD) return <Badge tone="warning">{total}</Badge>;
  return <span className={total > 0 ? 'text-ink' : 'text-muted'}>{total}</span>;
}

// Danh mục kỳ/lớp/ngành/giảng viên đổi theo học kỳ chứ không theo phút — giữ
// cache 5 phút để đổi bộ lọc liên tục không gọi lại API.
const FILTER_OPTIONS_STALE_MS = 5 * 60_000;

// Gán ngành hàng loạt cần `update Student` — ADMIN, HEAD_OF_DEPT,
// TRAINING_OFFICER (xem apps/api/src/casl/ability.factory.ts).
const STUDENT_WRITE_ROLES = ['ADMIN', 'HEAD_OF_DEPT', 'TRAINING_OFFICER'];
const EVALUATION_ROLES = ['LECTURER', 'HEAD_OF_DEPT', 'ADMIN'];

function StudentsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { data: currentTerm, isPending: isCurrentTermPending } = useCurrentTerm();
  const hasInitializedDefaultsRef = useRef(false);
  const canAssignMajor = me?.user.roles.some((role) => STUDENT_WRITE_ROLES.includes(role)) ?? false;
  const canEvaluate = me?.user.roles.some((role) => EVALUATION_ROLES.includes(role)) ?? false;

  // URL là nguồn sự thật của bộ lọc: gửi link cho đồng nghiệp là gửi đúng bộ lọc.
  const filters = parseStudentFilters(params);
  const sort = parseStudentSort(params);
  const submittedSearch = filters.search;
  const missingMajor = filters.missingMajor;
  const page = parsePageParam(params.get('page'));

  const [search, setSearch] = useState(submittedSearch);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [majorId, setMajorId] = useState('');
  const [evaluatingStudent, setEvaluatingStudent] = useState<Student | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Khi đang xem một lớp học phần cụ thể, tải danh sách nhận xét của lớp để nhận diện sinh viên đã có nhận xét
  const sectionEvaluations = useQuery({
    queryKey: ['evaluations', { classSectionId: filters.sectionId, term: filters.term }],
    queryFn: () =>
      apiFetch<Evaluation[]>(
        `/evaluations?classSectionId=${filters.sectionId}${filters.term ? `&term=${filters.term}` : ''}`,
      ),
    enabled: Boolean(filters.sectionId) && canEvaluate,
  });

  /** Ghi bộ lọc vào URL. Mọi thay đổi bộ lọc đều đưa về trang 1. */
  const setFilters = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries({ page: null, ...patch })) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      setSelected([]);
    },
    [params, pathname, router],
  );

  // Mặc định lần đầu mở trang: kỳ hiện tại + (giảng viên) lớp mình dạy. Ghi
  // MỘT lần để hai patch không đè nhau; link đã có sẵn tham số thì giữ nguyên.
  useEffect(() => {
    if (hasInitializedDefaultsRef.current || !me || isCurrentTermPending) return;
    hasInitializedDefaultsRef.current = true;
    const term = params.has('term') ? '' : (currentTerm?.code ?? '');
    const lecturerId = params.has('lecturerId')
      ? ''
      : defaultLecturerFilter(me.user.roles, me.user.id);
    if (!term && !lecturerId) return;
    setFilters({
      ...(term ? { term } : {}),
      ...(lecturerId ? { lecturerId } : {}),
    });
  }, [currentTerm?.code, isCurrentTermPending, me, params, setFilters]);

  // Back/forward đổi query param `search` trên URL mà không đi qua ô input —
  // đồng bộ lại state để ô tìm kiếm không giữ giá trị cũ.
  useEffect(() => {
    setSearch(submittedSearch);
  }, [submittedSearch]);

  const limitParam = parseInt(params.get('limit') ?? '10', 10);
  const limit = [10, 20, 50, 100].includes(limitParam) ? limitParam : PAGE_SIZE;
  const listQuery = buildStudentListQuery(filters, page, limit, sort).toString();
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
  // Ô lọc Ngành đi theo ô Lớp: chọn lớp CNTT thì chỉ còn ngành có SV lớp đó.
  // Ô gán ngành hàng loạt vẫn dùng `majorOptions` đầy đủ.
  const classMajors = options.data?.classMajors;
  const filterMajorOptions = majorsForClass(majorOptions, classMajors, filters.classCode);
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
  if (filters.departmentId)
    chips.push({
      key: 'departmentId',
      label: 'Bộ môn',
      value:
        options.data?.departments?.find((department) => department.id === filters.departmentId)
          ?.name ?? 'đã chọn',
    });
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
      value: (STUDENT_STATUS_LABELS as Record<string, string>)[filters.status] ?? filters.status,
    });
  if (filters.alertLevel)
    chips.push({
      key: 'alertLevel',
      label: 'Cảnh báo',
      value:
        filters.alertLevel === 'any'
          ? 'Đang có cảnh báo'
          : `Mức ${filters.alertLevel} — ${ALERT_LEVEL_LABELS[Number(filters.alertLevel)] ?? ''}`,
    });
  if (missingMajor)
    chips.push({ key: 'missingMajor', label: 'Lọc riêng', value: 'Chưa gán ngành' });

  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = pageCount(total, PAGE_SIZE);
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
        activeCount={chips.filter((chip) => chip.key !== 'search').length}
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
              onChange={(event) => {
                const classCode = event.target.value;
                // Ngành đang chọn không có trong lớp mới thì bỏ, tránh kết quả rỗng khó hiểu.
                const keepMajor =
                  !filters.majorId ||
                  majorsForClass(majorOptions, classMajors, classCode).some(
                    (major) => major.id === filters.majorId,
                  );
                setFilters({
                  classCode: classCode || null,
                  ...(keepMajor ? {} : { majorId: null }),
                });
              }}
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
              {filterMajorOptions.map((major) => (
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

          <FilterField label="Mức cảnh báo" htmlFor="student-alert-level">
            <Select
              id="student-alert-level"
              value={filters.alertLevel}
              onChange={(event) => setFilters({ alertLevel: event.target.value || null })}
            >
              <option value="">Mọi sinh viên</option>
              <option value="any">Đang có cảnh báo (mọi mức)</option>
              {ALERT_LEVEL_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  Mức {level} — {ALERT_LEVEL_LABELS[level]}
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

      {sort?.by === 'risk' ? (
        <p className="text-sm text-muted" role="status">
          Sinh viên <strong className="font-semibold text-ink">nguy cơ cao</strong> lên đầu: mức
          cảnh báo chưa chốt cao nhất trước, cùng mức thì nhiều cảnh báo hơn trước.
        </p>
      ) : sort ? (
        <p className="text-sm text-muted" role="status">
          Đang gom theo <strong className="font-semibold text-ink">lớp</strong>, trong từng lớp xếp
          theo <strong className="font-semibold text-ink">{SORT_LABELS[sort.by]}</strong>{' '}
          {sort.dir === 'desc' ? 'từ nhiều đến ít' : 'từ ít đến nhiều'}. Chưa có dữ liệu điểm danh
          nằm cuối mỗi lớp.
        </p>
      ) : null}

      <DataTable
        fitViewport
        sortable={{
          'Số buổi vắng': sortableColumn(sort, 'absentSessions', setFilters),
          'Cảnh báo mở': sortableColumn(sort, 'openAlerts', setFilters),
        }}
        headers={[
          ...(showSelectColumn ? ['Chọn'] : []),
          'MSSV',
          'Họ tên',
          'Lớp',
          'Ngành',
          'Bộ môn',
          'Số buổi vắng',
          'Trạng thái',
          'Cảnh báo mở',
          ...(canEvaluate ? ['Thao tác'] : []),
        ]}
        isLoading={isLoading}
        isRefreshing={isFetching}
        skeletonRows={limit}
        isEmpty={!isLoading && !isError && items.length === 0}
        emptyMessage="Không có sinh viên nào khớp bộ lọc."
        pagination={{
          page,
          totalPages,
          total,
          limit,
          isLoading,
          onPageChange: (next) => setFilters({ page: String(next) }),
          onLimitChange: (next) => setFilters({ limit: String(next), page: '1' }),
          label: 'Phân trang sinh viên',
        }}
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
            <Td>
              <Link
                href={studentCareHref(student.id, filters.term)}
                title={`Mở nhật ký chăm sóc của ${student.fullName}`}
                className="rounded-sm font-medium text-ink underline decoration-transparent decoration-2 underline-offset-4 transition-colors hover:text-fpt-orange-600 hover:decoration-fpt-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue"
              >
                {student.fullName}
              </Link>
            </Td>
            <Td>{student.classCode}</Td>
            <Td>{student.major?.name ?? '—'}</Td>
            <Td>{student.department?.code ?? '—'}</Td>
            <Td>
              <AbsenceCell
                absentSessions={student.absentSessions}
                maxSectionAbsent={student.maxSectionAbsent}
              />
            </Td>
            <Td>
              <Badge tone={STUDENT_STATUS_TONES[student.status]}>
                {STUDENT_STATUS_LABELS[student.status]}
              </Badge>
            </Td>
            <Td>
              <OpenAlertsCell
                count={student._count?.alerts ?? 0}
                maxLevel={student.maxOpenAlertLevel}
              />
            </Td>
            {canEvaluate ? (
              <Td>
                {(() => {
                  const existingEval = (sectionEvaluations.data ?? []).find(
                    (ev) =>
                      (ev.studentId === student.id || ev.student?.id === student.id) &&
                      (me?.user.roles.includes('ADMIN') ||
                        me?.user.roles.includes('HEAD_OF_DEPT') ||
                        ev.lecturer?.id === me?.user.id),
                  );

                  return (
                    <Button
                      type="button"
                      variant="ghost"
                      className={`h-8 px-2.5 text-xs font-semibold transition-colors ${
                        existingEval
                          ? 'border border-emerald-500/30 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border border-fpt-orange/40 bg-fpt-orange-50 text-fpt-orange-700 hover:bg-fpt-orange-100'
                      }`}
                      onClick={() => setEvaluatingStudent(student)}
                      title={existingEval ? 'Chỉnh sửa nhận xét' : 'Thêm nhận xét cho sinh viên'}
                    >
                      {existingEval ? '✓ Sửa nhận xét' : '+ Nhận xét'}
                    </Button>
                  );
                })()}
              </Td>
            ) : null}
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

      {savedNotice ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-opacity animate-in fade-in duration-300">
          {savedNotice}
        </div>
      ) : null}

      <QuickEvaluationModal
        student={evaluatingStudent}
        term={filters.term || currentTerm?.code || ''}
        sectionId={filters.sectionId || undefined}
        open={Boolean(evaluatingStudent)}
        onClose={() => setEvaluatingStudent(null)}
        onSaved={(std) => {
          setSavedNotice(`Đã lưu nhận xét cho sinh viên ${std.fullName} (${std.studentCode})`);
          setTimeout(() => setSavedNotice(null), 4000);
        }}
      />
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
