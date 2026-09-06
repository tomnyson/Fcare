'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, Td } from '../ui/data-table';
import { FormError, FormSuccess, Input, Select } from '../ui/form';
import { PageHeader } from '../ui/page-header';
import { ApiError, apiFetch } from '../../lib/api';
import { ALERT_LEVEL_LABELS, ALERT_LEVEL_TONES } from '../../lib/labels';
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

// Phải khớp @ArrayMaxSize(200) ở apps/api/src/modules/master-data/dto/section-grades.dto.ts —
// đổi một bên thì đổi cả hai.
const GRADE_BATCH_SIZE = 200;

interface GradeRowPayload {
  enrollmentId: string;
  totalScore: number | null;
  result: EnrollmentResult;
}

/** Làm tròn 2 chữ số — khớp @IsNumber({ maxDecimalPlaces: 2 }) ở DTO. Parser
 * gradebook ghi float thô (vd 8.116666666666667) nên phải làm tròn trước khi
 * gửi lại, kể cả khi người dùng không đụng vào ô điểm đó. */
function roundScore(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function toGradePayload(row: SectionGradeRow): GradeRowPayload {
  return {
    enrollmentId: row.enrollmentId,
    totalScore: roundScore(row.totalScore),
    result: row.result,
  };
}

function hasRowChanged(draftRow: SectionGradeRow, original: SectionGradeRow | undefined): boolean {
  if (!original) return false;
  return (
    roundScore(draftRow.totalScore) !== roundScore(original.totalScore) ||
    draftRow.result !== original.result
  );
}

/** Một lô lỗi giữa chừng: dừng lại, giữ số dòng đã lưu được trước đó để báo
 * cho người dùng — không âm thầm mất phần còn lại. */
class GradeBatchSaveError extends Error {
  constructor(
    public readonly savedSoFar: number,
    public readonly totalRows: number,
    public readonly sourceError: unknown,
    public readonly failedBatch: GradeRowPayload[],
  ) {
    super('grade-batch-save-failed');
  }
}

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

  // Chỉ gửi dòng đã sửa so với dữ liệu gốc từ query — gửi nguyên cả lớp làm
  // 400 toàn bộ khi lớp > 200 SV (F1) hoặc khi một dòng không đụng tới có
  // điểm thô nhiều chữ số thập phân từ gradebook (F2).
  const originalById = useMemo(() => {
    const rows = data?.rows ?? [];
    return new Map(rows.map((row) => [row.enrollmentId, row]));
  }, [data]);

  const changedRows = useMemo(
    () => draft.filter((row) => hasRowChanged(row, originalById.get(row.enrollmentId))),
    [draft, originalById],
  );

  const save = useMutation({
    mutationFn: async () => {
      const rows = changedRows.map(toGradePayload);
      let updated = 0;
      for (let start = 0; start < rows.length; start += GRADE_BATCH_SIZE) {
        const batch = rows.slice(start, start + GRADE_BATCH_SIZE);
        try {
          const result = await apiFetch<{ updated: number }>(
            `/class-sections/${sectionId}/grades`,
            { method: 'PATCH', body: JSON.stringify({ rows: batch }) },
          );
          updated += result.updated;
        } catch (sourceError) {
          throw new GradeBatchSaveError(updated, rows.length, sourceError, batch);
        }
      }
      return updated;
    },
    onSuccess: (updated) => {
      const message = `Đã lưu ${updated} dòng điểm.`;
      setSaved(message);
      toast.success(message);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['section-grades', sectionId] });
    },
    onError: (err) => {
      setSaved('');
      if (err instanceof GradeBatchSaveError) {
        let message =
          err.sourceError instanceof ApiError ? err.sourceError.message : 'Lưu thất bại.';
        
        if (err.failedBatch) {
          message = message.replace(/rows\.(\d+)\.([a-zA-Z]+)([^,]*)/g, (match, idxStr, field, suffix) => {
            const idx = parseInt(idxStr, 10);
            const failedPayload = err.failedBatch[idx];
            const student = failedPayload ? draft.find(r => r.enrollmentId === failedPayload.enrollmentId) : null;
            const svCode = student ? student.studentCode : `dòng ${idx + 1}`;
            
            const fieldName = field === 'totalScore' ? 'Điểm tổng kết' : field === 'result' ? 'Kết quả' : field;
            
            let viSuffix = suffix;
            if (suffix.includes('must not be less than 0')) viSuffix = ' không được nhỏ hơn 0';
            else if (suffix.includes('must not be greater than 10')) viSuffix = ' không được lớn hơn 10';
            else if (suffix.includes('must be a number')) viSuffix = ' phải là một số';
            
            return `${fieldName} của sinh viên ${svCode}${viSuffix}`;
          });
        }

        setError(
          `${message}. Đã lưu được ${err.savedSoFar}/${err.totalRows} dòng trước khi lỗi.`,
        );
        if (err.savedSoFar > 0) {
          queryClient.invalidateQueries({ queryKey: ['section-grades', sectionId] });
        }
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Lưu thất bại.');
    },
  });

  function handleSave() {
    if (changedRows.length === 0) {
      setError('');
      setSaved('Chưa có thay đổi nào.');
      return;
    }
    setSaved('');
    save.mutate();
  }

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
              onClick={handleSave}
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
        headers={['MSSV', 'Họ tên', 'Cảnh báo', 'Điểm tổng kết', 'Kết quả']}
        isLoading={isLoading}
        skeletonRows={8}
        isEmpty={!isLoading && !isError && draft.length === 0}
        emptyMessage="Lớp chưa có sinh viên ghi danh."
      >
        {draft.map((row) => (
          <tr key={row.enrollmentId}>
            <Td className="font-semibold text-ink">{row.studentCode}</Td>
            <Td>{row.fullName}</Td>
            <Td>
              {row.alertLevel === null ? (
                <span className="text-muted">—</span>
              ) : (
                <Badge tone={ALERT_LEVEL_TONES[row.alertLevel] ?? 'info'}>
                  Mức {row.alertLevel} — {ALERT_LEVEL_LABELS[row.alertLevel] ?? row.alertLevel}
                </Badge>
              )}
            </Td>
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
