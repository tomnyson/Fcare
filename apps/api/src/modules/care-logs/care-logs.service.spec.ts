import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import { CareLogsService } from './care-logs.service';

/* `expect.objectContaining`/`expect.any` trả về any trong @types/jest → bọc lại. */
const containing = (value: unknown): unknown => expect.objectContaining(value);
const anyDate = (): unknown => expect.any(Date);

const owner: AuthUser = {
  id: 'gv-chi',
  staffCode: 'GV1',
  fullName: 'Chi',
  roles: ['LECTURER'],
  departmentId: 'dept-se',
  consented: true,
  mustChangePassword: false,
};
const otherLecturer: AuthUser = { ...owner, id: 'gv-binh', staffCode: 'GV2' };

const dto = {
  studentId: 'sv-1',
  channel: 'IN_PERSON' as const,
  content: 'Đã gọi em lên trao đổi về việc nghỉ học',
};

function setup(alert: Record<string, unknown> | null = null) {
  const tx = {
    alert: {
      findUnique: jest.fn().mockResolvedValue(alert),
      update: jest.fn().mockResolvedValue({}),
    },
    careLog: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: unknown }) =>
          Promise.resolve({ id: 'log-1', ...(data as object), staff: {} }),
        ),
    },
  };
  const prisma = {
    student: { findFirst: jest.fn().mockResolvedValue({ id: 'sv-1' }) },
    careLog: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new CareLogsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { prisma, tx, audit, service };
}

const openAlert = {
  id: 'alert-1',
  studentId: 'sv-1',
  status: 'OPEN',
  ownerCaredAt: null,
  classSection: { lecturerId: 'gv-chi' },
};

describe('CareLogsService.create — gắn cảnh báo điểm danh', () => {
  it('không gắn cảnh báo → ghi nhật ký như cũ, không đụng bảng alert', async () => {
    const { service, tx, prisma } = setup();
    await service.create(owner, dto);
    expect(prisma.student.findFirst).toHaveBeenCalledWith({
      where: containing({ id: 'sv-1' }),
    });
    expect(tx.careLog.create).toHaveBeenCalledWith(
      containing({
        data: { ...dto, staffId: 'gv-chi' },
      }),
    );
    expect(tx.alert.findUnique).not.toHaveBeenCalled();
    expect(tx.alert.update).not.toHaveBeenCalled();
  });

  it('GV đứng lớp chăm sóc → ghi ownerCaredAt, OPEN → ACKNOWLEDGED, audit ALERT_OWNER_CARED', async () => {
    const { service, tx, audit } = setup(openAlert);
    await service.create(owner, { ...dto, alertId: 'alert-1' });
    expect(tx.careLog.create).toHaveBeenCalledWith(
      containing({
        data: { ...dto, alertId: 'alert-1', staffId: 'gv-chi' },
      }),
    );
    expect(tx.alert.update).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: { ownerCaredAt: anyDate(), status: 'ACKNOWLEDGED' },
    });
    expect(audit.log).toHaveBeenCalledWith({
      staffId: 'gv-chi',
      action: 'ALERT_OWNER_CARED',
      entity: 'Alert',
      entityId: 'alert-1',
      metadata: { careLogId: 'log-1', studentId: 'sv-1' },
    });
  });

  it('GV lớp khác chăm sóc → nhật ký vẫn gắn cảnh báo nhưng KHÔNG tắt hiện liên tục', async () => {
    const { service, tx, audit } = setup(openAlert);
    await service.create(otherLecturer, { ...dto, alertId: 'alert-1' });
    expect(tx.careLog.create).toHaveBeenCalledWith(
      containing({
        data: containing({
          alertId: 'alert-1',
          staffId: 'gv-binh',
        }),
      }),
    );
    expect(tx.alert.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('GV đứng lớp chăm sóc lần hai → giữ ownerCaredAt lần đầu, không ghi đè', async () => {
    const { service, tx } = setup({
      ...openAlert,
      status: 'ACKNOWLEDGED',
      ownerCaredAt: new Date('2026-09-11T00:00:00Z'),
    });
    await service.create(owner, { ...dto, alertId: 'alert-1' });
    expect(tx.alert.update).not.toHaveBeenCalled();
  });

  it('cảnh báo đã ACKNOWLEDGED bởi người khác → chỉ ghi ownerCaredAt, không đổi status', async () => {
    const { service, tx } = setup({ ...openAlert, status: 'ACKNOWLEDGED' });
    await service.create(owner, { ...dto, alertId: 'alert-1' });
    expect(tx.alert.update).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: { ownerCaredAt: anyDate() },
    });
  });

  it('cảnh báo không tồn tại → 404', async () => {
    const { service } = setup(null);
    await expect(
      service.create(owner, { ...dto, alertId: 'alert-x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cảnh báo của sinh viên khác → 400, không ghi gì', async () => {
    const { service, tx } = setup({ ...openAlert, studentId: 'sv-2' });
    await expect(
      service.create(owner, { ...dto, alertId: 'alert-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.careLog.create).not.toHaveBeenCalled();
  });

  it('sinh viên ngoài phạm vi → 404 trước khi vào transaction (RULE 2)', async () => {
    const { service, prisma } = setup(openAlert);
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(
      service.create(owner, { ...dto, alertId: 'alert-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CareLogsService.list', () => {
  it('kèm thông tin cảnh báo gắn với nhật ký và lọc theo phạm vi', async () => {
    const { service, prisma } = setup();
    await service.list(owner, { studentId: 'sv-1' });
    expect(prisma.careLog.findMany).toHaveBeenCalledWith(
      containing({
        where: {
          studentId: 'sv-1',
          student: {
            AND: [
              {
                enrollments: {
                  some: { classSection: { lecturerId: 'gv-chi' } },
                },
              },
            ],
          },
        },
        include: containing({
          alert: {
            select: {
              id: true,
              level: true,
              source: true,
              classSection: { select: { code: true } },
            },
          },
        }),
      }),
    );
  });
});
