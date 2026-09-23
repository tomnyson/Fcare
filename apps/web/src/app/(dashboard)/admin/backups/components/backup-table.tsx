'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useState } from 'react';
import type { BackupMetadata } from '../../../../../lib/types';
import { formatBytes, formatDate } from './backup-stats';
import { DataTable, Td } from '../../../../../components/ui/data-table';
import { usePagedList } from '../../../../../lib/use-paged-list';

interface BackupTableProps {
  backups: BackupMetadata[];
  isLoading: boolean;
  onDownload: (backup: BackupMetadata) => void;
  onRestore: (backup: BackupMetadata) => void;
  onDelete: (backup: BackupMetadata) => void;
}

export function BackupTable({
  backups,
  isLoading,
  onDownload,
  onRestore,
  onDelete,
}: BackupTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const paged = usePagedList(backups, { pageSize: 10 });

  const handleCopyChecksum = (backup: BackupMetadata) => {
    void navigator.clipboard.writeText(backup.checksumSha256);
    setCopiedId(backup.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="rounded-[var(--radius-card)] border border-border bg-white p-12 text-center shadow-[var(--shadow-card)]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-fpt-orange border-r-transparent align-[-0.125em]" />
        <p className="mt-4 text-sm font-medium text-muted">Đang tải danh sách bản sao lưu...</p>
      </div>
    );
  }

  if (backups.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-border bg-white p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-fpt-orange-50 text-fpt-orange">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <ellipse cx="12" cy="5" rx="9" ry="3" strokeWidth="2" />
            <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" strokeWidth="2" />
            <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" strokeWidth="2" />
          </svg>
        </div>
        <h3 className="mt-4 text-base font-bold text-fpt-blue-900">Chưa có bản sao lưu nào</h3>
        <p className="mt-1 text-sm text-muted">
          Hãy bấm &quot;Sao lưu ngay&quot; để tạo bản sao lưu dữ liệu đầu tiên cho hệ thống.
        </p>
      </div>
    );
  }

  return (
    <DataTable
      fitViewport
      headers={[
        'Tên tệp & Ghi chú',
        'Phân loại',
        'Kích thước',
        'Mã SHA-256',
        'Thời gian tạo',
        'Người tạo',
        'Thao tác',
      ]}
      isLoading={isLoading}
      skeletonRows={paged.pageSize}
      pagination={{
        page: paged.page,
        totalPages: paged.totalPages,
        total: paged.total,
        limit: paged.pageSize,
        isLoading,
        onPageChange: paged.setPage,
        onLimitChange: paged.setPageSize,
        label: 'Phân trang bản sao lưu',
      }}
    >
      {paged.pageItems.map((b) => {
        const isPreRestore = b.type === 'PRE_RESTORE';
        const isScheduled = b.type === 'SCHEDULED';

        return (
          <tr
            key={b.id}
            className={`transition-colors hover:bg-fpt-orange-50/30 ${
              isPreRestore ? 'bg-amber-50/20' : ''
            }`}
          >
            {/* Tên tệp & Ghi chú */}
            <Td className="px-5 py-4">
              <p className="font-mono text-xs font-semibold text-fpt-blue-900">
                {b.filename}
              </p>
              {b.comment && (
                <p className="mt-1 text-xs text-muted">
                  {b.comment}
                </p>
              )}
            </Td>

            {/* Phân loại */}
            <Td className="px-5 py-4 whitespace-nowrap">
              {isPreRestore ? (
                <Badge tone="warning">Snapshot an toàn</Badge>
              ) : isScheduled ? (
                <Badge tone="info">Tự động</Badge>
              ) : (
                <Badge tone="neutral">Thủ công</Badge>
              )}
            </Td>

            {/* Kích thước */}
            <Td className="px-5 py-4 font-mono text-xs text-ink whitespace-nowrap">
              {formatBytes(b.sizeBytes)}
            </Td>

            {/* Checksum SHA-256 */}
            <Td className="px-5 py-4 whitespace-nowrap">
              <button
                type="button"
                onClick={() => handleCopyChecksum(b)}
                title="Bấm để copy mã SHA-256"
                className="group flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-xs text-muted hover:bg-gray-100 hover:text-ink"
              >
                <span>{b.checksumSha256 ? `${b.checksumSha256.substring(0, 10)}…` : '—'}</span>
                <span className="text-[10px] text-fpt-orange opacity-0 transition-opacity group-hover:opacity-100">
                  {copiedId === b.id ? '✓ Đã chép' : 'Copy'}
                </span>
              </button>
            </Td>

            {/* Thời gian tạo */}
            <Td className="px-5 py-4 text-xs text-muted whitespace-nowrap">
              {formatDate(b.createdAt)}
            </Td>

            {/* Người tạo */}
            <Td className="px-5 py-4 text-xs text-ink whitespace-nowrap">
              {b.createdByName || (isScheduled ? 'Hệ thống' : 'Quản trị viên')}
            </Td>

            {/* Thao tác */}
            <Td className="px-5 py-4 text-right whitespace-nowrap">
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => onDownload(b)}
                  className="px-2.5 py-1 text-xs"
                >
                  Tải về
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => onRestore(b)}
                  className="px-2.5 py-1 text-xs"
                >
                  Phục hồi
                </Button>
                <button
                  type="button"
                  onClick={() => onDelete(b)}
                  className="rounded p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-danger"
                  title="Xóa bản sao lưu này"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </Td>
          </tr>
        );
      })}
    </DataTable>
  );
}
