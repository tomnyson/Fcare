/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException } from '@nestjs/common';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { SecuritySettingsService } from './security-settings.service';

function build(row: { idleLockMinutes: number } | null) {
  const prisma = {
    securitySetting: {
      findUnique: jest.fn().mockResolvedValue(row),
      upsert: jest.fn(
        ({ create }: { create: { idleLockMinutes: number } }) => ({
          id: 'default',
          idleLockMinutes: create.idleLockMinutes,
          updatedAt: new Date('2026-09-30T00:00:00Z'),
        }),
      ),
    },
  } as unknown as PrismaService;
  const audit = { log: jest.fn() } as unknown as AuditService;
  return { service: new SecuritySettingsService(prisma, audit), prisma, audit };
}

describe('SecuritySettingsService', () => {
  it('chưa cấu hình → mặc định 15 phút', async () => {
    const { service } = build(null);
    await expect(service.getIdleLockMinutes()).resolves.toBe(15);
  });

  it('đọc đúng giá trị ADMIN đã lưu', async () => {
    const { service } = build({ idleLockMinutes: 5 });
    await expect(service.getIdleLockMinutes()).resolves.toBe(5);
  });

  it('giá trị lạ trong DB (sửa tay) → quay về mặc định, không khoá sai giờ', async () => {
    const { service } = build({ idleLockMinutes: 7 });
    await expect(service.getIdleLockMinutes()).resolves.toBe(15);
  });

  it('ADMIN lưu mốc hợp lệ → upsert singleton + ghi audit', async () => {
    const { service, prisma, audit } = build(null);
    const view = await service.update('admin-1', { idleLockMinutes: 30 });
    expect(view.idleLockMinutes).toBe(30);
    expect(prisma.securitySetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'default' },
        create: { id: 'default', idleLockMinutes: 30, updatedById: 'admin-1' },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SECURITY_SETTINGS_UPDATE',
        metadata: { idleLockMinutes: 30 },
      }),
    );
  });

  it('mốc ngoài danh sách → 400', async () => {
    const { service } = build(null);
    await expect(
      service.update('admin-1', { idleLockMinutes: 45 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
