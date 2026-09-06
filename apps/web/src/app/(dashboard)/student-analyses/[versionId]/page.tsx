'use client';

import { Badge } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { PageSkeleton } from '../../../../components/dashboard/shell-skeleton';
import { PageHeader } from '../../../../components/ui/page-header';
import { FormError } from '../../../../components/ui/form';
import { apiFetch, ApiError } from '../../../../lib/api';
import { formatDateTime } from '../../../../lib/labels';
import type { StudentTermAnalysisDetail } from '../../../../lib/types';
import {
  ANALYSIS_RISK_LABELS,
  ANALYSIS_STATUS_LABELS,
} from '../../../../components/students/student-analysis-helpers';

const STATUS_TONES = {
  QUEUED: 'info',
  GENERATING: 'info',
  DRAFT: 'warning',
  FAILED: 'danger',
  SUPERSEDED: 'neutral',
  SEND_QUEUED: 'info',
  SENT: 'success',
} as const;

export default function StudentAnalysisDetailPage() {
  const params = useParams<{ versionId: string }>();
  const versionId = params.versionId;
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['student-analysis-page', versionId],
    queryFn: () => apiFetch<StudentTermAnalysisDetail>(`/term-analysis-versions/${versionId}`),
  });

  if (isError) {
    return (
      <FormError>
        {error instanceof ApiError ? error.message : 'Không tải được bản phân tích.'}
      </FormError>
    );
  }

  if (isLoading || !data) {
    return (
      <div role="status" aria-busy aria-label="Đang tải bản phân tích">
        <PageSkeleton />
      </div>
    );
  }

  const output = data.editedOutput;
  if (!output) {
    return (
      <>
        <PageHeader
          title={`Phân tích AI · ${data.student.fullName}`}
          description={`${data.student.studentCode} · Học kỳ ${data.term}`}
          actions={
            <Badge tone={STATUS_TONES[data.status]}>{ANALYSIS_STATUS_LABELS[data.status]}</Badge>
          }
        />
        <section className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <p className="text-sm font-semibold text-ink">
            {data.status === 'FAILED'
              ? 'Không thể tạo bản phân tích'
              : 'Bản phân tích đang được xử lý'}
          </p>
          <p className="mt-2 text-sm text-muted">
            {data.errorMessage ?? 'Vui lòng quay lại sau khi tác vụ nền hoàn tất.'}
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Phân tích AI · ${data.student.fullName}`}
        description={`${data.student.studentCode} · Học kỳ ${data.term}`}
        actions={
          <Badge tone={STATUS_TONES[data.status]}>{ANALYSIS_STATUS_LABELS[data.status]}</Badge>
        }
      />

      <div className="space-y-5">
        <section className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-ink">
              Mức rủi ro {ANALYSIS_RISK_LABELS[output.riskLevel]}
            </p>
            {data.sentAt ? (
              <p className="text-sm text-muted">Đã gửi lúc {formatDateTime(data.sentAt)}</p>
            ) : null}
          </div>
          <p className="mt-2 rounded-lg border border-fpt-blue/10 bg-fpt-blue-50 px-4 py-3 text-sm text-ink">
            {data.disclaimer ?? 'Nội dung AI chỉ mang tính hỗ trợ và đã được giảng viên duyệt.'}
          </p>
          <p className="mt-4 whitespace-pre-wrap text-sm text-ink">{output.summary}</p>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold text-ink">Điểm mạnh</p>
            <ul className="mt-3 space-y-2 text-sm text-ink">
              {output.strengths.map((item) => (
                <li key={item} className="rounded-lg border border-border bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold text-ink">Khuyến nghị</p>
            <ul className="mt-3 space-y-2 text-sm text-ink">
              {output.recommendations.map((item) => (
                <li key={item} className="rounded-lg border border-border bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold text-ink">Xu hướng</p>
            <div className="mt-3 space-y-3">
              {output.trends.map((item) => (
                <div
                  key={`${item.finding}-${item.evidence}`}
                  className="rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-ink">{item.finding}</p>
                  <p className="mt-1 text-muted">{item.evidence}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold text-ink">Yếu tố rủi ro</p>
            <div className="mt-3 space-y-3">
              {output.riskFactors.map((item) => (
                <div
                  key={`${item.finding}-${item.evidence}`}
                  className="rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-ink">{item.finding}</p>
                  <p className="mt-1 text-muted">{item.evidence}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] border border-border bg-white p-5 shadow-[var(--shadow-card)]">
          <p className="text-sm font-semibold text-ink">Giới hạn dữ liệu</p>
          <ul className="mt-3 space-y-2 text-sm text-ink">
            {output.dataLimitations.map((item) => (
              <li key={item} className="rounded-lg border border-border bg-slate-50 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
          {data.sender ? (
            <p className="mt-4 text-sm text-muted">
              Người gửi: {data.sender.fullName} ({data.sender.staffCode})
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}
