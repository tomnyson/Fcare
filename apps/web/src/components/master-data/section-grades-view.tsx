'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DataTable, Td } from '../ui/data-table';
import { FormError, FormSuccess, Input, Select } from '../ui/form';
import { PageHeader } from '../ui/page-header';
import { ApiError, apiFetch } from '../../lib/api';
import { useMe } from '../../lib/hooks';
import type {
  EnrollmentResult,
  SectionGradeRow,
  SectionGradesResponse,
} from '../../lib/types';

const RESULT_LABELS: Record<EnrollmentResult, string> = {
  IN_PROGRESS: 'Đang học',
  PASS: 'Đạt',
  FAIL: 'Không đạt',
};

// Sửa điểm cần `update MasterData` — chỉ ADMIN và TRAINING_OFFICER (xem
// apps/api/src/casl/ability.factory.ts). Vai trò khác chỉ xem được.
const MANAGER_ROLES = ['ADMIN', 'TRAINING_OFFICER'];

export function SectionGradesView({ sectionId }: { sectionId: string }) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = me?.user.roles.some((role) => MANAGER_ROLES.includes(role)) ?? false;
  const [draft, setDraft] = useState<SectionGradeRow[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const { data, isLoading, isError, error: loadError } = useQuery({
    queryKey: ['section-grades', sectionId],
    queryFn: () => apiFetch<SectionGradesResponse>(`/class-sections/${sectionId}/grades`),
  });

  useEffect(() => {
    if (data) {
      setDraft(data.rows);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ updated: number }>(`/class-sections/${sectionId}/grades`, {
        method: 'PATCH',
        body: JSON.stringify({
          rows: draft.map((row) => ({
            enrollmentId: row.enrollmentId,
            totalScore: row.totalScore,
            result: row.result,
          })),
        }),
      }),
    onSuccess: (result) => {
      setSaved(`Đã lưu ${result.updated} dòng điểm.`);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['section-grades', sectionId] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Lưu thất bại.'),
  });

  function patchRow(enrollmentId: string, patch: Partial<SectionGradeRow>) {
    // Bất biến: tạo mảng và object mới, không sửa tại chỗ.
    setDraft((rows) =>
      rows.map((row) =>
        row.enrollmentId === enrollmentId ? { ...row, ...patch } : row,
      ),
    );
    setSaved('');
  }

  return (
    <>
      <PageHeader
        title={`Điểm lớp ${data?.section.code ?? ''}`}
        description={
          data?.section.subject
            ? `${data.section.subject.code} — ${data.section.subject.name} · Học kỳ ${data.section.term}`
            : 'Chỉ nhập điểm tổng kết và kết quả; hệ thống không lưu điểm thành phần.'
        }
        actions={
          canManage ? (
            <Button
              type="button"
              disabled={save.isPending || draft.length === 0}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Đang lưu…' : 'Lưu bảng điểm'}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 space-y-2">
        {isError ? (
          <FormError>
            {loadError instanceof ApiError
              ? loadError.message
              : 'Không tải được bảng điểm lớp này.'}
          </FormError>
        ) : null}
        <FormError>{error}</FormError>
        <FormSuccess>{saved}</FormSuccess>
      </div>

      <DataTable
        headers={['MSSV', 'Họ tên', 'Điểm tổng kết', 'Kết quả']}
        isEmpty={!isLoading && !isError && draft.length === 0}
        emptyMessage="Lớp chưa có sinh viên ghi danh."
      >
        {draft.map((row) => (
          <tr key={row.enrollmentId}>
            <Td className="font-semibold text-ink">{row.studentCode}</Td>
            <Td>{row.fullName}</Td>
            <Td>
              <Input
                type="number"
                min={0}
                max={10}
                step={0.1}
                aria-label={`Điểm tổng kết của ${row.studentCode}`}
                value={row.totalScore ?? ''}
                disabled={!canManage}
                onChange={(event) =>
                  patchRow(row.enrollmentId, {
                    totalScore:
                      event.target.value === '' ? null : Number(event.target.value),
                  })
                }
                className="max-w-28"
              />
            </Td>
            <Td>
              <Select
                aria-label={`Kết quả của ${row.studentCode}`}
                value={row.result}
                disabled={!canManage}
                onChange={(event) =>
                  patchRow(row.enrollmentId, {
                    result: event.target.value as EnrollmentResult,
                  })
                }
                className="max-w-40"
              >
                {Object.entries(RESULT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
