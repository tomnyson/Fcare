/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BackupService } from './backup.service';
import { PgRunnerService } from './pg-runner.service';

describe('BackupService', () => {
  let service: BackupService;
  let pgRunner: jest.Mocked<PgRunnerService>;
  let audit: jest.Mocked<AuditService>;
  let prisma: jest.Mocked<PrismaService>;

  const testStorageDir = path.join(__dirname, 'test-storage');

  beforeEach(async () => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testStorageDir, { recursive: true });

    const mockPgRunner = {
      dumpToFile: jest.fn().mockImplementation((targetPath: string) => {
        fs.writeFileSync(targetPath, 'mock-dump-content');
      }),
      validateDumpFile: jest.fn().mockResolvedValue(true),
      restoreFromFile: jest.fn().mockResolvedValue(undefined),
    };

    const mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const mockPrisma = {
      $disconnect: jest.fn().mockResolvedValue(undefined),
      $connect: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'BACKUP_STORAGE_DIR') return testStorageDir;
              return defaultValue;
            }),
          },
        },
        { provide: PgRunnerService, useValue: mockPgRunner },
        { provide: AuditService, useValue: mockAudit },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BackupService>(BackupService);
    pgRunner = module.get(PgRunnerService);
    audit = module.get(AuditService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  });

  describe('createBackup', () => {
    it('should create backup file, metadata, and log audit', async () => {
      const backup = await service.createBackup({
        type: 'MANUAL',
        comment: 'Test comment',
        staffId: 'staff-1',
        staffName: 'Admin User',
      });

      expect(backup.id).toBeDefined();
      expect(backup.type).toBe('MANUAL');
      expect(backup.comment).toBe('Test comment');
      expect(backup.checksumSha256).toBeDefined();
      expect(fs.existsSync(backup.filepath)).toBe(true);

      const metaPath = backup.filepath.replace(/\.dump$/, '.meta.json');
      expect(fs.existsSync(metaPath)).toBe(true);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DB_BACKUP_CREATED',
          entity: 'Backup',
          staffId: 'staff-1',
        }),
      );
    });

    it('should reject if another operation is currently locked', async () => {
      // Simulate lock
      (service as any).isLocked = true;

      await expect(service.createBackup()).rejects.toThrow(ConflictException);
    });
  });

  describe('listBackups', () => {
    it('should list backups sorted descending by date', async () => {
      await service.createBackup({ type: 'MANUAL', comment: 'First' });
      await service.createBackup({ type: 'SCHEDULED', comment: 'Second' });

      const list = await service.listBackups();
      expect(list.length).toBe(2);
      expect(new Date(list[0].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(list[1].createdAt).getTime(),
      );
    });
  });

  describe('restoreBackup', () => {
    it('should reject invalid confirmation token', async () => {
      await expect(
        service.restoreBackup('id-1', { confirmation: 'WRONG' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if backup does not exist', async () => {
      await expect(
        service.restoreBackup('non-existent', { confirmation: 'XAC NHAN' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should automatically take pre-restore snapshot, disconnect, restore, reconnect, and audit', async () => {
      const initial = await service.createBackup({
        type: 'MANUAL',
        comment: 'To Restore',
      });

      const result = await service.restoreBackup(initial.id, {
        confirmation: 'XAC NHAN',
        staffId: 'staff-admin',
      });

      expect(result.success).toBe(true);
      expect(result.preRestoreSnapshotId).toBeDefined();
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('DROP SCHEMA public CASCADE'),
      );
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('CREATE SCHEMA public'),
      );
      expect(prisma.$disconnect).toHaveBeenCalled();
      expect(pgRunner.restoreFromFile).toHaveBeenCalledWith(initial.filepath);
      expect(prisma.$connect).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DB_RESTORE_COMPLETED',
          entity: 'Backup',
        }),
      );
    });

    // Sự cố 23/09/2026: pg_terminate_backend giết luôn kết nối đang ghi audit
    // (fire-and-forget) → unhandledRejection → crash handler tắt API giữa chừng.
    it('audit ghi thất bại chỉ cảnh báo, không văng unhandled rejection', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      audit.log.mockRejectedValue(
        new Error('terminating connection due to administrator command'),
      );

      await expect(
        service.createBackup({ type: 'MANUAL', comment: 'x' }),
      ).resolves.toMatchObject({ status: 'COMPLETED' });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('DB_BACKUP_CREATED'),
      );
      warn.mockRestore();
    });

    it('resetDatabase ngắt pool Prisma trước rồi gom terminate + drop vào một câu lệnh', async () => {
      await service.resetDatabase();

      expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      const [sql] = prisma.$executeRawUnsafe.mock.calls[0] as [string];
      expect(sql).toContain('pg_terminate_backend');
      expect(sql).toContain('pid <> pg_backend_pid()');
      expect(sql).toContain('DROP SCHEMA public CASCADE');
      expect(sql).toContain('CREATE SCHEMA public');

      const disconnectOrder = prisma.$disconnect.mock.invocationCallOrder[0];
      const resetOrder = prisma.$executeRawUnsafe.mock.invocationCallOrder[0];
      expect(disconnectOrder).toBeLessThan(resetOrder);
    });

    it('chờ audit của snapshot an toàn ghi xong rồi mới reset schema', async () => {
      const events: string[] = [];
      audit.log.mockImplementation(
        (entry) =>
          new Promise<void>((resolve) => {
            setImmediate(() => {
              events.push(`audit:${entry.action}`);
              resolve();
            });
          }),
      );
      prisma.$executeRawUnsafe.mockImplementation((() => {
        events.push('reset');
        return Promise.resolve(0);
      }) as unknown as PrismaService['$executeRawUnsafe']);

      const initial = await service.createBackup({ type: 'MANUAL' });
      events.length = 0;
      await service.restoreBackup(initial.id, { confirmation: 'XAC NHAN' });

      const snapshotAudit = events.indexOf('audit:DB_BACKUP_CREATED');
      const reset = events.indexOf('reset');
      expect(snapshotAudit).toBeGreaterThanOrEqual(0);
      expect(reset).toBeGreaterThan(snapshotAudit);
    });
  });

  describe('deleteBackup', () => {
    it('should delete both dump and meta files and audit', async () => {
      const backup = await service.createBackup({ type: 'MANUAL' });
      const metaPath = backup.filepath.replace(/\.dump$/, '.meta.json');

      expect(fs.existsSync(backup.filepath)).toBe(true);
      expect(fs.existsSync(metaPath)).toBe(true);

      await service.deleteBackup(backup.id, 'staff-1');

      expect(fs.existsSync(backup.filepath)).toBe(false);
      expect(fs.existsSync(metaPath)).toBe(false);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DB_BACKUP_DELETED',
          entity: 'Backup',
          entityId: backup.id,
        }),
      );
    });
  });

  describe('pruneOldBackups', () => {
    it('should only prune SCHEDULED backups beyond retention limit, preserving MANUAL', async () => {
      // Create 3 scheduled backups
      await service.createBackup({
        type: 'SCHEDULED',
        comment: 'S1',
      });
      await service.createBackup({
        type: 'SCHEDULED',
        comment: 'S2',
      });
      await service.createBackup({
        type: 'SCHEDULED',
        comment: 'S3',
      });
      // Create 1 manual backup
      const m1 = await service.createBackup({ type: 'MANUAL', comment: 'M1' });

      // Prune to keep 2 scheduled
      await service.pruneOldBackups(2);

      const remaining = await service.listBackups();
      const scheduled = remaining.filter((b) => b.type === 'SCHEDULED');
      const manual = remaining.filter((b) => b.type === 'MANUAL');

      expect(scheduled.length).toBe(2);
      expect(manual.length).toBe(1);
      expect(manual[0].id).toBe(m1.id);
    });
  });
});
