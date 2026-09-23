import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { execSync } from 'child_process';
import {
  BackupMetadata,
  BackupOverviewStats,
  BackupScheduleConfig,
  BackupType,
} from './backup.types';
import { PgRunnerService } from './pg-runner.service';

const DEFAULT_SCHEDULE_CONFIG: BackupScheduleConfig = {
  enabled: true,
  cronExpression: '0 2 * * *', // 02:00 hàng ngày
  retentionCount: 7, // Giữ 7 bản tự động gần nhất
};

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private storageDir: string = '';
  private isLocked: boolean = false;
  private activeOperation?: {
    type: 'BACKUP' | 'RESTORE';
    startedAt: string;
    targetId?: string;
  };

  constructor(
    private readonly config: ConfigService,
    private readonly pgRunner: PgRunnerService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.ensureStorageDir();
  }

  /**
   * Audit trong module này luôn là fire-and-forget hoặc chạy sát lúc reset
   * schema. Nếu để promise reject trôi (ví dụ kết nối bị `pg_terminate_backend`
   * cắt), crash handler toàn cục sẽ tắt API giữa lúc phục hồi. Audit hỏng
   * chỉ được phép cảnh báo, không bao giờ được làm đổ tiến trình.
   */
  private async safeAudit(
    entry: Parameters<AuditService['log']>[0],
  ): Promise<void> {
    try {
      await this.audit.log(entry);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Không ghi được audit ${entry.action}: ${msg}`);
    }
  }

  /**
   * Lấy đường dẫn thư mục lưu trữ backup
   */
  getStorageDir(): string {
    if (!this.storageDir) {
      const configured = this.config.get<string>('BACKUP_STORAGE_DIR');
      if (configured) {
        this.storageDir = path.isAbsolute(configured)
          ? configured
          : path.resolve(process.cwd(), configured);
      } else {
        // Mặc định lưu vào storage/backups tại root của repo
        this.storageDir = path.resolve(process.cwd(), '../../storage/backups');
        if (!fs.existsSync(path.dirname(this.storageDir))) {
          this.storageDir = path.resolve(process.cwd(), 'storage/backups');
        }
      }
    }
    return this.storageDir;
  }

  private ensureStorageDir(): void {
    const dir = this.getStorageDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private getScheduleConfigPath(): string {
    return path.join(this.getStorageDir(), 'schedule-config.json');
  }

  /**
   * Lấy cấu hình lịch tự động sao lưu
   */
  getScheduleConfig(): BackupScheduleConfig {
    const configPath = this.getScheduleConfigPath();
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<BackupScheduleConfig>;
        return { ...DEFAULT_SCHEDULE_CONFIG, ...parsed };
      } catch (err) {
        this.logger.warn(`Không thể đọc schedule-config.json: ${err}`);
      }
    }
    return { ...DEFAULT_SCHEDULE_CONFIG };
  }

  /**
   * Cập nhật cấu hình lịch tự động sao lưu
   */
  updateScheduleConfig(
    config: Partial<BackupScheduleConfig>,
    staffId?: string,
  ): BackupScheduleConfig {
    const current = this.getScheduleConfig();
    const updated: BackupScheduleConfig = {
      ...current,
      ...config,
    };

    const configPath = this.getScheduleConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');

    void this.safeAudit({
      action: 'DB_BACKUP_CONFIG_UPDATED',
      entity: 'BackupSchedule',
      staffId,
      metadata: { ...updated },
    });

    return updated;
  }

  /**
   * Tính mã băm SHA-256 của tệp
   */
  private computeChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  /**
   * Danh sách tất cả các bản sao lưu (sắp xếp mới nhất trước)
   */
  async listBackups(): Promise<BackupMetadata[]> {
    this.ensureStorageDir();
    const dir = this.getStorageDir();
    const files = fs.readdirSync(dir);

    const metadataList: BackupMetadata[] = [];
    const dumpFiles = files.filter((f) => f.endsWith('.dump'));

    for (const dumpFile of dumpFiles) {
      const dumpPath = path.join(dir, dumpFile);
      const metaPath = dumpPath.replace(/\.dump$/, '.meta.json');

      if (fs.existsSync(metaPath)) {
        try {
          const raw = fs.readFileSync(metaPath, 'utf8');
          const meta = JSON.parse(raw) as BackupMetadata;
          metadataList.push(meta);
          continue;
        } catch (err) {
          this.logger.warn(`Lỗi phân tích metadata cho ${dumpFile}: ${err}`);
        }
      }

      // Nếu thiếu metadata JSON (ví dụ admin copy tệp vào bằng tay), tự động tái tạo
      try {
        const stats = fs.statSync(dumpPath);
        const checksum = await this.computeChecksum(dumpPath);
        const fallbackMeta: BackupMetadata = {
          id: dumpFile.replace(/\.dump$/, ''),
          filename: dumpFile,
          filepath: dumpPath,
          sizeBytes: stats.size,
          checksumSha256: checksum,
          type: 'MANUAL',
          status: 'COMPLETED',
          createdAt: stats.mtime.toISOString(),
          comment: 'Tệp nhập thủ công trên máy chủ',
        };
        fs.writeFileSync(
          metaPath,
          JSON.stringify(fallbackMeta, null, 2),
          'utf8',
        );
        metadataList.push(fallbackMeta);
      } catch (err) {
        this.logger.warn(`Không thể tạo metadata cho ${dumpFile}: ${err}`);
      }
    }

    return metadataList.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Lấy thông tin chi tiết một bản sao lưu theo ID
   */
  async getBackupById(id: string): Promise<BackupMetadata> {
    const list = await this.listBackups();
    const found = list.find((b) => b.id === id);
    if (!found || !fs.existsSync(found.filepath)) {
      throw new NotFoundException(`Bản sao lưu với ID "${id}" không tồn tại`);
    }
    return found;
  }

  /**
   * Tạo bản sao lưu mới
   */
  async createBackup(
    options: {
      type?: BackupType;
      comment?: string;
      staffId?: string;
      staffName?: string;
    } = {},
  ): Promise<BackupMetadata> {
    if (this.isLocked) {
      throw new ConflictException(
        'Hệ thống đang bận thực hiện một tác vụ sao lưu hoặc phục hồi khác. Vui lòng thử lại sau giây lát.',
      );
    }

    this.ensureStorageDir();
    this.isLocked = true;
    const type: BackupType = options.type || 'MANUAL';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomHex = crypto.randomBytes(4).toString('hex');
    const backupId = `backup-${type.toLowerCase()}-${timestamp}-${randomHex}`;
    const filename = `${backupId}.dump`;
    const filepath = path.join(this.getStorageDir(), filename);
    const metaPath = path.join(this.getStorageDir(), `${backupId}.meta.json`);

    this.activeOperation = {
      type: 'BACKUP',
      startedAt: new Date().toISOString(),
      targetId: backupId,
    };

    try {
      this.logger.log(`Bắt đầu tạo bản sao lưu: ${filename} (Loại: ${type})`);
      await this.pgRunner.dumpToFile(filepath);

      const stats = fs.statSync(filepath);
      const checksumSha256 = await this.computeChecksum(filepath);

      const metadata: BackupMetadata = {
        id: backupId,
        filename,
        filepath,
        sizeBytes: stats.size,
        checksumSha256,
        type,
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        createdByStaffId: options.staffId,
        createdByName: options.staffName,
        comment: options.comment,
      };

      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

      // Chờ audit xong: restoreBackup gọi ngay resetDatabase() sau bước này,
      // insert còn dang dở sẽ bị pg_terminate_backend cắt ngang.
      await this.safeAudit({
        action: 'DB_BACKUP_CREATED',
        entity: 'Backup',
        entityId: backupId,
        staffId: options.staffId,
        metadata: {
          filename,
          sizeBytes: stats.size,
          type,
          comment: options.comment,
        },
      });

      this.logger.log(
        `Tạo bản sao lưu thành công: ${filename} (${stats.size} bytes)`,
      );
      return metadata;
    } catch (err: unknown) {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lỗi tạo bản sao lưu: ${msg}`);
      throw new InternalServerErrorException(
        `Không thể tạo bản sao lưu: ${msg}`,
      );
    } finally {
      this.isLocked = false;
      this.activeOperation = undefined;
    }
  }

  /**
   * Lưu tệp dump được tải lên từ client
   */
  async saveUploadedBackup(
    file: { buffer: Buffer; originalname: string; size: number },
    comment?: string,
    staffId?: string,
    staffName?: string,
  ): Promise<BackupMetadata> {
    if (this.isLocked) {
      throw new ConflictException('Hệ thống đang bận thực hiện tác vụ khác.');
    }

    this.ensureStorageDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomHex = crypto.randomBytes(4).toString('hex');
    const backupId = `backup-manual-${timestamp}-${randomHex}`;
    const filename = `${backupId}.dump`;
    const filepath = path.join(this.getStorageDir(), filename);
    const metaPath = path.join(this.getStorageDir(), `${backupId}.meta.json`);

    fs.writeFileSync(filepath, file.buffer);

    try {
      // Kiểm tra tính toàn vẹn của tệp dump vừa tải lên
      await this.pgRunner.validateDumpFile(filepath);

      const checksumSha256 = await this.computeChecksum(filepath);
      const metadata: BackupMetadata = {
        id: backupId,
        filename,
        filepath,
        sizeBytes: file.size,
        checksumSha256,
        type: 'MANUAL',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        createdByStaffId: staffId,
        createdByName: staffName,
        comment: comment || `Tải lên: ${file.originalname}`,
      };

      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

      void this.safeAudit({
        action: 'DB_BACKUP_CREATED',
        entity: 'Backup',
        entityId: backupId,
        staffId,
        metadata: {
          filename,
          sizeBytes: file.size,
          isUploaded: true,
          originalName: file.originalname,
        },
      });

      return metadata;
    } catch (err) {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      throw err;
    }
  }

  /**
   * Phục hồi database an toàn từ bản sao lưu
   */
  async restoreBackup(
    id: string,
    options: {
      confirmation: string;
      staffId?: string;
      staffName?: string;
    },
  ): Promise<{
    success: boolean;
    restoredId: string;
    preRestoreSnapshotId: string;
  }> {
    if (
      options.confirmation !== 'XAC NHAN' &&
      options.confirmation !== 'RESTORE'
    ) {
      throw new BadRequestException(
        'Từ khóa xác nhận không hợp lệ. Vui lòng nhập đúng "XAC NHAN" hoặc "RESTORE".',
      );
    }

    if (this.isLocked) {
      throw new ConflictException(
        'Hệ thống đang thực hiện một tác vụ sao lưu hoặc phục hồi khác.',
      );
    }

    const targetBackup = await this.getBackupById(id);

    // Xác thực tệp hợp lệ trước khi chạm vào dữ liệu
    await this.pgRunner.validateDumpFile(targetBackup.filepath);

    this.isLocked = true;
    this.activeOperation = {
      type: 'RESTORE',
      startedAt: new Date().toISOString(),
      targetId: id,
    };

    void this.safeAudit({
      action: 'DB_RESTORE_INITIATED',
      entity: 'Backup',
      entityId: id,
      staffId: options.staffId,
      metadata: {
        targetFilename: targetBackup.filename,
        targetCreatedAt: targetBackup.createdAt,
      },
    });

    let preRestoreSnapshot: BackupMetadata | null = null;

    try {
      // 1. Tự động chụp Snapshot an toàn trước khi khôi phục
      this.logger.log(
        'Tự động tạo bản sao lưu an toàn (Pre-Restore Snapshot)...',
      );
      this.isLocked = false; // tạm giải phóng để createBackup thực thi
      preRestoreSnapshot = await this.createBackup({
        type: 'PRE_RESTORE',
        comment: `Snapshot an toàn tự động trước khi phục hồi từ ${targetBackup.filename}`,
        staffId: options.staffId,
        staffName: options.staffName,
      });
      this.isLocked = true;

      // 2. Xóa sạch schema public cũ trước khi nạp để đảm bảo ghi đè 100% dữ liệu, không để lại rác hay trùng lặp
      this.logger.log(
        'Xóa sạch toàn bộ schema public cũ để ghi đè hoàn toàn dữ liệu...',
      );
      await this.resetDatabase();

      // 3. Tạm ngắt kết nối Prisma Client
      this.logger.log('Ngắt kết nối Prisma Client để chuẩn bị phục hồi...');
      await this.prisma.$disconnect();

      // 4. Thực thi khôi phục từ tệp dump
      this.logger.log(`Bắt đầu nạp dữ liệu từ ${targetBackup.filepath}...`);
      await this.pgRunner.restoreFromFile(targetBackup.filepath);

      // 5. Kết nối lại Prisma Client
      this.logger.log('Kết nối lại Prisma Client...');
      await this.prisma.$connect();

      // 6. Kiểm tra truy vấn xác nhận
      await this.prisma.$queryRaw`SELECT 1`;

      // 7. Đồng bộ Prisma Migrations nếu bản backup cũ hơn codebase hiện tại
      this.applyPendingMigrations();

      void this.safeAudit({
        action: 'DB_RESTORE_COMPLETED',
        entity: 'Backup',
        entityId: id,
        staffId: options.staffId,
        metadata: {
          restoredFromId: id,
          preRestoreSnapshotId: preRestoreSnapshot.id,
        },
      });

      this.logger.log(
        `Phục hồi database thành công từ ${targetBackup.filename}`,
      );
      return {
        success: true,
        restoredId: id,
        preRestoreSnapshotId: preRestoreSnapshot.id,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Phục hồi database thất bại: ${msg}`);

      // Nếu có preRestoreSnapshot, kích hoạt cơ chế rollback an toàn
      if (preRestoreSnapshot && fs.existsSync(preRestoreSnapshot.filepath)) {
        this.logger.warn(
          `Đang kích hoạt rollback tự động về Pre-Restore Snapshot: ${preRestoreSnapshot.filename}...`,
        );
        try {
          await this.resetDatabase();
          await this.prisma.$disconnect();
          await this.pgRunner.restoreFromFile(preRestoreSnapshot.filepath);
          await this.prisma.$connect();
          this.applyPendingMigrations();
          this.logger.log(
            `Đã rollback thành công về bản snapshot an toàn: ${preRestoreSnapshot.filename}`,
          );
        } catch (rollbackErr) {
          this.logger.error(
            `Rollback tự động thất bại: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`,
          );
        }
      }

      // Đảm bảo Prisma được kết nối lại ngay cả khi lỗi
      try {
        await this.prisma.$connect();
      } catch {
        // ignore
      }

      void this.safeAudit({
        action: 'DB_RESTORE_FAILED',
        entity: 'Backup',
        entityId: id,
        staffId: options.staffId,
        metadata: {
          errorMessage: msg,
          preRestoreSnapshotId: preRestoreSnapshot?.id,
        },
      });

      throw new InternalServerErrorException(
        `Quá trình phục hồi database thất bại: ${msg}. Bản sao lưu an toàn trước đó là: ${preRestoreSnapshot?.filename}`,
      );
    } finally {
      this.isLocked = false;
      this.activeOperation = undefined;
    }
  }

  /**
   * Xóa sạch toàn bộ schema public trước khi phục hồi để đảm bảo
   * ghi đè 100% dữ liệu, loại bỏ hoàn toàn nguy cơ dữ liệu trùng lặp hoặc rác cũ.
   */
  async resetDatabase(): Promise<void> {
    this.logger.log(
      'Đang dọn sạch schema public để chuẩn bị nạp dữ liệu bản sao lưu...',
    );

    // Đóng pool hiện tại trước: pg_terminate_backend bên dưới giết mọi backend
    // khác, kể cả các kết nối rảnh trong pool của chính API. Nếu để pool cũ,
    // câu DROP tiếp theo có thể rơi vào một kết nối vừa bị cắt (57P01).
    await this.prisma.$disconnect();

    // Gom terminate + drop + create vào MỘT câu lệnh để Prisma chạy trên đúng
    // một kết nối mới (pid được loại trừ khỏi danh sách bị terminate).
    await this.prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        PERFORM pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid();

        DROP SCHEMA public CASCADE;
        CREATE SCHEMA public;
        GRANT ALL ON SCHEMA public TO CURRENT_USER;
        GRANT ALL ON SCHEMA public TO public;
      END
      $$;
    `);
    this.logger.log('Đã tạo mới schema public hoàn toàn sạch sẽ.');
  }

  /**
   * Đồng bộ các Prisma Migrations sau khi phục hồi,
   * phòng trường hợp bản sao lưu được tạo từ phiên bản migration cũ hơn codebase hiện tại.
   */
  applyPendingMigrations(): void {
    this.logger.log(
      'Kiểm tra và áp dụng Prisma Migrations còn thiếu sau phục hồi...',
    );
    const cwd = path.resolve(process.cwd());
    try {
      const output = execSync('pnpm exec prisma migrate deploy', {
        cwd,
        env: { ...process.env },
        encoding: 'utf8',
      });
      this.logger.log(`Prisma migrate deploy: ${output.trim()}`);
    } catch {
      try {
        const output = execSync('npx prisma migrate deploy', {
          cwd,
          env: { ...process.env },
          encoding: 'utf8',
        });
        this.logger.log(`npx prisma migrate deploy: ${output.trim()}`);
      } catch (fallbackErr: unknown) {
        const msg =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr);
        this.logger.warn(`Cảnh báo khi chạy prisma migrate deploy: ${msg}`);
      }
    }
  }

  /**
   * Xóa một bản sao lưu và metadata tương ứng
   */
  async deleteBackup(id: string, staffId?: string): Promise<void> {
    const backup = await this.getBackupById(id);
    const metaPath = backup.filepath.replace(/\.dump$/, '.meta.json');

    if (fs.existsSync(backup.filepath)) {
      fs.unlinkSync(backup.filepath);
    }
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
    }

    void this.safeAudit({
      action: 'DB_BACKUP_DELETED',
      entity: 'Backup',
      entityId: id,
      staffId,
      metadata: {
        filename: backup.filename,
        sizeBytes: backup.sizeBytes,
        type: backup.type,
      },
    });

    this.logger.log(`Đã xóa bản sao lưu: ${backup.filename}`);
  }

  /**
   * Dọn dẹp các bản sao lưu tự động cũ vượt quá số lượng lưu trữ cho phép
   */
  async pruneOldBackups(retentionCount: number): Promise<number> {
    const list = await this.listBackups();
    // Chỉ dọn dẹp các bản SCHEDULED (không xóa MANUAL hoặc PRE_RESTORE)
    const scheduled = list.filter((b) => b.type === 'SCHEDULED');

    if (scheduled.length <= retentionCount) {
      return 0;
    }

    const toDelete = scheduled.slice(retentionCount);
    let deletedCount = 0;

    for (const backup of toDelete) {
      try {
        await this.deleteBackup(backup.id);
        deletedCount++;
      } catch (err) {
        this.logger.warn(
          `Không thể dọn dẹp bản backup cũ ${backup.filename}: ${err}`,
        );
      }
    }

    this.logger.log(
      `Đã dọn dẹp ${deletedCount} bản sao lưu tự động cũ theo chính sách retention.`,
    );
    return deletedCount;
  }

  /**
   * Thống kê tổng quan hệ thống sao lưu
   */
  async getOverviewStats(): Promise<BackupOverviewStats> {
    const list = await this.listBackups();
    const totalBackups = list.length;
    const totalSizeBytes = list.reduce(
      (acc, curr) => acc + (curr.sizeBytes || 0),
      0,
    );
    const lastBackupAt = list.length > 0 ? list[0].createdAt : undefined;
    const scheduleConfig = this.getScheduleConfig();

    return {
      totalBackups,
      totalSizeBytes,
      lastBackupAt,
      scheduleConfig,
      isLocked: this.isLocked,
      activeOperation: this.activeOperation,
    };
  }
}
