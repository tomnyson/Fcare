'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { DataTable, Td } from '../ui/data-table';
import { IMPORT_PAYLOAD_COLUMNS } from '../../lib/import-kinds';
import type { ImportBatchDetail } from '../../lib/types';

const MAX_VISIBLE_ROWS = 50;

interface ImportPreviewProps {
  batch: ImportBatchDetail;
  isCommitting: boolean;
  onCommit: () => void;
  onDiscard: () => void;
}

export function ImportPreview({ batch, isCommitting, onCommit, onDiscard }: ImportPreviewProps) {
  const okCount = batch.summary.validRows;
  const visible = batch.rows.slice(0, MAX_VISIBLE_ROWS);
  // Allowlist theo loại import — KHÔNG đổ nguyên Object.entries(payload) ra
  // bảng, tránh hiện field lạ nếu parser backend đổi mà UI chưa cập nhật.
  const columns = IMPORT_PAYLOAD_COLUMNS[batch.kind];

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

      {batch.summary.unmappedAliases.length > 0 ? (
        <div role="status" className="rounded-md bg-warning/10 p-4 text-sm text-ink">
          <p className="font-semibold">
            {batch.summary.unmappedAliases.length} nhãn bộ môn chưa có ánh xạ — dòng dùng nhãn này
            sẽ bị bỏ qua:
          </p>
          <p className="mt-1">{batch.summary.unmappedAliases.join(' · ')}</p>
          <p className="mt-2">
            Thêm ánh xạ tại <strong>Đào tạo → Ánh xạ bộ môn</strong> rồi tải lại file.
          </p>
        </div>
      ) : null}

      <DataTable
        headers={['Sheet', 'Dòng', ...columns.map((column) => column.label), 'Ghi chú']}
        isEmpty={visible.length === 0}
        emptyMessage="File không có dòng dữ liệu nào."
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

      {batch.rows.length > MAX_VISIBLE_ROWS ? (
        <p className="text-sm text-muted">
          Hiển thị {MAX_VISIBLE_ROWS}/{batch.rows.length} dòng đầu. Xác nhận sẽ ghi toàn bộ dòng hợp
          lệ.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={onCommit} disabled={isCommitting || okCount === 0}>
          {isCommitting ? 'Đang ghi…' : `✓ Xác nhận ghi ${okCount} dòng`}
        </Button>
        <Button type="button" variant="secondary" onClick={onDiscard} disabled={isCommitting}>
          Huỷ lô này
        </Button>
      </div>
    </section>
  );
}
