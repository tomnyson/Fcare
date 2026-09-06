'use client';

import { Badge } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { DataTable, Td } from '../ui/data-table';
import { apiFetch } from '../../lib/api';
import { ENROLLMENT_RESULT_LABELS } from '../../lib/labels';
import type { Enrollment } from '../../lib/types';

const RESULT_TONES = { PASS: 'success', FAIL: 'danger', IN_PROGRESS: 'info' } as const;

function score(value: number | null): string {
  return value === null ? '—' : value.toString();
}

export function EnrollmentsTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['enrollments', studentId],
    queryFn: () => apiFetch<Enrollment[]>(`/enrollments?studentId=${studentId}`),
  });

  return (
    <DataTable
      headers={['Lớp học phần', 'Môn', 'Học kỳ', 'Chuyên cần', 'Giữa kỳ', 'Cuối kỳ', 'Tổng kết', 'Cấm thi', 'Kết quả']}
      isLoading={isLoading}
      skeletonRows={5}
      isEmpty={!isLoading && (data?.length ?? 0) === 0}
      emptyMessage="Sinh viên chưa đăng ký lớp học phần nào."
    >
      {(data ?? []).map((enrollment) => (
        <tr key={enrollment.id}>
          <Td className="font-semibold text-ink">{enrollment.classSection?.code ?? '—'}</Td>
          <Td>{enrollment.classSection?.subject?.name ?? '—'}</Td>
          <Td>{enrollment.classSection?.term ?? '—'}</Td>
          <Td>{enrollment.attendanceRate === null ? '—' : `${enrollment.attendanceRate}%`}</Td>
          <Td>{score(enrollment.midtermScore)}</Td>
          <Td>{score(enrollment.finalScore)}</Td>
          <Td className="font-semibold">{score(enrollment.totalScore)}</Td>
          <Td>{enrollment.isExamBanned ? <Badge tone="danger">Cấm thi</Badge> : '—'}</Td>
          <Td>
            <Badge tone={RESULT_TONES[enrollment.result]}>
              {ENROLLMENT_RESULT_LABELS[enrollment.result]}
            </Badge>
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}
