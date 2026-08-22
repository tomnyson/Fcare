'use client';

import { Badge } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AlertsTab } from '../../../../components/students/alerts-tab';
import { CareLogsTab } from '../../../../components/students/care-logs-tab';
import { EnrollmentsTab } from '../../../../components/students/enrollments-tab';
import { EvaluationsTab } from '../../../../components/students/evaluations-tab';
import { PageHeader } from '../../../../components/ui/page-header';
import { apiFetch } from '../../../../lib/api';
import { useMe } from '../../../../lib/hooks';
import {
  formatDate,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_TONES,
} from '../../../../lib/labels';
import type { Student } from '../../../../lib/types';

const TABS = [
  { key: 'enrollments', label: 'Học phần & điểm' },
  { key: 'evaluations', label: 'Đánh giá' },
  { key: 'care-logs', label: 'Nhật ký chăm sóc' },
  { key: 'alerts', label: 'Cảnh báo' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;
  const [tab, setTab] = useState<TabKey>('enrollments');
  const { data: me } = useMe();

  const { data: student, isLoading } = useQuery({
    queryKey: ['students', studentId],
    queryFn: () => apiFetch<Student>(`/students/${studentId}`),
  });

  if (isLoading || !student || !me) {
    return (
      <p role="status" className="text-sm text-muted">
        Đang tải hồ sơ sinh viên…
      </p>
    );
  }

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

      <dl className="mb-6 grid gap-4 rounded-[var(--radius-card)] border border-border bg-white p-5 text-sm shadow-[var(--shadow-card)] sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">Ngày sinh</dt>
          <dd className="mt-1 font-medium text-ink">{formatDate(student.dateOfBirth)}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">Giới tính</dt>
          <dd className="mt-1 font-medium text-ink">{student.gender ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">Khóa</dt>
          <dd className="mt-1 font-medium text-ink">{student.cohort}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">Bộ môn</dt>
          <dd className="mt-1 font-medium text-ink">{student.department?.name ?? '—'}</dd>
        </div>
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
          </button>
        ))}
      </div>

      {tab === 'enrollments' ? <EnrollmentsTab studentId={studentId} /> : null}
      {tab === 'evaluations' ? <EvaluationsTab studentId={studentId} user={me.user} /> : null}
      {tab === 'care-logs' ? <CareLogsTab studentId={studentId} /> : null}
      {tab === 'alerts' ? <AlertsTab studentId={studentId} user={me.user} /> : null}
    </>
  );
}
