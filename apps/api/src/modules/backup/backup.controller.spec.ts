/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';
import { AuthUser } from '../../common/types/auth-user';

describe('BackupController', () => {
  let controller: BackupController;
  let service: jest.Mocked<BackupService>;
  let scheduler: jest.Mocked<BackupSchedulerService>;

  const mockUser: AuthUser = {
    id: 'admin-1',
    staffCode: 'ADMIN01',
    fullName: 'Quản trị viên',
    roles: ['ADMIN'],
    departmentId: null,
    consented: true,
    mustChangePassword: false,
  };

  beforeEach(async () => {
    const mockBackupService = {
      listBackups: jest.fn().mockResolvedValue([]),
      getOverviewStats: jest.fn().mockResolvedValue({ totalBackups: 0 }),
      createBackup: jest
        .fn()
        .mockResolvedValue({ id: 'b-1', filename: 'b-1.dump' }),
      getBackupById: jest.fn().mockResolvedValue({
        id: 'b-1',
        filename: 'b-1.dump',
        filepath: '/tmp/test.dump',
      }),
      deleteBackup: jest.fn().mockResolvedValue(undefined),
      restoreBackup: jest.fn().mockResolvedValue({ success: true }),
      saveUploadedBackup: jest.fn().mockResolvedValue({ id: 'b-up' }),
      getScheduleConfig: jest.fn().mockReturnValue({ enabled: true }),
      updateScheduleConfig: jest.fn().mockReturnValue({ enabled: false }),
    };

    const mockScheduler = {
      syncSchedule: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BackupController],
      providers: [
        { provide: BackupService, useValue: mockBackupService },
        { provide: BackupSchedulerService, useValue: mockScheduler },
      ],
    }).compile();

    controller = module.get<BackupController>(BackupController);
    service = module.get(BackupService);
    scheduler = module.get(BackupSchedulerService);
  });

  it('should list backups', async () => {
    await controller.list();
    expect(service.listBackups).toHaveBeenCalled();
  });

  it('should get stats', async () => {
    await controller.getStats();
    expect(service.getOverviewStats).toHaveBeenCalled();
  });

  it('should create backup', async () => {
    await controller.create(mockUser, { comment: 'Note' });
    expect(service.createBackup).toHaveBeenCalledWith({
      comment: 'Note',
      staffId: 'admin-1',
      type: 'MANUAL',
    });
  });

  it('should restore backup', async () => {
    await controller.restore('b-1', mockUser, { confirmation: 'XAC NHAN' });
    expect(service.restoreBackup).toHaveBeenCalledWith('b-1', {
      confirmation: 'XAC NHAN',
      staffId: 'admin-1',
    });
  });

  it('should delete backup', async () => {
    await controller.delete('b-1', mockUser);
    expect(service.deleteBackup).toHaveBeenCalledWith('b-1', 'admin-1');
  });

  it('should update config and sync schedule', async () => {
    const dto = {
      enabled: false,
      cronExpression: '0 3 * * *',
      retentionCount: 5,
    };
    await controller.updateConfig(mockUser, dto);
    expect(service.updateScheduleConfig).toHaveBeenCalledWith(dto, 'admin-1');
    expect(scheduler.syncSchedule).toHaveBeenCalled();
  });
});
