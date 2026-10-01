import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DEFAULT_IDLE_LOCK_MINUTES,
  isIdleLockMinutes,
  type IdleLockMinutes,
} from '@fcare/shared-types';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

const SINGLETON_ID = 'default';

export interface SecuritySettingsView {
  idleLockMinutes: IdleLockMinutes;
  updatedAt: Date | null;
}

/** Cấu hình bảo mật toàn hệ thống (bảng `security_settings`, một dòng). */
@Injectable()
export class SecuritySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Giá trị lạ (sửa tay trong DB) quay về mặc định thay vì khoá sai giờ. */
  async getIdleLockMinutes(): Promise<IdleLockMinutes> {
    return (await this.getView()).idleLockMinutes;
  }

  async getView(): Promise<SecuritySettingsView> {
    const row = await this.prisma.securitySetting.findUnique({
      where: { id: SINGLETON_ID },
    });
    return {
      idleLockMinutes: isIdleLockMinutes(row?.idleLockMinutes)
        ? row.idleLockMinutes
        : DEFAULT_IDLE_LOCK_MINUTES,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async update(
    staffId: string,
    input: { idleLockMinutes: number },
  ): Promise<SecuritySettingsView> {
    const { idleLockMinutes } = input;
    if (!isIdleLockMinutes(idleLockMinutes)) {
      throw new BadRequestException(
        'Thời gian khoá chỉ được chọn 3, 5, 10, 15, 30 hoặc 60 phút.',
      );
    }
    const row = await this.prisma.securitySetting.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, idleLockMinutes, updatedById: staffId },
      update: { idleLockMinutes, updatedById: staffId },
    });
    await this.audit.log({
      staffId,
      action: 'SECURITY_SETTINGS_UPDATE',
      entity: 'SecuritySetting',
      entityId: SINGLETON_ID,
      metadata: { idleLockMinutes },
    });
    return { idleLockMinutes, updatedAt: row.updatedAt };
  }
}
