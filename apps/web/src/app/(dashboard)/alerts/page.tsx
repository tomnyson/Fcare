'use client';

import { ALERT_OUTCOME_LABELS, ALERT_OUTCOMES, type AlertOutcome } from '@fcare/shared-types';
import { Badge, Button } from '@fcare/ui-kit';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertRowActionsCell } from '../../../components/alerts/alert-row-actions-cell';
import { BulkSelectionBar } from '../../../components/alerts/bulk-selection-bar';
import { DeleteAlertModal } from '../../../components/alerts/delete-alert-modal';
import { DataTable, Td } from '../../../components/ui/data-table';
import { FormError, Label, Select, Textarea } from '../../../components/ui/form';
import {
  FilterBar,
  FilterChip,
  FilterField,
  FilterFooter,
  FilterGrid,
  FilterSearchInput,
  FilterSearchRow,
} from '../../../components/ui/filter-bar';
import { Modal } from '../../../components/ui/modal';
import { PageHeader } from '../../../components/ui/page-header';
import { apiFetch, ApiError } from '../../../lib/api';
import { useMe } from '../../../lib/hooks';
import {
  ALERT_LEVEL_LABELS,
  ALERT_LEVEL_TONES,
  ALERT_SOURCE_LABELS,
  ALERT_STATUS_LABELS,
  formatDate,
  formatDateTime,
} from '../../../lib/labels';
import {
  ALERT_DELETE_INVALIDATION_KEYS,
  alertRowActions,
  toggleAllSelected,
  toggleSelected,
} from '../../../lib/alert-actions';
import {
  alertLevelFilterOptions,
  alertSortPatch,
  buildAlertListQuery,
  clearAlertFiltersPatch,
  nextAlertSort,
  parseAlertFilters,
  parseAlertSort,
  type AlertSort,
  type AlertSortField,
} from '../../../lib/alert-filters';
import type { Alert, Paginated, StudentFilterOptions } from '../../../lib/types';
import { useCurrentTerm } from '../../../lib/use-current-term';
import { pageCount, parsePageParam } from '../../../lib/pagination';

// Mỗi trang 10 cảnh báo — cùng cỡ với trang Sinh viên; cũng là số hàng skeleton.
const PAGE_SIZE = 10;

// Danh mục kỳ/lớp/ngành/GV/lớp học phần đổi theo học kỳ chứ không theo phút.
// Dùng chung queryKey với trang /students để hai trang xài chung một lần gọi.
const FILTER_OPTIONS_STALE_MS = 5 * 60_000;

/** Trạng thái + hành động cho một tiêu đề cột sắp xếp được của `DataTable`. */
function sortableColumn(
  sort: AlertSort,
  field: AlertSortField,
  setFilters: (patch: Record<string, string | null>) => void,
) {
  return {
    direction: sort?.by === field ? sort.dir : null,
    onSort: () => setFilters(alertSortPatch(nextAlertSort(sort, field))),
  };
}

function AlertsPageContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const { data: currentTerm } = useCurrentTerm();
  const hasInitializedTermRef = useRef(false);
  const [resolving, setResolving] = useState<Alert | null>(null);
  // Id đang chờ xoá trong modal (một dòng hoặc cả bộ chọn); rỗng = modal đóng.
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  // Bộ chọn xoá nhiều: giữ qua các trang để gom cảnh báo ở nhiều trang một lượt.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState('');

  // URL là nguồn sự thật của bộ lọc — link "cảnh báo mức 4 của lớp X" gửi được.
  const filters = parseAlertFilters(params);
  const page = parsePageParam(params.get('page'));
  const sort = parseAlertSort(params);
  const submittedSearch = filters.search;
  const [search, setSearch] = useState(submittedSearch);

  // Đổi bất kỳ bộ lọc nào → về trang 1, trừ khi patch tự đặt `page`.
  const setFilters = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries({ page: null, ...patch })) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    if (!hasInitializedTermRef.current && !params.has('term') && currentTerm?.code) {
      hasInitializedTermRef.current = true;
      setFilters({ term: currentTerm.code });
    }
  }, [currentTerm?.code, params, setFilters]);

  // Back/forward đổi `search` trên URL mà không đi qua ô input.
  useEffect(() => {
    setSearch(submittedSearch);
  }, [submittedSearch]);

  // Cùng nguồn option với /students nên phạm vi bộ môn/lớp đang dạy đã được
  // API cắt sẵn (RULE 2) — không cần lọc lại phía web.
  const options = useQuery({
    queryKey: ['student-filter-options'],
    queryFn: () => apiFetch<StudentFilterOptions>('/students/filter-options'),
    staleTime: FILTER_OPTIONS_STALE_MS,
  });
  const sectionOptions = (options.data?.sections ?? []).filter(
    (section) => !filters.term || section.term === filters.term || section.id === filters.sectionId,
  );

  // Chip tóm tắt bộ lọc: đọc được đang lọc gì mà không phải rà lại từng ô, và
  // gỡ được đúng một tiêu chí thay vì xóa sạch rồi chọn lại.
  const chips: Array<{ key: string; label: string; value: string }> = [];
  if (filters.search.trim())
    chips.push({ key: 'search', label: 'Từ khóa', value: filters.search.trim() });
  if (filters.openOnly)
    chips.push({ key: 'openOnly', label: 'Trạng thái', value: 'Chưa giải quyết' });
  if (filters.status)
    chips.push({
      key: 'status',
      label: 'Trạng thái',
      value: (ALERT_STATUS_LABELS as Record<string, string>)[filters.status] ?? filters.status,
    });
  if (filters.level)
    chips.push({
      key: 'level',
      label: 'Độ khẩn',
      value: `Mức ${filters.level}${
        ALERT_LEVEL_LABELS[Number(filters.level)]
          ? ` — ${ALERT_LEVEL_LABELS[Number(filters.level)]}`
          : ''
      }`,
    });
  if (filters.source)
    chips.push({
      key: 'source',
      label: 'Nguồn',
      value: (ALERT_SOURCE_LABELS as Record<string, string>)[filters.source] ?? filters.source,
    });
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
      value: options.data?.majors.find((major) => major.id === filters.majorId)?.name ?? 'đã chọn',
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

  const limitParam = parseInt(params.get('limit') ?? '10', 10);
  const limit = [10, 20, 50, 100].includes(limitParam) ? limitParam : PAGE_SIZE;
  const listQuery = buildAlertListQuery(filters, limit, page, sort).toString();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['alerts', listQuery],
    queryFn: () => apiFetch<Paginated<Alert>>(`/alerts?${listQuery}`),
    // Đổi bộ lọc giữ nguyên bảng cũ thay vì xóa trắng rồi vẽ lại.
    placeholderData: keepPreviousData,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/alerts/${id}/acknowledge`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const resolveMutation = useMutation({
    mutationFn: ({
      id,
      outcome,
      resolutionNote,
    }: {
      id: string;
      outcome: AlertOutcome;
      resolutionNote: string;
    }) =>
      apiFetch(`/alerts/${id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ outcome, resolutionNote }),
      }),
    onSuccess: async () => {
      setResolving(null);
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra.'),
  });

  // Xoá đơn lẻ hay cả lô đều đi một đường; xoá hết dòng của trang > 1 thì lùi
  // một trang thay vì đứng ở trang trống.
  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch('/alerts/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
    onSuccess: async (_result, ids) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      const remainingOnPage = (data?.items ?? []).filter((item) => !ids.includes(item.id));
      if (page > 1 && remainingOnPage.length === 0) {
        setFilters({ page: String(page - 1) });
      }
      await Promise.all(
        ALERT_DELETE_INVALIDATION_KEYS.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [...queryKey] }),
        ),
      );
    },
  });

  const roles = me?.user.roles;
  // Cột chọn chỉ có ý nghĩa với người được xoá (ADMIN) — trạng thái không ảnh hưởng quyền xoá.
  const userId = me?.user.id;
  const canBulkDelete = alertRowActions({
    roles,
    status: 'OPEN',
    userId,
    sectionLecturerId: null,
    raisedById: null,
  }).canDelete;
  const pageIds = (data?.items ?? []).map((alert) => alert.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const pageSomeSelected = pageIds.some((id) => selected.has(id));

  function onResolveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolving) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const outcome = String(form.get('outcome') ?? '');
    if (!(ALERT_OUTCOMES as ReadonlyArray<string>).includes(outcome)) {
      setError('Vui lòng chọn kết quả Đạt / Không đạt.');
      return;
    }
    resolveMutation.mutate({
      id: resolving.id,
      outcome: outcome as AlertOutcome,
      resolutionNote: String(form.get('resolutionNote') ?? ''),
    });
  }

  return (
    <>
      <PageHeader
        title="Cảnh báo sinh viên"
        description="Theo dõi và xử lý cảnh báo theo độ khẩn 1-4."
      />

      <FilterBar
        label="Bộ lọc cảnh báo"
        collapsible
        activeCount={chips.filter((chip) => chip.key !== 'search').length}
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ search: search.trim() || null });
        }}
      >
        <FilterSearchRow>
          <FilterSearchInput
            id="alert-search"
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
          <FilterField label="Trạng thái" htmlFor="alert-status">
            <Select
              id="alert-status"
              value={filters.status}
              // openOnly thắng status ở API — chọn trạng thái cụ thể thì bỏ nó đi.
              onChange={(event) =>
                setFilters({ status: event.target.value || null, openOnly: null })
              }
            >
              <option value="">Mọi trạng thái</option>
              {Object.entries(ALERT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Độ khẩn" htmlFor="alert-level">
            <Select
              id="alert-level"
              value={filters.level}
              onChange={(event) => setFilters({ level: event.target.value || null })}
            >
              <option value="">Mọi độ khẩn</option>
              {alertLevelFilterOptions(me?.user.roles).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Nguồn" htmlFor="alert-source">
            <Select
              id="alert-source"
              value={filters.source}
              onChange={(event) => setFilters({ source: event.target.value || null })}
            >
              <option value="">Mọi nguồn</option>
              {Object.entries(ALERT_SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Học kỳ" htmlFor="alert-term">
            <Select
              id="alert-term"
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

          <FilterField label="Lớp" htmlFor="alert-class">
            <Select
              id="alert-class"
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

          <FilterField label="Ngành" htmlFor="alert-major">
            <Select
              id="alert-major"
              value={filters.majorId}
              onChange={(event) => setFilters({ majorId: event.target.value || null })}
            >
              <option value="">Mọi ngành</option>
              {(options.data?.majors ?? []).map((major) => (
                <option key={major.id} value={major.id}>
                  {major.name}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Giảng viên" htmlFor="alert-lecturer">
            <Select
              id="alert-lecturer"
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
          <FilterField label="Lớp học phần" htmlFor="alert-section" className="sm:col-span-2">
            <Select
              id="alert-section"
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
        </FilterGrid>

        {chips.length > 0 || options.isError ? (
          <FilterFooter>
            {options.isError ? (
              <p className="text-sm text-danger">
                Không tải được danh mục bộ lọc — bạn vẫn lọc được bằng ô tìm kiếm, trạng thái và độ
                khẩn.
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
                  setFilters(clearAlertFiltersPatch());
                }}
              >
                Xóa tất cả
              </Button>
            ) : null}
          </FilterFooter>
        ) : null}
      </FilterBar>

      {canBulkDelete ? (
        <BulkSelectionBar
          selectedCount={selected.size}
          pageCount={pageIds.length}
          pageAllSelected={pageAllSelected}
          pageSomeSelected={pageSomeSelected}
          onTogglePage={() => setSelected((prev) => toggleAllSelected(prev, pageIds))}
          onClear={() => setSelected(new Set())}
          onDeleteSelected={() => setDeletingIds([...selected])}
        />
      ) : null}

      <DataTable
        fitViewport
        sortable={{
          'Độ khẩn': sortableColumn(sort, 'level', setFilters),
          'Thời điểm': sortableColumn(sort, 'createdAt', setFilters),
        }}
        headers={[
          ...(canBulkDelete ? ['Chọn'] : []),
          'Độ khẩn',
          'Sinh viên',
          'Lớp học phần',
          'Lý do',
          'Người phát',
          'Thời điểm',
          'Trạng thái',
          'Thao tác',
        ]}
        isLoading={isLoading}
        isRefreshing={isFetching}
        skeletonRows={limit}
        isEmpty={!isLoading && (data?.items.length ?? 0) === 0}
        emptyMessage="Không có cảnh báo nào khớp bộ lọc."
        pagination={{
          page,
          totalPages: pageCount(data?.meta.total ?? 0, limit),
          total: data?.meta.total ?? 0,
          limit,
          isLoading,
          onPageChange: (next) => setFilters({ page: String(next) }),
          onLimitChange: (next) => setFilters({ limit: String(next), page: '1' }),
          label: 'Phân trang cảnh báo',
        }}
      >
        {(data?.items ?? []).map((alert) => (
          <tr
            key={alert.id}
            className={`transition-colors hover:bg-fpt-orange-50/40 ${
              selected.has(alert.id) ? 'bg-danger/5' : ''
            }`}
            aria-selected={canBulkDelete ? selected.has(alert.id) : undefined}
          >
            {canBulkDelete ? (
              <Td>
                <input
                  type="checkbox"
                  aria-label={`Chọn cảnh báo của ${alert.student?.fullName ?? 'sinh viên'}`}
                  checked={selected.has(alert.id)}
                  onChange={() => setSelected((prev) => toggleSelected(prev, alert.id))}
                  className="size-4 accent-danger"
                />
              </Td>
            ) : null}
            <Td>
              <Badge
                tone={ALERT_LEVEL_TONES[alert.level] ?? 'info'}
                pulse={alert.level >= 3 && alert.status !== 'RESOLVED'}
              >
                Mức {alert.level} — {ALERT_LEVEL_LABELS[alert.level] ?? alert.level}
              </Badge>
            </Td>
            <Td>
              {alert.student ? (
                <Link
                  href={`/students/${alert.student.id}`}
                  className="font-semibold text-fpt-blue hover:underline"
                >
                  {alert.student.fullName}
                  <span className="ml-1 font-normal text-muted">({alert.student.studentCode})</span>
                </Link>
              ) : (
                '—'
              )}
            </Td>
            <Td>
              {alert.classSection ? (
                <Link
                  href={`/class-sections/${alert.classSection.id}/grades`}
                  title={alert.classSection.subject?.name}
                  className="font-medium text-fpt-blue hover:underline focus-visible:underline"
                >
                  {alert.classSection.code}
                </Link>
              ) : (
                <span className="text-muted">—</span>
              )}
              {alert.absentSessions !== null ? (
                <span className="ml-2 text-xs font-semibold text-danger tabular-nums">
                  vắng {alert.absentSessions} buổi
                </span>
              ) : null}
            </Td>
            <Td className="max-w-80 whitespace-normal">
              {alert.reason}
              {alert.source === 'AUTO_ATTENDANCE' && alert.ownerCaredAt ? (
                <span className="mt-1 block">
                  <Badge tone="success">GV lớp đã chăm sóc {formatDate(alert.ownerCaredAt)}</Badge>
                </span>
              ) : null}
            </Td>
            <Td>
              {alert.raisedBy ? (
                alert.raisedBy.fullName
              ) : (
                <span className="text-muted">Hệ thống</span>
              )}
            </Td>
            <Td className="text-muted">{formatDateTime(alert.createdAt)}</Td>
            <Td>
              <Badge
                tone={
                  alert.status === 'RESOLVED'
                    ? 'success'
                    : alert.status === 'OPEN'
                      ? 'warning'
                      : 'info'
                }
              >
                {ALERT_STATUS_LABELS[alert.status]}
              </Badge>
              {alert.outcome ? (
                <span className="mt-1 block">
                  <Badge tone={alert.outcome === 'PASSED' ? 'success' : 'danger'}>
                    {ALERT_OUTCOME_LABELS[alert.outcome]}
                  </Badge>
                </span>
              ) : null}
            </Td>
            <Td>
              <AlertRowActionsCell
                actions={alertRowActions({
                  roles,
                  status: alert.status,
                  userId,
                  sectionLecturerId: alert.classSection?.lecturerId,
                  raisedById: alert.raisedBy?.id,
                })}
                onAcknowledge={() => acknowledgeMutation.mutate(alert.id)}
                onResolve={() => setResolving(alert)}
                onDelete={() => setDeletingIds([alert.id])}
              />
            </Td>
          </tr>
        ))}
      </DataTable>

      <DeleteAlertModal
        ids={deletingIds}
        open={deletingIds.length > 0}
        onClose={() => setDeletingIds([])}
        onConfirmDelete={(ids) => deleteMutation.mutateAsync(ids).then(() => undefined)}
      />

      <Modal
        title={`Xử lý cảnh báo — ${resolving?.student?.fullName ?? ''}`}
        open={resolving !== null}
        onClose={() => setResolving(null)}
        size="lg"
      >
        <form onSubmit={onResolveSubmit} className="space-y-4">
          <FormError>{error}</FormError>
          <p className="rounded-md bg-surface p-3 text-sm text-muted">{resolving?.reason}</p>
          <OutcomeFieldset />
          <div>
            <Label htmlFor="resolutionNote">Ghi chú xử lý</Label>
            <Textarea
              id="resolutionNote"
              name="resolutionNote"
              required
              placeholder="Kết quả can thiệp, hướng xử lý…"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setResolving(null)}>
              Hủy
            </Button>
            <Button type="submit" disabled={resolveMutation.isPending}>
              {resolveMutation.isPending ? 'Đang lưu…' : 'Chốt cảnh báo'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

const OUTCOME_HINTS: Record<AlertOutcome, string> = {
  PASSED: 'Sinh viên đã cải thiện sau khi được chăm sóc.',
  EXAM_BANNED: 'Đã chăm sóc nhưng cuối cùng sinh viên vẫn bị cấm thi.',
  FAILED: 'Đã chăm sóc nhưng cuối cùng sinh viên vẫn rớt môn.',
};

/** Kết quả chốt: Đạt (xanh) hoặc Không đạt — cấm thi / rớt môn (đỏ). Bắt buộc chọn. */
function OutcomeFieldset() {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-ink">Kết quả chăm sóc</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {ALERT_OUTCOMES.map((outcome) => {
          const passed = outcome === 'PASSED';
          return (
            <label
              key={outcome}
              className={`flex cursor-pointer items-start gap-2 rounded-md border border-border px-2.5 py-2 text-sm text-ink transition-colors hover:bg-surface-raised focus-within:ring-2 focus-within:ring-fpt-blue/40 ${
                passed
                  ? 'has-[:checked]:border-success has-[:checked]:bg-success/10'
                  : 'has-[:checked]:border-danger has-[:checked]:bg-danger/10'
              }`}
            >
              <input
                type="radio"
                name="outcome"
                value={outcome}
                required
                className="mt-0.5 shrink-0"
              />
              <span>
                <span className="font-semibold">{ALERT_OUTCOME_LABELS[outcome]}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {OUTCOME_HINTS[outcome]}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Đang tải danh sách cảnh báo…</p>}>
      <AlertsPageContent />
    </Suspense>
  );
}
