'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import { FilterBar, FilterField, FilterFooter, FilterGrid } from '../ui/filter-bar';
import { FormError, Select } from '../ui/form';
import { PageHeader } from '../ui/page-header';
import { ClassesTable } from './classes-table';
import { DepartmentsTable } from './departments-table';
import { LecturersTable } from './lecturers-table';
import { SubjectsTable } from './subjects-table';
import { ApiError, apiFetch } from '../../lib/api';
import {
  buildStatisticsQuery,
  CLASS_BLOCKS,
  parseBlockParam,
  STATISTICS_TABS,
  statisticsTabHref,
  visibleStatisticsTabs,
  type StatisticsTabKey,
} from '../../lib/statistics-view';
import type {
  ClassStatistics,
  DepartmentStatistics,
  LecturerStatistics,
  StudentFilterOptions,
  SubjectStatistics,
} from '../../lib/types';
import { CareTable } from './care-table';
import { canViewCareStatistics } from '../../lib/care-statistics';
import { useMe } from '../../lib/hooks';
import { useCurrentTerm } from '../../lib/use-current-term';

// Dùng chung queryKey với /students và /alerts nên danh mục kỳ chỉ tải một lần.
const FILTER_OPTIONS_STALE_MS = 5 * 60_000;

function StatisticsContent({ tab }: { tab: StatisticsTabKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const term = params.get('term') ?? '';
  // Block chỉ có nghĩa với lớp học phần — tab khác bỏ qua dù URL còn giữ.
  const block = tab === 'classes' ? parseBlockParam(params.get('block')) : '';
  const { data: me } = useMe();
  const roles = me?.user.roles ?? [];
  const canViewCare = canViewCareStatistics(roles);
  const { data: currentTerm } = useCurrentTerm();
  const hasInitializedTermRef = useRef(false);

  const setView = useCallback(
    (patch: { term?: string | null; block?: string | null }) => {
      const next = new URLSearchParams(params.toString());
      for (const key of ['term', 'block'] as const) {
        const value = patch[key];
        if (value === undefined) continue;
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
      setView({ term: currentTerm.code });
    }
  }, [currentTerm?.code, params, setView]);

  const options = useQuery({
    queryKey: ['student-filter-options'],
    queryFn: () => apiFetch<StudentFilterOptions>('/students/filter-options'),
    staleTime: FILTER_OPTIONS_STALE_MS,
  });

  const active = STATISTICS_TABS.find((item) => item.key === tab) ?? STATISTICS_TABS[0];

  // Một truy vấn duy nhất theo tab đang mở: đổi tab không tải lại ba bảng kia.
  const stats = useQuery({
    queryKey: ['statistics', tab, term, block],
    enabled: tab !== 'care',
    queryFn: () =>
      apiFetch<
        ClassStatistics[] | DepartmentStatistics[] | SubjectStatistics[] | LecturerStatistics[]
      >(`${active.endpoint}${buildStatisticsQuery(term, block)}`),
  });

  return (
    <>
      <PageHeader
        title="Thống kê"
        description="Số liệu học vụ theo lớp học phần, bộ môn, môn học và giáo viên — trong phạm vi bạn được phép truy cập."
      />

      {/* Tab Bộ môn là ảnh chụp trạng thái sinh viên, không theo kỳ — `/statistics/departments` không nhận `term`, nên ẩn bộ lọc để người dùng không tưởng số liệu bị đứng. */}
      {active.key !== 'departments' ? (
        <FilterBar label="Bộ lọc thống kê" onSubmit={(event) => event.preventDefault()}>
          <FilterGrid>
            <FilterField label="Học kỳ" htmlFor="stats-term">
              <Select
                id="stats-term"
                value={term}
                onChange={(event) => setView({ term: event.target.value || null })}
              >
                <option value="">{tab === 'care' ? 'Chọn học kỳ' : 'Tất cả học kỳ'}</option>
                {(options.data?.terms ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </FilterField>
            {tab === 'classes' ? (
              <FilterField label="Block" htmlFor="stats-block">
                <Select
                  id="stats-block"
                  value={block}
                  onChange={(event) => setView({ block: event.target.value || null })}
                >
                  <option value="">Tất cả block</option>
                  {CLASS_BLOCKS.map((item) => (
                    <option key={item} value={item}>
                      Block {item}
                    </option>
                  ))}
                </Select>
              </FilterField>
            ) : null}
          </FilterGrid>
          {options.isError ? (
            <FilterFooter>
              <p className="text-sm text-danger">
                {tab === 'care'
                  ? 'Không tải được danh mục học kỳ.'
                  : 'Không tải được danh mục học kỳ — bảng bên dưới đang hiển thị toàn bộ các kỳ.'}
              </p>
            </FilterFooter>
          ) : null}
        </FilterBar>
      ) : null}

      {/* Mỗi tab là một route con (`/statistics/{tab}`) — trùng với các mục con của menu Thống kê. */}
      <nav aria-label="Chiều thống kê" className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {visibleStatisticsTabs(roles).map((item) => (
          <Link
            key={item.key}
            href={statisticsTabHref(item.key, term)}
            aria-current={tab === item.key ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue ${
              tab === item.key
                ? 'border-fpt-orange text-fpt-orange-600'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === 'care' ? (
        canViewCare ? (
          <CareTable key={term} term={term} />
        ) : (
          <FormError>Bạn không có quyền xem thống kê chăm sóc sinh viên.</FormError>
        )
      ) : stats.isError ? (
        <FormError>
          {stats.error instanceof ApiError
            ? stats.error.message
            : `Không tải được thống kê ${active.label.toLowerCase()}.`}
        </FormError>
      ) : (
        <>
          {tab === 'classes' ? (
            <ClassesTable
              rows={(stats.data as ClassStatistics[]) ?? []}
              isLoading={stats.isLoading}
            />
          ) : null}
          {tab === 'departments' ? (
            <DepartmentsTable
              rows={(stats.data as DepartmentStatistics[]) ?? []}
              isLoading={stats.isLoading}
            />
          ) : null}
          {tab === 'subjects' ? (
            <SubjectsTable
              rows={(stats.data as SubjectStatistics[]) ?? []}
              isLoading={stats.isLoading}
            />
          ) : null}
          {tab === 'lecturers' ? (
            <LecturersTable
              rows={(stats.data as LecturerStatistics[]) ?? []}
              isLoading={stats.isLoading}
            />
          ) : null}
        </>
      )}
    </>
  );
}

export function StatisticsView({ tab }: { tab: StatisticsTabKey }) {
  // useSearchParams bắt buộc phải nằm trong Suspense ở App Router.
  return (
    <Suspense fallback={null}>
      <StatisticsContent tab={tab} />
    </Suspense>
  );
}
