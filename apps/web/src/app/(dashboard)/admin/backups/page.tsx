'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError, FormSuccess } from '../../../../components/ui/form';
import { Modal } from '../../../../components/ui/modal';
import { PageHeader } from '../../../../components/ui/page-header';
import { apiDownload, apiFetch } from '../../../../lib/api';
import type {
  BackupMetadata,
  BackupOverviewStats,
  BackupScheduleConfig,
} from '../../../../lib/types';
import { BackupStats } from './components/backup-stats';
import { BackupTable } from './components/backup-table';
import { CreateModal } from './components/create-modal';
import { RestoreModal } from './components/restore-modal';
import { ScheduleModal } from './components/schedule-modal';
import { UploadModal } from './components/upload-modal';

export default function AdminBackupsPage() {
  const queryClient = useQueryClient();

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupMetadata | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupMetadata | null>(null);

  // Status message states
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearMessages = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  // Queries
  const statsQuery = useQuery({
    queryKey: ['admin-backup-stats'],
    queryFn: () => apiFetch<BackupOverviewStats>('/admin/backup/stats'),
    refetchInterval: (query) => (query.state.data?.isLocked ? 2000 : 15000),
  });

  const isLocked = statsQuery.data?.isLocked ?? false;

  const backupsQuery = useQuery({
    queryKey: ['admin-backups'],
    queryFn: () => apiFetch<BackupMetadata[]>('/admin/backup'),
    refetchInterval: isLocked ? 2000 : false,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (comment: string) =>
      apiFetch<BackupMetadata>('/admin/backup', {
        method: 'POST',
        body: JSON.stringify({ comment: comment || undefined }),
      }),
    onSuccess: (newBackup) => {
      clearMessages();
      setSuccessMessage(`Đã tạo bản sao lưu thành công: ${newBackup.filename}`);
      void queryClient.invalidateQueries({ queryKey: ['admin-backups'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-backup-stats'] });
    },
    onError: (err: Error) => {
      clearMessages();
      setErrorMessage(err.message || 'Tạo bản sao lưu thất bại');
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, comment }: { file: File; comment: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (comment) formData.append('comment', comment);

      return apiFetch<BackupMetadata>('/admin/backup/upload', {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: (newBackup) => {
      clearMessages();
      setSuccessMessage(`Đã tải lên và kiểm tra hợp lệ tệp sao lưu: ${newBackup.filename}`);
      void queryClient.invalidateQueries({ queryKey: ['admin-backups'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-backup-stats'] });
    },
    onError: (err: Error) => {
      clearMessages();
      setErrorMessage(err.message || 'Tải lên tệp sao lưu thất bại');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ id, confirmation }: { id: string; confirmation: string }) =>
      apiFetch<{ success: boolean; restoredId: string; preRestoreSnapshotId: string }>(
        `/admin/backup/${id}/restore`,
        {
          method: 'POST',
          body: JSON.stringify({ confirmation }),
        },
      ),
    onSuccess: () => {
      clearMessages();
      setSuccessMessage(
        `Phục hồi dữ liệu hệ thống thành công! Snapshot bảo vệ an toàn trước khi khôi phục đã được lưu lại.`,
      );
      void queryClient.invalidateQueries({ queryKey: ['admin-backups'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-backup-stats'] });
    },
    onError: (err: Error) => {
      clearMessages();
      setErrorMessage(err.message || 'Phục hồi dữ liệu thất bại');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean; deletedId: string }>(`/admin/backup/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      clearMessages();
      setSuccessMessage('Đã xóa bản sao lưu thành công khỏi máy chủ.');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-backups'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-backup-stats'] });
    },
    onError: (err: Error) => {
      clearMessages();
      setErrorMessage(err.message || 'Không thể xóa bản sao lưu');
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: (config: BackupScheduleConfig) =>
      apiFetch<BackupScheduleConfig>('/admin/backup/config', {
        method: 'PUT',
        body: JSON.stringify(config),
      }),
    onSuccess: () => {
      clearMessages();
      setSuccessMessage('Đã cập nhật cấu hình lịch sao lưu tự động.');
      void queryClient.invalidateQueries({ queryKey: ['admin-backup-stats'] });
    },
    onError: (err: Error) => {
      clearMessages();
      setErrorMessage(err.message || 'Cập nhật cấu hình thất bại');
    },
  });

  // Handlers
  const handleDownload = async (backup: BackupMetadata) => {
    try {
      await apiDownload(`/admin/backup/${backup.id}/download`, backup.filename);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tải tệp sao lưu thất bại';
      setErrorMessage(msg);
    }
  };

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-backups'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-backup-stats'] });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header trang */}
      <PageHeader
        title="Sao lưu & Phục hồi cơ sở dữ liệu"
        description="Quản lý các bản sao lưu, khôi phục dữ liệu an toàn và thiết lập lịch sao lưu tự động cho hệ thống FCare."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              onClick={handleRefresh}
              disabled={isLocked || backupsQuery.isFetching}
            >
              Làm mới
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                clearMessages();
                setUploadOpen(true);
              }}
              disabled={isLocked}
            >
              Tải lên tệp sao lưu
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                clearMessages();
                setCreateOpen(true);
              }}
              disabled={isLocked}
            >
              + Sao lưu ngay
            </Button>
          </div>
        }
      />

      {/* Thông báo thao tác */}
      {successMessage && <FormSuccess>{successMessage}</FormSuccess>}
      {errorMessage && <FormError>{errorMessage}</FormError>}

      {/* Banner cảnh báo tiến trình đang chạy */}
      {isLocked && (
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm animate-pulse">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-800 border-r-transparent" />
          <div className="text-xs">
            <p className="font-bold">
              {statsQuery.data?.activeOperation?.type === 'RESTORE'
                ? 'Đang tiến hành phục hồi dữ liệu...'
                : 'Đang tiến hành kết xuất bản sao lưu...'}
            </p>
            <p className="mt-0.5 text-amber-800">
              Vui lòng không đóng trình duyệt hoặc tải lại trang trong khi hệ thống đang xử lý.
            </p>
          </div>
        </div>
      )}

      {/* Thống kê dung lượng & trạng thái lịch */}
      <BackupStats
        stats={statsQuery.data}
        onOpenSchedule={() => {
          clearMessages();
          setScheduleOpen(true);
        }}
      />

      {/* Bảng danh sách các bản backup */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-fpt-blue-900">
            Danh sách bản sao lưu trên máy chủ
          </h2>
          <span className="text-xs text-muted">
            {backupsQuery.data ? `${backupsQuery.data.length} bản lưu` : 'Đang tải...'}
          </span>
        </div>

        <BackupTable
          backups={backupsQuery.data ?? []}
          isLoading={backupsQuery.isLoading}
          onDownload={handleDownload}
          onRestore={(b) => {
            clearMessages();
            setRestoreTarget(b);
          }}
          onDelete={(b) => {
            clearMessages();
            setDeleteTarget(b);
          }}
        />
      </div>

      {/* Modal tạo backup thủ công */}
      <CreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (comment) => {
          await createMutation.mutateAsync(comment);
        }}
      />

      {/* Modal upload backup */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={async (file, comment) => {
          await uploadMutation.mutateAsync({ file, comment });
        }}
      />

      {/* Modal xác nhận phục hồi nguy hiểm */}
      <RestoreModal
        backup={restoreTarget}
        open={Boolean(restoreTarget)}
        onClose={() => setRestoreTarget(null)}
        onConfirmRestore={async (id, confirmation) => {
          await restoreMutation.mutateAsync({ id, confirmation });
        }}
      />

      {/* Modal cấu hình lịch tự động & retention */}
      <ScheduleModal
        config={statsQuery.data?.scheduleConfig}
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSaveConfig={async (config) => {
          await scheduleMutation.mutateAsync(config);
        }}
      />

      {/* Modal xác nhận xóa backup */}
      <Modal
        title="Xác nhận xóa bản sao lưu"
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Bạn có chắc chắn muốn xóa bản sao lưu{' '}
            <strong className="font-mono text-ink">{deleteTarget?.filename}</strong> khỏi ổ đĩa
            máy chủ không? Hành động này không thể hoàn tác.
          </p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Hủy bỏ
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Đang xóa...' : 'Xác nhận xóa'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
