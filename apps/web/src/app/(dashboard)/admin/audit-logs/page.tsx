'use client';

import { Badge, Button, SurfaceCard } from '@fcare/ui-kit';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { DataTable, Td } from '../../../../components/ui/data-table';
import { FormError, Input, Label, Select } from '../../../../components/ui/form';
import { Modal } from '../../../../components/ui/modal';
import { PageHeader } from '../../../../components/ui/page-header';
import { Pagination } from '../../../../components/ui/pagination';
import { apiFetch } from '../../../../lib/api';
import {
  ACTION_PRESETS,
  formatAuditDateTime,
  getActionLabel,
  getAuditBadgeTone,
  type AuditLogItem,
  type PaginatedAuditLogs,
} from '../../../../lib/audit-logs';
import { useMe } from '../../../../lib/hooks';

const AUDIT_LOGS_QUERY_KEY = ['admin', 'audit-logs'] as const;

function LockedCard() {
  return (
    <SurfaceCard className="mx-auto max-w-lg p-8 text-center">
      <p className="text-4xl" aria-hidden="true">
        🔒
      </p>
      <p className="mt-3 font-display text-lg font-semibold text-fpt-blue-900">
        Chỉ quản trị viên mới xem được nhật ký hành động hệ thống.
      </p>
      <p className="mt-1 text-sm text-muted">
        Vui lòng liên hệ quản trị viên FCare nếu bạn cần truy cập chức năng này.
      </p>
    </SurfaceCard>
  );
}

