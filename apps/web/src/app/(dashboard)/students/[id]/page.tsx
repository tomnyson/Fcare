'use client';

import { Badge } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AlertsTab } from '../../../../components/students/alerts-tab';
import { CareLogsTab } from '../../../../components/students/care-logs-tab';
import { DiscussionTab } from '../../../../components/students/discussion-tab';
import { EnrollmentsTab } from '../../../../components/students/enrollments-tab';
import { TermSectionsCard } from '../../../../components/students/term-sections-card';
import {
  EvaluationsTab,
  type EvaluateRequest,
} from '../../../../components/students/evaluations-tab';
import { PageHeader } from '../../../../components/ui/page-header';
import { apiFetch } from '../../../../lib/api';
import { countUnread } from '../../../../lib/discussion';
import { useDiscussion, useMe } from '../../../../lib/hooks';
import { canEvaluateSection } from '../../../../lib/evaluation-access';
import { STUDENT_STATUS_LABELS, STUDENT_STATUS_TONES } from '../../../../lib/labels';
import type { Student } from '../../../../lib/types';
import { PageSkeleton } from '../../../../components/dashboard/shell-skeleton';

const TABS = [
  { key: 'enrollments', label: 'Học phần & điểm' },
  { key: 'evaluations', label: 'Nhận xét' },
  { key: 'care-logs', label: 'Nhật ký chăm sóc' },
  { key: 'alerts', label: 'Cảnh báo' },
  { key: 'discussion', label: 'Trao đổi' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function StudentDetailContent() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;
  // Thông báo trao đổi trỏ tới `/students/:id?tab=discussion` — mở đúng tab ngay.
  const search = useSearchParams();
  const requested = search.get('tab');
  const requestedTerm = search.get('term') ?? '';
  const requestedSection = search.get('section') ?? '';
  const [tab, setTab] = useState<TabKey>(
    TABS.some((item) => item.key === requested) ? (requested as TabKey) : 'enrollments',
  );
  // Liên kết `?tab=evaluations&term=…&section=…` mở thẳng form của lớp đó.
  const [evaluateRequest, setEvaluateRequest] = useState<EvaluateRequest | null>(() =>
    requested === 'evaluations' && requestedTerm && requestedSection
      ? { term: requestedTerm, sectionId: requestedSection, nonce: 0 }
      : null,
  );
  const { data: me } = useMe();
  const discussion = useDiscussion(studentId);

  const { data: student, isLoading } = useQuery({
    queryKey: ['students', studentId],
    queryFn: () => apiFetch<Student>(`/students/${studentId}`),
  });

  if (isLoading || !student || !me) {
    return (
      <div role="status" aria-busy aria-label="Đang tải hồ sơ sinh viên">
        <PageSkeleton />
      </div>
    );
  }

  const unreadDiscussion = countUnread(
    discussion.data?.messages ?? [],
    discussion.data?.lastReadAt ?? null,
    me.user.id,
  );

  return (
    <>
      <PageHeader
        title={`${student.fullName}`}
        description={`${student.studentCode} · Lớp ${student.classCode} · ${student.major?.name ?? ''} (${student.department?.name ?? ''})`}
        actions={
          <Badge tone={STUDENT_STATUS_TONES[student.status]}>
            {STUDENT_STATUS_LABELS[student.status]}
          </Badge>
        }
      />

      <dl className="mb-6 grid gap-4 rounded-[var(--radius-card)] border border-border bg-white p-5 text-sm shadow-[var(--shadow-card)] sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">Khóa</dt>
          <dd className="mt-1 font-medium text-ink">{student.cohort ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">Bộ môn</dt>
          <dd className="mt-1 font-medium text-ink">{student.department?.name ?? '—'}</dd>
        </div>
        <TermSectionsCard studentId={studentId} term={requestedTerm} meId={me.user.id} />
      </dl>

      <div role="tablist" aria-label="Hồ sơ sinh viên" className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === item.key
                ? 'border-fpt-orange text-fpt-orange'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {item.label}
            {item.key === 'discussion' && unreadDiscussion > 0 ? (
              <span
                aria-live="polite"
                aria-label={`${unreadDiscussion} tin chưa đọc`}
                className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-fpt-orange px-1.5 py-0.5 text-xs font-bold leading-none text-white"
              >
                {unreadDiscussion}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'enrollments' ? (
        <EnrollmentsTab
          studentId={studentId}
          canEvaluate={(enrollment) =>
            enrollment.classSection !== undefined &&
            canEvaluateSection(me.user, enrollment.classSection)
          }
          onEvaluate={(enrollment) => {
            if (!enrollment.classSection) return;
            setEvaluateRequest({
              term: enrollment.classSection.term,
              sectionId: enrollment.classSection.id,
              nonce: Date.now(),
            });
            setTab('evaluations');
          }}
        />
      ) : null}
      {tab === 'evaluations' ? (
        <EvaluationsTab
          studentId={studentId}
          user={me.user}
          initialTerm={requestedTerm}
          evaluateRequest={evaluateRequest}
        />
      ) : null}
      {tab === 'care-logs' ? <CareLogsTab studentId={studentId} term={requestedTerm} /> : null}
      {tab === 'alerts' ? <AlertsTab studentId={studentId} user={me.user} /> : null}
      {tab === 'discussion' ? (
        <DiscussionTab studentId={studentId} currentStaffId={me.user.id} />
      ) : null}
    </>
  );
}

export default function StudentDetailPage() {
  // useSearchParams bắt buộc phải nằm trong Suspense ở App Router.
  return (
    <Suspense fallback={null}>
      <StudentDetailContent />
    </Suspense>
  );
}
