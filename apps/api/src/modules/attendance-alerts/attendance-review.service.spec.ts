import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EscalationService } from '../alerts/escalation.service';
import type {
  EscalationJobData,
  NotificationDispatchService,
} from '../alerts/notification-dispatch.service';
import { AttendanceReviewService } from './attendance-review.service';

const containing = (value: unknown): unknown => expect.objectContaining(value);
const anyDate = (): unknown => expect.any(Date);

const student = { id: 'sv-1', studentCode: 'SE1', fullName: 'Nguyễn An' };
const section = { id: 'sec-a', code: 'SE101-A', lecturerId: 'gv-chi' };

function enrollment(absentSessions: number) {
  return {
    studentId: student.id,
    classSectionId: section.id,
    absentSessions,
    student,
    classSection: section,
  };
}

function setup(
  options: {
    enrollments?: ReturnType<typeof enrollment>[];
    openAlerts?: Array<{
      id: string;
      studentId: string;
      classSectionId: string | null;
      level: number;
      absentSessions: number | null;
    }>;
  } = {},
) {
  // Tách `models` ra để `$transaction` không tham chiếu vòng (TS suy ra any).
  const models = {
    enrollment: {
      findMany: jest.fn().mockResolvedValue(options.enrollments ?? []),
    },
    alert: {
      findMany: jest.fn().mockResolvedValue(options.openAlerts ?? []),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'alert-new', ...data }),
        ),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    ...models,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn(models),
    ),
  };
  const escalation = {
    computeRecipientIds: jest.fn().mockResolvedValue(['gv-chi', 'ctsv-lan']),
  };
  const dispatch = { enqueueOrDeliver: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const queue = {} as Queue<EscalationJobData>;
  const service = new AttendanceReviewService(
    prisma as unknown as PrismaService,
    escalation as unknown as EscalationService,
    dispatch as unknown as NotificationDispatchService,
    audit as unknown as AuditService,
    queue,
  );
  return { prisma, escalation, dispatch, audit, service };
}

