'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FilterBar,
  FilterChip,
  FilterField,
  FilterFooter,
  FilterGrid,
  FilterSearchInput,
  FilterSearchRow,
} from '../ui/filter-bar';
import { Select } from '../ui/form';
import { PageHeader } from '../ui/page-header';
import { Pagination } from '../ui/pagination';
import { Skeleton } from '../ui/skeleton';
import { DataTable, Td } from '../ui/data-table';
import { usePagedList } from '../../lib/use-paged-list';
import { StatCard } from '../ui/stat-card';
import { apiFetch } from '../../lib/api';
import type { ClassSection } from '../../lib/types';
import { useCurrentTerm, useTerms } from '../../lib/use-current-term';
import { formatSlot, formatWeekdays } from './classes-helpers';
import {
  CLASSES_VIEW_MODE_STORAGE_KEY,
  type ClassSectionsViewMode,
  resolveViewMode,
} from './classes-view-mode';

/** Số thẻ lớp mỗi trang ở chế độ Thẻ — vừa 8 hàng ở lưới 3 cột. */
const CARDS_PER_PAGE = 24;
/** Số dòng mỗi trang ở chế độ Bảng — chuẩn 10 dòng toàn hệ thống. */
const TABLE_PAGE_SIZE = 10;

export function ClassesView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const { data: currentTerm, isLoading: isCurrentTermLoading } = useCurrentTerm();
  const { data: terms = [] } = useTerms();
  const hasInitializedTermRef = useRef(false);

  // URL query params
  const termParam = params.get('term') ?? '';
  const searchParam = params.get('search') ?? '';
  const blockParam = params.get('block') ?? '';
  const alertStatusParam = params.get('alertStatus') ?? '';
  const viewParam = params.get('view');

  const [viewMode, setViewMode] = useState<ClassSectionsViewMode>(() => {
    const saved =
      typeof window !== 'undefined'
        ? localStorage.getItem(CLASSES_VIEW_MODE_STORAGE_KEY)
        : null;
    return resolveViewMode(viewParam, saved);
  });

  const [searchInput, setSearchInput] = useState(searchParam);

  const setFilters = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value && value.trim()) {
          next.set(key, value.trim());
        } else {
          next.delete(key);
        }
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // Đồng bộ viewMode khi URL viewParam thay đổi
  useEffect(() => {
    if (viewParam === 'card' || viewParam === 'list') {
      setViewMode(viewParam);
    }
  }, [viewParam]);

  const handleViewModeChange = useCallback(
    (mode: ClassSectionsViewMode) => {
      setViewMode(mode);
      if (typeof window !== 'undefined') {
        localStorage.setItem(CLASSES_VIEW_MODE_STORAGE_KEY, mode);
      }
      setFilters({ view: mode });
    },
    [setFilters],
  );

  // Mặc định chọn học kỳ active hiện tại nếu URL chưa có term
  useEffect(() => {
    if (!hasInitializedTermRef.current && !params.has('term') && currentTerm?.code) {
      hasInitializedTermRef.current = true;
      setFilters({ term: currentTerm.code });
    }
  }, [currentTerm?.code, params, setFilters]);

  // Đồng bộ lại ô tìm kiếm khi quay lại bằng back/forward
  useEffect(() => {
    setSearchInput(searchParam);
  }, [searchParam]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ search: searchInput });
  }

  const activeTermCode = termParam || currentTerm?.code || '';

  const { data: sections = [], isLoading, isFetching } = useQuery({
    queryKey: ['class-sections', activeTermCode],
    queryFn: () =>
      apiFetch<ClassSection[]>(
        activeTermCode
          ? `/class-sections?term=${encodeURIComponent(activeTermCode)}`
          : '/class-sections',
      ),
    enabled: !!activeTermCode || !isCurrentTermLoading,
    placeholderData: keepPreviousData,
  });

  // Lọc client-side cho ô tìm kiếm, block, alertStatus
  const filteredSections = useMemo(() => {
    return sections.filter((section) => {
      // Lọc search: khớp mã lớp, mã môn, tên môn học
      if (searchParam) {
        const query = searchParam.toLowerCase();
        const codeMatch = section.code?.toLowerCase().includes(query);
        const subjectCodeMatch = section.subject?.code?.toLowerCase().includes(query);
        const subjectNameMatch = section.subject?.name?.toLowerCase().includes(query);
        const roomMatch = section.room?.toLowerCase().includes(query);
        if (!codeMatch && !subjectCodeMatch && !subjectNameMatch && !roomMatch) {
          return false;
        }
      }

      // Lọc block
      if (blockParam) {
        if (String(section.block) !== blockParam) {
          return false;
        }
      }

      // Lọc theo cảnh báo
      if (alertStatusParam === 'has_alerts') {
        if (!section.openAlertCount || section.openAlertCount <= 0) {
          return false;
        }
      } else if (alertStatusParam === 'no_alerts') {
        if (section.openAlertCount && section.openAlertCount > 0) {
          return false;
        }
      }

      return true;
    });
  }, [sections, searchParam, blockParam, alertStatusParam]);

  // Thống kê tổng hợp
  // Một kỳ có thể tới ~270 lớp — chỉ vẽ 24 thẻ mỗi trang, thống kê vẫn tính trên toàn bộ.
  const paged = usePagedList(filteredSections, {
    pageSize: viewMode === 'list' ? TABLE_PAGE_SIZE : CARDS_PER_PAGE,
    resetKey: `${activeTermCode}|${searchParam}|${blockParam}|${alertStatusParam}|${viewMode}`,
  });
  const totalClasses = filteredSections.length;
  const totalStudents = filteredSections.reduce(
    (sum, s) => sum + (s._count?.enrollments ?? 0),
    0,
  );
  const totalAlerts = filteredSections.reduce(
    (sum, s) => sum + (s.openAlertCount ?? 0),
    0,
  );

  const hasActiveFilters = Boolean(searchParam || blockParam || alertStatusParam);
  const selectedTermObj = terms.find((t) => t.code === activeTermCode);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lớp học"
        description="Danh sách các lớp học phần bạn đang phụ trách trong học kỳ hiện tại."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {selectedTermObj ? (
              <div className="flex items-center gap-2 rounded-full border border-fpt-blue/20 bg-fpt-blue/5 px-3 py-1 text-xs font-medium text-fpt-blue-900">
                <span className="size-2 rounded-full bg-success" />
                <span>
                  {selectedTermObj.name} ({selectedTermObj.code})
                  {selectedTermObj.code === currentTerm?.code ? ' — Kỳ hiện tại' : ''}
                </span>
              </div>
            ) : null}

            {/* Nút chuyển đổi giao diện Thẻ / Danh sách */}
            <div
              className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5 text-xs shadow-xs"
              role="group"
              aria-label="Chế độ hiển thị danh sách lớp"
            >
              <button
                type="button"
                data-testid="view-mode-card"
                onClick={() => handleViewModeChange('card')}
                aria-pressed={viewMode === 'card'}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-fpt-blue ${
                  viewMode === 'card'
                    ? 'bg-fpt-blue-900 text-white shadow-xs font-semibold'
                    : 'text-muted hover:text-ink hover:bg-white/80'
                }`}
              >
                <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z" />
                </svg>
                <span>Thẻ</span>
              </button>
              <button
                type="button"
                data-testid="view-mode-list"
                onClick={() => handleViewModeChange('list')}
                aria-pressed={viewMode === 'list'}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-fpt-blue ${
                  viewMode === 'list'
                    ? 'bg-fpt-blue-900 text-white shadow-xs font-semibold'
                    : 'text-muted hover:text-ink hover:bg-white/80'
                }`}
              >
                <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z" />
                </svg>
                <span>Danh sách</span>
              </button>
            </div>
          </div>
        }
      />

      {/* Thẻ thống kê nhanh */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Tổng số lớp học"
          value={totalClasses}
          hint={activeTermCode ? `Học kỳ ${activeTermCode}` : 'Toàn bộ học kỳ'}
          accent="blue"
          isLoading={isLoading}
        />
        <StatCard
          label="Tổng sĩ số sinh viên"
          value={totalStudents}
          hint="Sinh viên trong các lớp"
          accent="green"
          isLoading={isLoading}
        />
        <StatCard
          label="Sinh viên cần chú ý"
          value={totalAlerts}
          hint={totalAlerts > 0 ? 'Có cảnh báo học vụ đang mở' : 'Không có cảnh báo học vụ'}
          accent={totalAlerts > 0 ? 'orange' : 'blue'}
          isLoading={isLoading}
        />
      </div>

      {/* Thanh bộ lọc */}
      <FilterBar
        label="Bộ lọc lớp học"
        onSubmit={handleSearchSubmit}
        activeCount={[blockParam, alertStatusParam].filter(Boolean).length}
      >
        <FilterSearchRow>
          <FilterSearchInput
            id="classes-search"
            placeholder="Tìm theo mã lớp học phần, mã môn, tên môn học, phòng học..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="submit" variant="secondary" className="h-11 shrink-0 px-5">
            Tìm kiếm
          </Button>
        </FilterSearchRow>

        <FilterGrid>
          <FilterField label="Học kỳ" htmlFor="filter-term">
            <Select
              id="filter-term"
              value={activeTermCode}
              onChange={(e) => setFilters({ term: e.target.value })}
            >
              {terms.map((t) => (
                <option key={t.id} value={t.code}>
                  {t.name} ({t.code})
                  {t.code === currentTerm?.code ? ' — Kỳ hiện tại' : ''}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Block" htmlFor="filter-block">
            <Select
              id="filter-block"
              value={blockParam}
              onChange={(e) => setFilters({ block: e.target.value })}
            >
              <option value="">Tất cả các block</option>
              <option value="1">Block 1</option>
              <option value="2">Block 2</option>
            </Select>
          </FilterField>

          <FilterField label="Cảnh báo học vụ" htmlFor="filter-alert-status">
            <Select
              id="filter-alert-status"
              value={alertStatusParam}
              onChange={(e) => setFilters({ alertStatus: e.target.value })}
            >
              <option value="">Tất cả các lớp</option>
              <option value="has_alerts">Lớp có sinh viên cảnh báo</option>
              <option value="no_alerts">Lớp bình thường (không cảnh báo)</option>
            </Select>
          </FilterField>
        </FilterGrid>

        {hasActiveFilters ? (
          <FilterFooter>
            <span className="text-xs text-muted">Đang lọc:</span>
            {searchParam ? (
              <FilterChip
                label="Từ khóa"
                value={searchParam}
                onRemove={() => {
                  setSearchInput('');
                  setFilters({ search: null });
                }}
              />
            ) : null}
            {blockParam ? (
              <FilterChip
                label="Block"
                value={`Block ${blockParam}`}
                onRemove={() => setFilters({ block: null })}
              />
            ) : null}
            {alertStatusParam ? (
              <FilterChip
                label="Cảnh báo"
                value={alertStatusParam === 'has_alerts' ? 'Có cảnh báo' : 'Không cảnh báo'}
                onRemove={() => setFilters({ alertStatus: null })}
              />
            ) : null}
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setFilters({ search: null, block: null, alertStatus: null });
              }}
              className="ml-auto text-xs font-medium text-fpt-orange hover:underline focus-visible:outline-none"
            >
              Xóa bộ lọc
            </button>
          </FilterFooter>
        ) : null}
      </FilterBar>

      {/* Danh sách lớp học */}
      {!isLoading && filteredSections.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-border bg-white p-12 text-center shadow-[var(--shadow-card)]">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-fpt-blue/10 text-fpt-blue">
            <svg
              className="size-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="1.75"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M3.6 6.5h.01M3.6 12h.01M3.6 17.5h.01"
              />
            </svg>
          </div>
          <h3 className="mt-4 font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900">
            Không tìm thấy lớp học phần nào
          </h3>
          <p className="mt-1 text-sm text-muted">
            {hasActiveFilters
              ? 'Không có lớp học phần nào phù hợp với các điều kiện lọc bạn đã chọn.'
              : `Bạn hiện không phụ trách lớp học phần nào trong học kỳ ${activeTermCode || 'này'}.`}
          </p>
          {hasActiveFilters ? (
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchInput('');
                  setFilters({ search: null, block: null, alertStatus: null });
                }}
              >
                Xóa tất cả bộ lọc
              </Button>
            </div>
          ) : null}
        </div>
      ) : viewMode === 'list' ? (
        /* Dạng Bảng Danh Sách */
        <DataTable
          headers={[
            'Mã lớp',
            'Môn học',
            'Học kỳ & Block',
            'Lịch học',
            'Ca học',
            'Phòng',
            'Giảng viên',
            'Sĩ số',
            'Cảnh báo',
            'Thao tác',
          ]}
          isLoading={isLoading}
          skeletonRows={8}
          isEmpty={!isLoading && filteredSections.length === 0}
          emptyMessage="Không có lớp học phần nào phù hợp."
          fitViewport
          pagination={{
            page: paged.page,
            totalPages: paged.totalPages,
            total: paged.total,
            limit: paged.pageSize,
            onPageChange: paged.setPage,
            onLimitChange: paged.setPageSize,
            pageSizeOptions: [10, 20, 50, 100],
            isLoading,
          }}
        >
          {paged.pageItems.map((section) => {
            const hasAlerts = (section.openAlertCount ?? 0) > 0;
            const studentCount = section._count?.enrollments ?? 0;
            return (
              <tr key={section.id} className="transition-colors hover:bg-surface/50">
                <Td className="font-mono font-bold text-fpt-blue-900">
                  <Link
                    href={`/students?term=${encodeURIComponent(section.term)}&sectionId=${encodeURIComponent(section.id)}`}
                    className="hover:text-fpt-blue hover:underline"
                  >
                    {section.code}
                  </Link>
                </Td>
                <Td>
                  <p className="font-semibold text-ink line-clamp-1">{section.subject?.name ?? '—'}</p>
                  <p className="text-xs text-muted font-mono">
                    {section.subject?.code}
                    {section.subject?.credits ? ` · ${section.subject.credits} tín chỉ` : ''}
                  </p>
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-ink">{section.term}</span>
                    {section.block ? (
                      <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-muted font-medium">
                        Block {section.block}
                      </span>
                    ) : null}
                  </div>
                </Td>
                <Td className="text-xs font-medium text-ink">
                  {formatWeekdays(section.weekdays)}
                </Td>
                <Td className="text-xs text-ink whitespace-nowrap">
                  {formatSlot(section.slot, section.trainingTime)}
                </Td>
                <Td className="text-xs font-medium">
                  {section.room ? (
                    <span className="font-semibold text-fpt-blue-900">{section.room}</span>
                  ) : (
                    <span className="text-muted">Chưa xếp</span>
                  )}
                </Td>
                <Td className="text-xs max-w-[140px] truncate">
                  <span title={section.lecturer?.fullName}>{section.lecturer?.fullName ?? '—'}</span>
                </Td>
                <Td className="whitespace-nowrap tabular-nums">
                  <span className="font-bold text-ink">{studentCount}</span>
                  {section.capacity ? (
                    <span className="text-xs text-muted font-normal">/{section.capacity}</span>
                  ) : null}
                </Td>
                <Td>
                  {hasAlerts ? (
                    <Badge tone="danger" pulse>
                      {section.openAlertCount} cảnh báo
                    </Badge>
                  ) : (
                    <Badge tone="success">Bình thường</Badge>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <Link
                      href={`/class-sections/${section.id}/grades`}
                      className="inline-flex items-center justify-center rounded-[var(--radius-button)] border border-border bg-white px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:bg-surface hover:text-fpt-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-orange"
                    >
                      Bảng điểm
                    </Link>
                    <Link
                      href={`/students?term=${encodeURIComponent(section.term)}&sectionId=${encodeURIComponent(section.id)}`}
                      className="inline-flex items-center justify-center rounded-[var(--radius-button)] bg-fpt-blue px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-fpt-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-orange"
                    >
                      Xem SV ({studentCount})
                    </Link>
                  </div>
                </Td>
              </tr>
            );
          })}
        </DataTable>
      ) : isLoading ? (
        /* Dạng Thẻ — Skeletons */
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="mt-3 h-6 w-3/4" />
              <Skeleton className="mt-2 h-4 w-1/2" />
              <div className="mt-4 rounded-lg bg-surface p-3 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Dạng Thẻ — Danh sách đầy đủ với phân trang 2 đầu */
        <>
          <Pagination
            label="Phân trang lớp học phần (trên)"
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            limit={paged.pageSize}
            onLimitChange={paged.setPageSize}
            pageSizeOptions={[12, 24, 48]}
            isLoading={isLoading}
            onPageChange={paged.setPage}
            position="top"
          />
          <div
            className={`grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 transition-opacity ${
              isFetching ? 'opacity-70' : 'opacity-100'
            }`}
          >
            {paged.pageItems.map((section) => {
              const hasAlerts = (section.openAlertCount ?? 0) > 0;
              const studentCount = section._count?.enrollments ?? 0;

              return (
                <div
                  key={section.id}
                  className="group relative flex flex-col justify-between rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)] transition-all hover:border-fpt-blue/50 hover:shadow-md"
                >
                  <div>
                    {/* Hàng trên cùng: Học kỳ & Trạng thái cảnh báo */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-md bg-surface px-2.5 py-1 text-xs font-semibold text-muted">
                        Kỳ: {section.term}
                      </span>
                      {hasAlerts ? (
                        <Badge tone="danger" pulse>
                          {section.openAlertCount} cảnh báo
                        </Badge>
                      ) : (
                        <Badge tone="success">Bình thường</Badge>
                      )}
                    </div>

                    {/* Mã lớp & Môn học */}
                    <div className="mt-3">
                      <h3 className="font-mono text-lg font-bold text-fpt-blue-900 group-hover:text-fpt-blue transition-colors">
                        {section.code}
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-ink line-clamp-1">
                        {section.subject?.name ?? 'Môn học'}
                      </p>
                      <p className="text-xs text-muted font-mono">
                        {section.subject?.code}
                        {section.subject?.credits ? ` · ${section.subject.credits} tín chỉ` : ''}
                      </p>
                    </div>

                    {/* Khối thông tin lịch học & phòng */}
                    <div className="mt-4 space-y-1.5 rounded-lg border border-border/60 bg-surface/70 p-3 text-xs text-ink">
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Phòng học:</span>
                        <span className="font-semibold text-fpt-blue-900">
                          {section.room || 'Chưa xếp phòng'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-muted">Ca học:</span>
                        <span className="font-medium">
                          {formatSlot(section.slot, section.trainingTime)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-muted">Lịch học:</span>
                        <span className="font-medium">{formatWeekdays(section.weekdays)}</span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-border/40">
                        <span className="text-muted">Sĩ số sinh viên:</span>
                        <span className="font-bold text-fpt-blue-900">
                          {studentCount}
                          {section.capacity ? (
                            <span className="text-muted font-normal"> / {section.capacity}</span>
                          ) : null}{' '}
                          sinh viên
                        </span>
                      </div>

                      {section.lecturer?.fullName ? (
                        <div className="flex items-center justify-between pt-1 border-t border-border/40">
                          <span className="text-muted">Giảng viên:</span>
                          <span className="font-medium text-ink truncate max-w-[150px]">
                            {section.lecturer.fullName}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Các nút hành động */}
                  <div className="mt-5 grid grid-cols-2 gap-2 pt-3 border-t border-border/60">
                    <Link
                      href={`/class-sections/${section.id}/grades`}
                      className="inline-flex items-center justify-center rounded-[var(--radius-button)] border border-border bg-white px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-surface hover:text-fpt-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-orange"
                    >
                      Bảng điểm
                    </Link>
                    <Link
                      href={`/students?term=${encodeURIComponent(section.term)}&sectionId=${encodeURIComponent(section.id)}`}
                      className="inline-flex items-center justify-center rounded-[var(--radius-button)] bg-fpt-blue px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-fpt-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-orange"
                    >
                      Xem sinh viên ({studentCount})
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination
            label="Phân trang lớp học phần"
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            limit={paged.pageSize}
            onLimitChange={paged.setPageSize}
            pageSizeOptions={[12, 24, 48]}
            isLoading={isLoading}
            onPageChange={paged.setPage}
            position="bottom"
          />
        </>
      )}
    </div>
  );
}
