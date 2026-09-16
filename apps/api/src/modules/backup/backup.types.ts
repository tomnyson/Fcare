export type BackupType = 'MANUAL' | 'SCHEDULED' | 'PRE_RESTORE';
export type BackupStatus = 'COMPLETED' | 'FAILED' | 'IN_PROGRESS';

export interface BackupMetadata {
  id: string;
  filename: string;
  filepath: string;
  sizeBytes: number;
  checksumSha256: string;
  type: BackupType;
  status: BackupStatus;
  createdAt: string;
  createdByStaffId?: string;
  createdByName?: string;
  comment?: string;
  pgVersion?: string;
  errorMessage?: string;
}

export interface BackupScheduleConfig {
  enabled: boolean;
  cronExpression: string; // vd: '0 2 * * *' (02:00 hàng ngày)
  retentionCount: number; // vd: 7 bản
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface BackupOverviewStats {
  totalBackups: number;
  totalSizeBytes: number;
  lastBackupAt?: string;
  scheduleConfig: BackupScheduleConfig;
  isLocked: boolean;
  activeOperation?: {
    type: 'BACKUP' | 'RESTORE';
    startedAt: string;
    targetId?: string;
  };
}
