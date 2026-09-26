'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { careSectionGroups, termSectionGroup, type CareSectionGroup } from '../../lib/care-context';
import type { Enrollment } from '../../lib/types';

/**
 * Lớp học phần sinh viên đang học trong kỳ, đặt trên thẻ hồ sơ để giảng viên
 * nào mở hồ sơ cũng thấy: kỳ nào, môn gì, ai dạy — trước khi đọc trao đổi,
 * nhận xét hay nhật ký chăm sóc.
 */
export function TermSectionList({ group, meId }: { group: CareSectionGroup; meId: string }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
        Lớp học phần
        <span className="rounded-full bg-fpt-orange-50 px-2 py-0.5 normal-case tracking-normal text-fpt-orange-600 ring-1 ring-fpt-orange/30 ring-inset">
          Học kỳ {group.term}
        </span>
      </dt>
      <dd className="mt-2">
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {group.sections.map((section) => {
            const mine = section.lecturerId !== null && section.lecturerId === meId;
            return (
              <li key={section.id} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-mono text-xs font-medium text-muted">{section.code}</span>
                <span className="font-medium text-ink">{section.subject?.name ?? '—'}</span>
                <span className={mine ? 'font-semibold text-fpt-orange-600' : 'text-muted'}>
                  · {section.lecturer?.fullName ?? 'Chưa phân công GV'}
                  {mine ? ' (Bạn dạy)' : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </dd>
    </div>
  );
}

export function TermSectionsCard({
  studentId,
  term,
  meId,
}: {
  studentId: string;
  term: string;
  meId: string;
}) {
  const { data: enrollments, isError } = useQuery({
    queryKey: ['enrollments', studentId],
    queryFn: () => apiFetch<Enrollment[]>(`/enrollments?studentId=${studentId}`),
  });
  if (isError) {
    return <p className="text-xs text-muted sm:col-span-2">Không tải được danh sách lớp học phần.</p>;
  }
  const group = termSectionGroup(careSectionGroups(enrollments ?? []), term);
  if (!group) return null;
  return (
    <div className="border-t border-border pt-4 sm:col-span-2">
      <TermSectionList group={group} meId={meId} />
    </div>
  );
}