function AuditLogsPageContent() {
  const { data: me, isLoading: meLoading } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // State from URL
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = 20;
  const search = searchParams.get('search') ?? '';
  const action = searchParams.get('action') ?? '';
  const staffCode = searchParams.get('staffCode') ?? '';
  const entity = searchParams.get('entity') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  // Local filter drafts
  const [draftSearch, setDraftSearch] = useState(search);
  const [draftStaffCode, setDraftStaffCode] = useState(staffCode);
  const [draftAction, setDraftAction] = useState(action);
  const [draftEntity, setDraftEntity] = useState(entity);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  // Selected item for metadata detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [copied, setCopied] = useState(false);

  // Update query params in URL
  const applyFilters = (updates: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '' || (key === 'page' && value === 1)) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }
    router.replace(`${pathname}?${next.toString()}`);
  };

  const handleApplyForm = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters({
      page: 1,
      search: draftSearch.trim(),
      staffCode: draftStaffCode.trim(),
      action: draftAction,
      entity: draftEntity.trim(),
      from: draftFrom,
      to: draftTo,
    });
  };

  const handleResetFilters = () => {
    setDraftSearch('');
    setDraftStaffCode('');
    setDraftAction('');
    setDraftEntity('');
    setDraftFrom('');
    setDraftTo('');
    router.replace(pathname);
  };

  // Build query string for API
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (search) params.set('search', search);
    if (action) params.set('action', action);
    if (staffCode) params.set('staffCode', staffCode);
    if (entity) params.set('entity', entity);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params.toString();
  }, [page, limit, search, action, staffCode, entity, from, to]);

  const {
    data: logsData,
    isLoading,
    isPlaceholderData,
    error,
    refetch,
  } = useQuery({
    queryKey: [...AUDIT_LOGS_QUERY_KEY, queryParams],
    queryFn: () => apiFetch<PaginatedAuditLogs>(`/admin/audit-logs?${queryParams}`),
    enabled: !!me?.user?.roles?.includes('ADMIN'),
    placeholderData: keepPreviousData,
  });

  const handleCopyJson = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (meLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-10 w-64 animate-pulse rounded bg-border/60" />
        <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-border/60" />
        <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-border/60" />
      </div>
    );
  }

  if (!me?.user?.roles?.includes('ADMIN')) {
    return <LockedCard />;
  }

  const items = logsData?.items ?? [];
  const meta = logsData?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const hasActiveFilters = Boolean(search || action || staffCode || entity || from || to);

  const headers = ['Thời gian', 'Mã NV', 'Họ tên', 'Hành động', 'Đối tượng', 'Thao tác'];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhật ký hành động"
        description="Theo dõi toàn bộ lịch sử thao tác của nhân viên, giảng viên và cán bộ trên hệ thống FCare."
        actions={
          <Button
            variant="ghost"
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <svg
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Làm mới
          </Button>
        }
      />

      {/* Filter SurfaceCard */}
      <SurfaceCard className="p-5">
        <form onSubmit={handleApplyForm} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* Search Input */}
            <div className="xl:col-span-2">
              <Label htmlFor="audit-search">Tìm kiếm</Label>
              <Input
                id="audit-search"
                type="text"
                placeholder="Mã NV, họ tên, action, entity..."
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
              />
            </div>

            {/* StaffCode */}
            <div>
              <Label htmlFor="audit-staffCode">Mã nhân viên</Label>
              <Input
                id="audit-staffCode"
                type="text"
                placeholder="vd: gv.nguyen"
                value={draftStaffCode}
                onChange={(e) => setDraftStaffCode(e.target.value)}
              />
            </div>

            {/* Action Select */}
            <div>
              <Label htmlFor="audit-action">Hành động</Label>
              <Select
                id="audit-action"
                value={draftAction}
                onChange={(e) => setDraftAction(e.target.value)}
              >
                <option value="">-- Tất cả hành động --</option>
                {ACTION_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    [{p.group}] {p.label} ({p.key})
                  </option>
                ))}
              </Select>
            </div>

            {/* From Date */}
            <div>
              <Label htmlFor="audit-from">Từ ngày</Label>
              <Input
                id="audit-from"
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
              />
            </div>

            {/* To Date */}
            <div>
              <Label htmlFor="audit-to">Đến ngày</Label>
              <Input
                id="audit-to"
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="text-sm text-muted">
              {logsData?.meta ? (
                <span>
                  Tìm thấy <strong className="text-ink font-semibold">{logsData.meta.total}</strong>{' '}
                  bản ghi nhật ký
                </span>
              ) : (
                <span>Đang tải số liệu…</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {hasActiveFilters ? (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs"
                >
                  Xóa bộ lọc
                </Button>
              ) : null}
              <Button variant="primary" type="submit">
                Áp dụng bộ lọc
              </Button>
            </div>
          </div>
        </form>
      </SurfaceCard>

      {error ? (
        <FormError>
          {error instanceof Error
            ? error.message
            : 'Không thể tải nhật ký hành động. Vui lòng thử lại.'}
        </FormError>
      ) : null}

      {/* Table Section */}
      <DataTable
        headers={headers}
        isLoading={isLoading}
        isRefreshing={isPlaceholderData}
        isEmpty={items.length === 0}
        emptyMessage={
          hasActiveFilters
            ? 'Không tìm thấy nhật ký hành động nào khớp với điều kiện lọc.'
            : 'Chưa có nhật ký hành động nào trong hệ thống.'
        }
        skeletonRows={8}
      >
        {items.map((item) => {
          const actionLabel = getActionLabel(item.action);
          const badgeTone = getAuditBadgeTone(item.action);
          const hasMetadata = item.metadata && Object.keys(item.metadata).length > 0;

          return (
            <tr
              key={item.id}
              className="transition-colors hover:bg-fpt-orange-50/40"
            >
              {/* Thời gian */}
              <Td className="whitespace-nowrap tabular-nums text-muted">
                {formatAuditDateTime(item.createdAt)}
              </Td>

              {/* Mã NV */}
              <Td className="font-semibold text-ink">
                {item.staff?.staffCode ?? '—'}
              </Td>

              {/* Họ tên */}
              <Td className="text-ink">
                {item.staff?.fullName ?? (
                  <span className="text-muted italic">Hệ thống</span>
                )}
              </Td>

              {/* Hành động */}
              <Td>
                <Badge tone={badgeTone}>
                  {actionLabel}
                </Badge>
              </Td>

              {/* Đối tượng */}
              <Td className="text-ink">
                <span className="font-medium">{item.entity}</span>
                {item.entityId ? (
                  <span
                    className="ml-1 text-xs text-muted"
                    title={item.entityId}
                  >
                    ({item.entityId.length > 15 ? `${item.entityId.substring(0, 12)}…` : item.entityId})
                  </span>
                ) : null}
              </Td>

              {/* Thao tác */}
              <Td className="w-px whitespace-nowrap text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    disabled={!hasMetadata}
                    onClick={() => setSelectedLog(item)}
                    className={`rounded-md border border-border px-2.5 py-1 text-xs font-semibold transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange ${
                      hasMetadata
                        ? 'cursor-pointer text-fpt-blue hover:border-fpt-blue hover:bg-fpt-orange-50'
                        : 'cursor-not-allowed border-dashed text-muted/50'
                    }`}
                    title={hasMetadata ? 'Xem chi tiết metadata' : 'Không có metadata'}
                  >
                    Chi tiết
                  </button>
                </div>
              </Td>
            </tr>
          );
        })}
      </DataTable>

      {/* Pagination */}
      {logsData?.meta ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          limit={limit}
          total={logsData.meta.total}
          isLoading={isLoading}
          onPageChange={(newPage) => applyFilters({ page: newPage })}
          label="Phân trang nhật ký hành động"
        />
      ) : null}

      {/* Metadata Detail Modal */}
      {selectedLog ? (
        <Modal
          title={`Chi tiết hành động: ${selectedLog.action}`}
          open={!!selectedLog}
          onClose={() => setSelectedLog(null)}
          size="lg"
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-elevated p-3 text-xs">
              <div>
                <span className="text-muted">Thời gian:</span>{' '}
                <strong className="text-ink font-mono">
                  {formatAuditDateTime(selectedLog.createdAt)}
                </strong>
              </div>
              <div>
                <span className="text-muted">Nhân viên:</span>{' '}
                <strong className="text-ink">
                  {selectedLog.staff
                    ? `${selectedLog.staff.fullName} (${selectedLog.staff.staffCode})`
                    : 'Hệ thống'}
                </strong>
              </div>
              <div>
                <span className="text-muted">Đối tượng (Entity):</span>{' '}
                <strong className="text-ink">{selectedLog.entity}</strong>
              </div>
              <div>
                <span className="text-muted">Entity ID:</span>{' '}
                <strong className="text-ink font-mono">{selectedLog.entityId ?? '—'}</strong>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label htmlFor="audit-metadata-view">Dữ liệu chi tiết (Metadata JSON):</Label>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyJson(JSON.stringify(selectedLog.metadata, null, 2))
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-fpt-blue-700 hover:underline"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                    />
                  </svg>
                  {copied ? 'Đã chép!' : 'Chép JSON'}
                </button>
              </div>

              <pre
                id="audit-metadata-view"
                className="max-h-80 overflow-auto rounded-lg border border-border bg-slate-950 p-3 font-mono text-xs text-emerald-400"
              >
                {JSON.stringify(selectedLog.metadata, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="ghost" type="button" onClick={() => setSelectedLog(null)}>
                Đóng
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export default function AdminAuditLogsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6" aria-busy="true">
          <div className="h-10 w-64 animate-pulse rounded bg-border/60" />
          <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-border/60" />
          <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-border/60" />
        </div>
      }
    >
      <AuditLogsPageContent />
    </Suspense>
  );
}