describe('AttendanceReviewService.reviewTerm', () => {
  it('chỉ rà soát SV đang học, lớp có giảng viên, đã chạm ngưỡng vắng', async () => {
    const { service, prisma } = setup();
    await service.reviewTerm('FA26');
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          absentSessions: { gte: 2 },
          classSection: { term: 'FA26', lecturerId: { not: null } },
          student: { status: { in: ['STUDYING', 'WARNED'] } },
        },
      }),
    );
    expect(prisma.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          source: 'AUTO_ATTENDANCE',
          term: 'FA26',
          status: { not: 'RESOLVED' },
        },
      }),
    );
  });

  it('vắng 2 buổi lần đầu → tạo cảnh báo cấp 2 do hệ thống, báo theo ma trận, không loại ai', async () => {
    const { service, prisma, escalation, dispatch, audit } = setup({
      enrollments: [enrollment(2)],
    });

    const result = await service.reviewTerm('FA26', {
      batchId: 'batch-1',
      actorId: 'dt-hoa',
    });

    expect(result).toEqual({
      created: 1,
      upgraded: 0,
      unchanged: 0,
      notified: 2,
    });
    expect(prisma.alert.create).toHaveBeenCalledWith({
      data: {
        studentId: 'sv-1',
        raisedById: null,
        level: 2,
        source: 'AUTO_ATTENDANCE',
        classSectionId: 'sec-a',
        term: 'FA26',
        absentSessions: 2,
        reason:
          'Vắng 2 buổi tại lớp SE101-A (học kỳ FA26) — rà soát tự động sau import điểm danh',
      },
    });
    expect(escalation.computeRecipientIds).toHaveBeenCalledWith('sv-1', 2);
    expect(dispatch.enqueueOrDeliver).toHaveBeenCalledWith(expect.anything(), {
      alertId: 'alert-new',
      recipientIds: ['gv-chi', 'ctsv-lan'],
      title: 'Cảnh báo Trung bình (điểm danh) — Nguyễn An (SE1)',
      body: 'Vắng 2 buổi tại lớp SE101-A (học kỳ FA26) — rà soát tự động sau import điểm danh',
      targetUrl: '/students/sv-1?tab=care-logs&alertId=alert-new',
    });
    expect(audit.log).toHaveBeenCalledWith({
      staffId: 'dt-hoa',
      action: 'ATTENDANCE_REVIEW',
      entity: 'ImportBatch',
      entityId: 'batch-1',
      metadata: {
        term: 'FA26',
        created: 1,
        upgraded: 0,
        unchanged: 0,
        notified: 2,
      },
    });
  });

  it('import lại cùng tuần → không tạo trùng, không thông báo lại', async () => {
    const { service, prisma, dispatch } = setup({
      enrollments: [enrollment(2)],
      openAlerts: [
        {
          id: 'alert-old',
          studentId: 'sv-1',
          classSectionId: 'sec-a',
          level: 2,
          absentSessions: 2,
        },
      ],
    });
    const result = await service.reviewTerm('FA26');
    expect(result).toMatchObject({ created: 0, upgraded: 0, unchanged: 1 });
    expect(prisma.alert.create).not.toHaveBeenCalled();
    expect(prisma.alert.update).not.toHaveBeenCalled();
    expect(dispatch.enqueueOrDeliver).not.toHaveBeenCalled();
  });

  it('vắng thêm nhưng cùng cấp → chỉ cập nhật số buổi, không thông báo', async () => {
    const { service, prisma, dispatch } = setup({
      enrollments: [enrollment(4)],
      openAlerts: [
        {
          id: 'alert-old',
          studentId: 'sv-1',
          classSectionId: 'sec-a',
          level: 3,
          absentSessions: 3,
        },
      ],
    });
    const result = await service.reviewTerm('FA26');
    expect(result).toMatchObject({ created: 0, upgraded: 0, unchanged: 1 });
    expect(prisma.alert.update).toHaveBeenCalledWith({
      where: { id: 'alert-old' },
      data: {
        absentSessions: 4,
        reason:
          'Vắng 4 buổi tại lớp SE101-A (học kỳ FA26) — rà soát tự động sau import điểm danh',
      },
    });
    expect(dispatch.enqueueOrDeliver).not.toHaveBeenCalled();
  });

  it('2 → 3 buổi: đóng cảnh báo cấp 2, tạo cảnh báo cấp 3 mới và thông báo lại (reset chăm sóc)', async () => {
    const { service, prisma, escalation, dispatch } = setup({
      enrollments: [enrollment(3)],
      openAlerts: [
        {
          id: 'alert-old',
          studentId: 'sv-1',
          classSectionId: 'sec-a',
          level: 2,
          absentSessions: 2,
        },
      ],
    });
    const result = await service.reviewTerm('FA26');
    expect(result).toEqual({
      created: 0,
      upgraded: 1,
      unchanged: 0,
      notified: 2,
    });
    expect(prisma.alert.update).toHaveBeenCalledWith({
      where: { id: 'alert-old' },
      data: {
        status: 'RESOLVED',
        resolvedAt: anyDate(),
        resolutionNote:
          'Nâng cấp lên cảnh báo Cao (vắng 3 buổi) — rà soát điểm danh tự động',
      },
    });
    expect(prisma.alert.create).toHaveBeenCalledWith({
      data: containing({
        level: 3,
        absentSessions: 3,
        classSectionId: 'sec-a',
      }),
    });
    expect(escalation.computeRecipientIds).toHaveBeenCalledWith('sv-1', 3);
    expect(dispatch.enqueueOrDeliver).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        alertId: 'alert-new',
        title: 'Cảnh báo Cao (điểm danh) — Nguyễn An (SE1)',
      }),
    );
  });

  it('hai lượt commit chạm nhau → P2002 được coi là không đổi, không thông báo', async () => {
    const { service, prisma, dispatch } = setup({
      enrollments: [enrollment(2)],
    });
    prisma.alert.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const result = await service.reviewTerm('FA26');
    expect(result).toEqual({
      created: 0,
      upgraded: 0,
      unchanged: 1,
      notified: 0,
    });
    expect(dispatch.enqueueOrDeliver).not.toHaveBeenCalled();
  });

  it('gửi thông báo lỗi ở một SV không làm hỏng cả đợt rà soát', async () => {
    const { service, dispatch } = setup({
      enrollments: [
        enrollment(2),
        {
          ...enrollment(3),
          studentId: 'sv-2',
          student: { id: 'sv-2', studentCode: 'SE2', fullName: 'Trần Bình' },
        },
      ],
    });
    dispatch.enqueueOrDeliver
      .mockRejectedValueOnce(new Error('Redis + DB cùng chết'))
      .mockResolvedValueOnce(undefined);
    const result = await service.reviewTerm('FA26');
    expect(result).toEqual({
      created: 2,
      upgraded: 0,
      unchanged: 0,
      notified: 2,
    });
  });

  it('không có người nhận → vẫn tạo cảnh báo, không gọi gửi', async () => {
    const { service, escalation, dispatch } = setup({
      enrollments: [enrollment(2)],
    });
    escalation.computeRecipientIds.mockResolvedValue([]);
    const result = await service.reviewTerm('FA26');
    expect(result).toMatchObject({ created: 1, notified: 0 });
    expect(dispatch.enqueueOrDeliver).not.toHaveBeenCalled();
  });
});
