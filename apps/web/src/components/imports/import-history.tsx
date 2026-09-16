'use client';

import { Badge } from '@fcare/ui-kit';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, Td } from '../ui/data-table';
import { Pagination } from '../ui/pagination';
import { FormError } from '../ui/form';
import { ApiError, apiFetch } from '../../lib/api';
import { formatDateTime } from '../../lib/labels';
import { IMPORT_KIND_LABEL_BY_KIND } from '../../lib/import-kinds';
import { pageCount } from '../../lib/pagination';
import type { ImportBatchSummary, ImportStatus, Paginated } from '../../lib/types';

/** Số lô mỗi trang — lịch sử có thể tới hàng trăm lô sau vài kỳ. */
const PAGE_SIZE = 20;

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

interface ImportHistoryProps {
  /** Batch PENDING bị bỏ rơi (refresh trang mất state wizard) — bấm vào để nạp lại
   * bản xem trước qua GET /imports/:batchId/preview và tiếp tục commit/huỷ. */
  onResume: (batchId: string) => void;
}

export function ImportHistory({ onResume }: ImportHistoryProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['imports', page],
    queryFn: () =>
      apiFetch<Paginated<ImportBatchSummary>>(`/imports?page=${page}&limit=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });
  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;

  return (
    <section aria-labelledby="history-heading" className="mt-10">
      <h2
        id="history-heading"
        className="mb-3 font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900"
      >
        Lịch sử import
      </h2>
      {isError ? (
        <div className="mb-3">
          <FormError>
            {error instanceof ApiError ? error.message : 'Không tải được lịch sử import.'}
          </FormError>
        </div>
      ) : null}
      <DataTable
        headers={[
          'Thời điểm',
          'Loại',
          'Học kỳ',
          'File',
          'Dòng',
          'Lỗi',
          'Trạng thái',
          'Người thực hiện',
        ]}
        isLoading={isLoading}
        skeletonRows={5}
        isRefreshing={isFetching && !isLoading}
        isEmpty={!isLoading && !isError && items.length === 0}
        emptyMessage="Chưa có lượt import nào."
      >
        {items.map((batch) => {
          const resumable = batch.status === 'PENDING';
          return (
            <tr
              key={batch.id}
              className={`transition-colors hover:bg-fpt-orange-50/40 ${
                resumable ? 'bg-fpt-orange-50/15' : ''
              }`}
            >
              <Td className="whitespace-nowrap text-muted">{formatDateTime(batch.createdAt)}</Td>
              <Td>{IMPORT_KIND_LABEL_BY_KIND[batch.kind] ?? batch.kind}</Td>
              <Td>{batch.term}</Td>
              <Td className="max-w-xs truncate">{batch.fileName}</Td>
              <Td>{batch.summary.totalRows}</Td>
              <Td className={batch.summary.errorCount > 0 ? 'text-danger' : undefined}>
                {batch.summary.errorCount}
              </Td>
              <Td>
                {resumable ? (
                  <button
                    type="button"
                    onClick={() => onResume(batch.id)}
                    className="rounded-full transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange"
                  >
                    <Badge tone={STATUS_TONES[batch.status]}>{STATUS_LABELS[batch.status]}</Badge>
                  </button>
                ) : (
                  <Badge tone={STATUS_TONES[batch.status]}>{STATUS_LABELS[batch.status]}</Badge>
                )}
              </Td>
              <Td className="text-muted">{batch.uploadedByName ?? '—'}</Td>
            </tr>
          );
        })}
      </DataTable>
      <Pagination
        label="Phân trang lịch sử import"
        page={page}
        totalPages={pageCount(total, PAGE_SIZE)}
        total={total}
        limit={PAGE_SIZE}
        isLoading={isLoading}
        onPageChange={setPage}
      />
    </section>
  );
}
