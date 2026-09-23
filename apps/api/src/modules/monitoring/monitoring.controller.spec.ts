/* eslint-disable @typescript-eslint/unbound-method */
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { CHECK_POLICIES_KEY } from '../../common/decorators/check-policies.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { MonitoringController } from './monitoring.controller';
import { MonitoringReportService } from './monitoring-report.service';
import { MonitoringSettingsService } from './monitoring-settings.service';

const admin: AuthUser = {
  id: 'admin-1',
  staffCode: 'ADMIN01',
  fullName: 'Quản trị viên',
  roles: ['ADMIN'],
  departmentId: null,
  consented: true,
  mustChangePassword: false,
};

describe('MonitoringController', () => {
  let controller: MonitoringController;
  let settings: jest.Mocked<MonitoringSettingsService>;
  let report: jest.Mocked<MonitoringReportService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MonitoringController],
      providers: [
        {
          provide: MonitoringSettingsService,
          useValue: {
            getView: jest.fn().mockResolvedValue({ hasWebhook: false }),
            update: jest.fn().mockResolvedValue({ hasWebhook: true }),
          },
        },
        {
          provide: MonitoringReportService,
          useValue: {
            sendTest: jest.fn().mockResolvedValue(undefined),
            sendWeeklyReport: jest.fn().mockResolvedValue({ sent: true }),
            listGroups: jest.fn().mockResolvedValue({ items: [], meta: {} }),
            listWeeks: jest.fn().mockResolvedValue([]),
            purgeNow: jest.fn().mockResolvedValue({ deleted: 3 }),
          },
        },
      ],
    }).compile();
    controller = moduleRef.get(MonitoringController);
    settings = moduleRef.get(MonitoringSettingsService);
    report = moduleRef.get(MonitoringReportService);
  });

  it('gắn policy ở mức class (chỉ ai manage Monitoring)', () => {
    const policies = new Reflector().get<unknown[]>(
      CHECK_POLICIES_KEY,
      MonitoringController,
    );
    expect(policies).toHaveLength(1);
  });

  it('settings: đọc và cập nhật theo người thao tác', async () => {
    await controller.getSettings();
    expect(settings.getView).toHaveBeenCalled();
    const dto = { enabled: true, retentionDays: 14 };
    await controller.updateSettings(admin, dto);
    expect(settings.update).toHaveBeenCalledWith('admin-1', dto);
  });

  it('gửi thử với URL chưa lưu, trả { sent: true }', async () => {
    const url = 'https://discord.com/api/webhooks/1/t';
    await expect(
      controller.sendTest(admin, { webhookUrl: url }),
    ).resolves.toEqual({ sent: true });
    expect(report.sendTest).toHaveBeenCalledWith('admin-1', url);
  });

  it('gửi báo cáo tay kèm tuần', async () => {
    await controller.sendReport(admin, { week: '2026-09-14' });
    expect(report.sendWeeklyReport).toHaveBeenCalledWith({
      trigger: 'MANUAL',
      actorId: 'admin-1',
      week: '2026-09-14',
    });
  });

  it('danh sách lỗi, danh sách tuần, dọn ngay', async () => {
    const query = { page: 1, limit: 20, level: 'FATAL' as const };
    await controller.listErrors(query);
    expect(report.listGroups).toHaveBeenCalledWith(query);
    await controller.listWeeks();
    expect(report.listWeeks).toHaveBeenCalled();
    await expect(controller.purge(admin)).resolves.toEqual({ deleted: 3 });
    expect(report.purgeNow).toHaveBeenCalledWith('admin-1');
  });
});
