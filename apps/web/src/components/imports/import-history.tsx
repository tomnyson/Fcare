'use client';

import { Badge } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { DataTable, Td } from '../ui/data-table';
import { apiFetch } from '../../lib/api';
import { formatDate } from '../../lib/labels';
import { IMPORT_KINDS } from '../../lib/import-kinds';
import type { ImportBatchSummary, ImportStatus } from '../../lib/types';

const STATUS_LABELS: Record<ImportStatus, string> = {
  PENDING: 'Chờ xác nhận',
  COMMITTED: 'Đã ghi',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã huỷ',
};

const STATUS_TONES: Record<ImportStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  COMMITTED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

const KIND_LABELS: Record<string, string> = Object.fromEntries(
  IMPORT_KINDS.map((kind) => [kind.slug.toUpperCase(), kind.label]),
);

export function ImportHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: () => apiFetch<ImportBatchSummary[]>('/imports'),
  });

  return (
    <section aria-labelledby="history-heading" className="mt-10">
      <h2
        id="history-heading"
        className="mb-3 font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900"
      >
        Lịch sử import
      </h2>
      <DataTable
        headers={['Thời điểm', 'Loại', 'Học kỳ', 'File', 'Dòng', 'Lỗi', 'Trạng thái']}
        isEmpty={!isLoading && (data?.length ?? 0) === 0}
        emptyMessage="Chưa có lượt import nào."
      >
        {(data ?? []).map((batch) => (
          <tr key={batch.id} className="transition-colors hover:bg-fpt-orange-50/40">
            <Td className="whitespace-nowrap text-muted">{formatDate(batch.createdAt)}</Td>
            <Td>{KIND_LABELS[batch.kind] ?? batch.kind}</Td>
            <Td>{batch.term}</Td>
            <Td className="max-w-xs truncate">{batch.fileName}</Td>
            <Td>{batch.summary.totalRows}</Td>
            <Td className={batch.summary.errorCount > 0 ? 'text-danger' : undefined}>
              {batch.summary.errorCount}
            </Td>
            <Td>
              <Badge tone={STATUS_TONES[batch.status]}>{STATUS_LABELS[batch.status]}</Badge>
            </Td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
