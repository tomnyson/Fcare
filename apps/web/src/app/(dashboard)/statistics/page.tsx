'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import {
  FilterBar,
  FilterField,
  FilterFooter,
  FilterGrid,
} from '../../../components/ui/filter-bar';
import { FormError, Select } from '../../../components/ui/form';
import { PageHeader } from '../../../components/ui/page-header';
import { ClassesTable } from '../../../components/statistics/classes-table';
import { DepartmentsTable } from '../../../components/statistics/departments-table';
import { LecturersTable } from '../../../components/statistics/lecturers-table';
import { SubjectsTable } from '../../../components/statistics/subjects-table';
import { ApiError, apiFetch } from '../../../lib/api';
import {
  buildStatisticsQuery,
  parseStatisticsView,
  STATISTICS_TABS,
  type StatisticsTabKey,
} from '../../../lib/statistics-view';
import type {
  ClassStatistics,
  DepartmentStatistics,
  LecturerStatistics,
  StudentFilterOptions,
  SubjectStatistics,
} from '../../../lib/types';
import { useCurrentTerm } from '../../../lib/use-current-term';

// Dùng chung queryKey với /students và /alerts nên danh mục kỳ chỉ tải một lần.
const FILTER_OPTIONS_STALE_MS = 5 * 60_000;

function StatisticsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { tab, term } = parseStatisticsView(params);
  const { data: currentTerm } = useCurrentTerm();
  const hasInitializedTermRef = useRef(false);

  useEffect(() => {
    if (!hasInitializedTermRef.current && !params.has('term') && currentTerm?.code) {
      hasInitializedTermRef.current = true;
      setView({ term: currentTerm.code });
    }
  }, [currentTerm?.code, params]);

  function setView(patch: { tab?: StatisticsTabKey; term?: string | null }) {
    const next = new URLSearchParams(params.toString());
    if (patch.tab) next.set('tab', patch.tab);
    if (patch.term !== undefined) {
      if (patch.term) next.set('term', patch.term);
      else next.delete('term');
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const options = useQuery({
    queryKey: ['student-filter-options'],
    queryFn: () => apiFetch<StudentFilterOptions>('/students/filter-options'),
    staleTime: FILTER_OPTIONS_STALE_MS,
  });

  const active = STATISTICS_TABS.find((item) => item.key === tab) ?? STATISTICS_TABS[0];

  // Một truy vấn duy nhất theo tab đang mở: đổi tab không tải lại ba bảng kia.
  const stats = useQuery({
    queryKey: ['statistics', tab, term],
    queryFn: () =>
      apiFetch<
        ClassStatistics[] | DepartmentStatistics[] | SubjectStatistics[] | LecturerStatistics[]
      >(`${active.endpoint}${buildStatisticsQuery(term)}`),
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
                <option value="">Tất cả học kỳ</option>
                {(options.data?.terms ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FilterGrid>
          {options.isError ? (
            <FilterFooter>
              <p className="text-sm text-danger">
                Không tải được danh mục học kỳ — bảng bên dưới đang hiển thị toàn bộ các kỳ.
              </p>
            </FilterFooter>
          ) : null}
        </FilterBar>
      ) : null}

      <div
        role="tablist"
        aria-label="Chiều thống kê"
        className="mb-5 flex flex-wrap gap-1 border-b border-border"
      >
        {STATISTICS_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setView({ tab: item.key })}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-[var(--duration-fast)] ${
              tab === item.key
                ? 'border-fpt-orange text-fpt-orange-600'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {stats.isError ? (
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

export default function StatisticsPage() {
  // useSearchParams bắt buộc phải nằm trong Suspense ở App Router.
  return (
    <Suspense fallback={null}>
      <StatisticsPageContent />
    </Suspense>
  );
}
