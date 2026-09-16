'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useState } from 'react';
import type { BackupMetadata } from '../../../../../lib/types';
import { formatBytes, formatDate } from './backup-stats';

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
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-white shadow-[var(--shadow-card)]">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-gray-50/75 text-xs font-semibold uppercase tracking-wider text-muted">
            <tr>
              <th className="px-5 py-3.5">Tên tệp & Ghi chú</th>
              <th className="px-5 py-3.5">Phân loại</th>
              <th className="px-5 py-3.5">Kích thước</th>
              <th className="px-5 py-3.5">Mã SHA-256</th>
              <th className="px-5 py-3.5">Thời gian tạo</th>
              <th className="px-5 py-3.5">Người tạo</th>
              <th className="px-5 py-3.5 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {backups.map((b) => {
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
                  <td className="px-5 py-4">
                    <p className="font-mono text-xs font-semibold text-fpt-blue-900">
                      {b.filename}
                    </p>
                    {b.comment && (
                      <p className="mt-1 text-xs text-muted">
                        {b.comment}
                      </p>
                    )}
                  </td>

                  {/* Phân loại */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {isPreRestore ? (
                      <Badge tone="warning">Snapshot an toàn</Badge>
                    ) : isScheduled ? (
                      <Badge tone="info">Tự động</Badge>
                    ) : (
                      <Badge tone="neutral">Thủ công</Badge>
                    )}
                  </td>

                  {/* Kích thước */}
                  <td className="px-5 py-4 font-mono text-xs text-ink whitespace-nowrap">
                    {formatBytes(b.sizeBytes)}
                  </td>

                  {/* Checksum SHA-256 */}
                  <td className="px-5 py-4 whitespace-nowrap">
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
                  </td>

                  {/* Thời gian tạo */}
                  <td className="px-5 py-4 text-xs text-muted whitespace-nowrap">
                    {formatDate(b.createdAt)}
                  </td>

                  {/* Người tạo */}
                  <td className="px-5 py-4 text-xs text-ink whitespace-nowrap">
                    {b.createdByName || (isScheduled ? 'Hệ thống' : 'Quản trị viên')}
                  </td>

                  {/* Thao tác */}
                  <td className="px-5 py-4 text-right whitespace-nowrap">
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
