'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { QuickMappingModal } from './quick-mapping-modal';
import { DataTable, Td } from '../ui/data-table';
import { Pagination } from '../ui/pagination';
import { apiFetch } from '../../lib/api';
import { IMPORT_PAYLOAD_COLUMNS } from '../../lib/import-kinds';
import { useMe } from '../../lib/hooks';
import { pageCount } from '../../lib/pagination';
import { canManageMasterData } from '../../lib/master-data-tabs';
import {
  MAPPING_TARGETS,
  mappingCodeKey,
  remainingUnmapped,
  type MappingTargetKind,
} from '../../lib/mapping-targets';
import type { ImportBatchDetail, ImportRowView, Paginated } from '../../lib/types';

/** Cùng cỡ trang mặc định của API — trang 1 dùng luôn dữ liệu upload trả về. */
const PAGE_SIZE = 50;

const CHECKBOX_CLASSES =
  'h-4 w-4 shrink-0 rounded border-border accent-fpt-orange ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange';

interface ImportPreviewProps {
  batch: ImportBatchDetail;
  isCommitting: boolean;
  isDiscarding: boolean;
  onCommit: () => void;
  onDiscard: () => void;
}

export function ImportPreview({
  batch,
  isCommitting,
  isDiscarding,
  onCommit,
  onDiscard,
}: ImportPreviewProps) {
  // Khoá CẢ HAI nút khi một trong hai mutation đang chạy: không cho commit lô
  // đang bị huỷ (và ngược lại), cũng không cho bấm đúp tạo 2 request cùng lô.
  const busy = isCommitting || isDiscarding;
  const { data: me } = useMe();
  const canMap = canManageMasterData(me?.user.roles ?? []);
  /** Mã đang mở hộp thoại gán nhanh. */
  const [pending, setPending] = useState<{ kind: MappingTargetKind; code: string } | null>(
    null,
  );
  /** Mã đã gán trong phiên này — Set mới mỗi lần thêm, không mutate tại chỗ. */
  const [mapped, setMapped] = useState<ReadonlySet<string>>(() => new Set<string>());
  const okCount = batch.summary.validRows;
  const [page, setPage] = useState(1);
  const [onlyErrors, setOnlyErrors] = useState(false);
  // File thật ~3000 dòng: API chỉ trả từng trang. Trang 1 (không lọc) đã có
  // sẵn trong `batch` từ lúc upload/nạp lại nên seed thẳng vào cache, các
  // trang khác và chế độ "chỉ dòng lỗi" mới gọi GET preview.
  const isSeedPage = page === 1 && !onlyErrors;
  const rowsQuery = useQuery({
    queryKey: ['imports', batch.id, 'rows', page, onlyErrors],
    queryFn: async () => {
      const search = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (onlyErrors) search.set('onlyErrors', 'true');
      const detail = await apiFetch<ImportBatchDetail>(`/imports/${batch.id}/preview?${search}`);
      return detail.rows;
    },
    initialData: isSeedPage ? batch.rows : undefined,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const rows: Paginated<ImportRowView> = rowsQuery.data ?? { items: [], meta: { total: 0, page, limit: PAGE_SIZE } };
  const visible = rows.items;
  const rowsTotal = rows.meta.total;
  // Allowlist theo loại import — KHÔNG đổ nguyên Object.entries(payload) ra
  // bảng, tránh hiện field lạ nếu parser backend đổi mà UI chưa cập nhật.
  const columns = IMPORT_PAYLOAD_COLUMNS[batch.kind];
  // Hai loại mã chưa ánh xạ tách riêng vì HẬU QUẢ khác nhau. `?? []` để lô
  // import tạo trước khi tách vẫn hiển thị được.
  const unmappedDepartments = remainingUnmapped(
    'department',
    batch.summary.unmappedAliases ?? [],
    mapped,
  );
  const unmappedMajors = remainingUnmapped(
    'major',
    batch.summary.unmappedMajorAliases ?? [],
    mapped,
  );

  return (
    <section aria-labelledby="preview-heading" className="space-y-4">
      <h3 id="preview-heading" className="text-lg font-bold text-fpt-blue-900">
        Xem trước — {batch.fileName}
      </h3>

      <dl className="flex flex-wrap gap-6 rounded-md border border-border bg-surface p-4 text-sm">
        <div>
          <dt className="text-muted">Tổng dòng</dt>
          <dd className="text-xl font-bold text-ink">{batch.summary.totalRows}</dd>
        </div>
        <div>
          <dt className="text-muted">Sẽ ghi</dt>
          <dd className="text-xl font-bold text-success">{okCount}</dd>
        </div>
        <div>
          <dt className="text-muted">Dòng lỗi (bỏ qua)</dt>
          <dd className="text-xl font-bold text-danger">{batch.summary.errorCount}</dd>
        </div>
      </dl>

      {batch.summary.warnings.length > 0 ? (
        <ul role="status" className="space-y-1 rounded-md bg-warning/10 p-4 text-sm text-ink">
          {batch.summary.warnings.map((warning, index) => (
            <li key={`${index}-${warning}`}>⚠ {warning}</li>
          ))}
        </ul>
      ) : null}

      <UnmappedNotice
        canMap={canMap}
        codes={unmappedDepartments}
        kind="department"
        onPick={(code) => setPending({ kind: 'department', code })}
      />
      <UnmappedNotice
        canMap={canMap}
        codes={unmappedMajors}
        kind="major"
        onPick={(code) => setPending({ kind: 'major', code })}
      />

      {mapped.size > 0 ? (
        <p role="status" className="rounded-md bg-success/10 p-4 text-sm text-ink">
          Đã gán {mapped.size} mã trong lượt này. Bấm <strong>Xác nhận ghi</strong> để áp dụng —
          không cần tải lại file.
        </p>
      ) : null}

      {pending ? (
        <QuickMappingModal
          key={mappingCodeKey(pending.kind, pending.code)}
          code={pending.code}
          kind={pending.kind}
          onClose={() => setPending(null)}
          onMapped={() => {
            setMapped((current) =>
              new Set([...current, mappingCodeKey(pending.kind, pending.code)]),
            );
            setPending(null);
          }}
        />
      ) : null}

      {batch.summary.errorCount > 0 ? (
        <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className={CHECKBOX_CLASSES}
            checked={onlyErrors}
            onChange={(e) => {
              setOnlyErrors(e.target.checked);
              setPage(1);
            }}
          />
          Chỉ hiện {batch.summary.errorCount} dòng lỗi
        </label>
      ) : null}

      <DataTable
        headers={['Sheet', 'Dòng', ...columns.map((column) => column.label), 'Ghi chú']}
        isLoading={rowsQuery.isPending}
        isRefreshing={rowsQuery.isFetching && !rowsQuery.isPending}
        skeletonRows={8}
        isEmpty={!rowsQuery.isPending && visible.length === 0}
        emptyMessage={onlyErrors ? 'Không có dòng lỗi nào.' : 'File không có dòng dữ liệu nào.'}
      >
        {visible.map((row) => (
          <tr
            key={`${row.sheet}-${row.rowIndex}`}
            className={row.error ? 'bg-danger/5' : undefined}
          >
            <Td className="text-muted">{row.sheet}</Td>
            <Td className="text-muted">{row.rowIndex}</Td>
            {columns.map((column) => (
              <Td key={column.key}>{String(row.payload[column.key] ?? '—')}</Td>
            ))}
            <Td>
              {row.error ? (
                <Badge tone="danger">{row.error}</Badge>
              ) : (
                <span className="text-success">Hợp lệ</span>
              )}
            </Td>
          </tr>
        ))}
      </DataTable>

      <Pagination
        label="Phân trang dòng xem trước"
        page={page}
        totalPages={pageCount(rowsTotal, PAGE_SIZE)}
        total={rowsTotal}
        limit={PAGE_SIZE}
        isLoading={rowsQuery.isPending}
        onPageChange={setPage}
      />
      {rowsTotal > PAGE_SIZE ? (
        <p className="text-sm text-muted">
          Bảng chỉ hiện {PAGE_SIZE} dòng mỗi trang. Xác nhận sẽ ghi toàn bộ dòng hợp lệ của file.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={onCommit} disabled={busy || okCount === 0}>
          {isCommitting ? 'Đang ghi…' : `✓ Xác nhận ghi ${okCount} dòng`}
        </Button>
        <Button type="button" variant="secondary" onClick={onDiscard} disabled={busy}>
          {isDiscarding ? 'Đang huỷ…' : 'Huỷ lô này'}
        </Button>
      </div>
    </section>
  );
}

/**
 * Cảnh báo mã chưa ánh xạ. Mỗi loại mã có hậu quả và màn hình sửa RIÊNG —
 * nói sai hậu quả khiến admin tưởng mất dữ liệu (hoặc ngược lại). Người có
 * quyền sửa danh mục bấm thẳng vào mã để gán nhanh; người khác chỉ đọc.
 */
function UnmappedNotice({
  canMap,
  codes,
  kind,
  onPick,
}: {
  canMap: boolean;
  codes: readonly string[];
  kind: MappingTargetKind;
  onPick: (code: string) => void;
}) {
  if (codes.length === 0) {
    return null;
  }
  const config = MAPPING_TARGETS[kind];
  return (
    <div role="status" className="rounded-md bg-warning/10 p-4 text-sm text-ink">
      <p className="font-semibold">
        {codes.length} {config.codeLabel} chưa có ánh xạ — {config.consequence}:
      </p>
      {canMap ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {codes.map((code) => (
            <li key={code}>
              <button
                type="button"
                onClick={() => onPick(code)}
                aria-label={`Gán nhanh ${config.codeLabel} ${code}`}
                className="rounded-full border border-border bg-surface px-3 py-1 font-semibold text-ink transition-colors hover:border-fpt-blue-900 hover:bg-fpt-orange-50"
              >
                {code}
                <span aria-hidden="true" className="ml-1 text-muted">
                  +
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1">{codes.join(' · ')}</p>
      )}
      <p className="mt-2">
        {canMap ? (
          <>
            Bấm vào mã để gán nhanh, hoặc thêm tại <strong>{config.screen}</strong>.
          </>
        ) : (
          <>
            Nhờ quản trị viên hoặc cán bộ Đào tạo thêm ánh xạ tại{' '}
            <strong>{config.screen}</strong> rồi tải lại file.
          </>
        )}
      </p>
    </div>
  );
}
