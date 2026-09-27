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
      source?: 'MANUAL' | 'AUTO_ATTENDANCE';
      reason?: string;
    }>;
    /** Số cảnh báo tự động bị đóng vì môn không cấm thi do điểm danh. */
    closed?: number;
  } = {},
) {
  // Mặc định là cảnh báo điểm danh tự động — test nguồn khác thì ghi đè.
  const openAlerts = (options.openAlerts ?? []).map((alert) => ({
    source: 'AUTO_ATTENDANCE',
    reason: 'Lý do cũ',
    ...alert,
  }));
  // Tách `models` ra để `$transaction` không tham chiếu vòng (TS suy ra any).
  const models = {
    enrollment: {
      findMany: jest.fn().mockResolvedValue(options.enrollments ?? []),
    },
    alert: {
      findMany: jest.fn().mockResolvedValue(openAlerts),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'alert-new', ...data }),
        ),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: options.closed ?? 0 }),
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
          classSection: {
            term: 'FA26',
            lecturerId: { not: null },
            // Môn "Tỷ lệ phải đi học" = 0 không cấm thi do điểm danh → không cảnh báo vắng.
            subject: {
              OR: [
                { attendanceRateRequired: null },
                { attendanceRateRequired: { gt: 0 } },
              ],
            },
          },
          student: { status: { in: ['STUDYING', 'WARNED'] } },
        },
      }),
    );
    expect(prisma.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Mọi nguồn: cảnh báo giảng viên phát tay cũng được gộp, không tạo thêm.
        where: {
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
      closed: 0,
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
        closed: 0,
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

  it('2 → 3 buổi: nâng cảnh báo đang mở lên cấp 3 tại chỗ, mở lại và báo lại (replay)', async () => {
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
      closed: 0,
    });
    expect(prisma.alert.create).not.toHaveBeenCalled();
    expect(prisma.alert.update).toHaveBeenCalledWith({
      where: { id: 'alert-old' },
      data: {
        level: 3,
        absentSessions: 3,
        reason:
          'Vắng 3 buổi tại lớp SE101-A (học kỳ FA26) — rà soát tự động sau import điểm danh',
        status: 'OPEN',
        ownerCaredAt: null,
      },
    });
    expect(escalation.computeRecipientIds).toHaveBeenCalledWith('sv-1', 3);
    expect(dispatch.enqueueOrDeliver).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        alertId: 'alert-old',
        title: 'Cảnh báo Cao (điểm danh) — Nguyễn An (SE1)',
        replay: true,
      }),
    );
  });

  it('giảng viên đã phát tay cùng mức → chỉ ghi thêm số buổi vào lý do, giữ lý do của giảng viên', async () => {
    const { service, prisma, dispatch } = setup({
      enrollments: [enrollment(3)],
      openAlerts: [
        {
          id: 'alert-gv',
          studentId: 'sv-1',
          classSectionId: 'sec-a',
          level: 3,
          absentSessions: null,
          source: 'MANUAL',
          reason: 'Em hay ngủ gật trong lớp.',
        },
      ],
    });
    const result = await service.reviewTerm('FA26');
    expect(result).toMatchObject({ created: 0, upgraded: 0, unchanged: 1 });
    expect(prisma.alert.create).not.toHaveBeenCalled();
    const [args] = prisma.alert.update.mock.calls[0] as [
      {
        where: { id: string };
        data: { absentSessions: number; reason: string };
      },
    ];
    expect(args.where.id).toBe('alert-gv');
    expect(args.data.absentSessions).toBe(3);
    expect(args.data.reason).toMatch(
      /^Em hay ngủ gật trong lớp\.\n\n\[Cập nhật .*\] Vắng 3 buổi/,
    );
    expect(dispatch.enqueueOrDeliver).not.toHaveBeenCalled();
  });

  it('giảng viên phát tay mức 2, nay vắng 3 → nâng tại chỗ, lý do giảng viên vẫn còn', async () => {
    const { service, prisma, dispatch } = setup({
      enrollments: [enrollment(3)],
      openAlerts: [
        {
          id: 'alert-gv',
          studentId: 'sv-1',
          classSectionId: 'sec-a',
          level: 2,
          absentSessions: null,
          source: 'MANUAL',
          reason: 'Em hay ngủ gật trong lớp.',
        },
      ],
    });
    const result = await service.reviewTerm('FA26');
    expect(result).toMatchObject({ upgraded: 1 });
    expect(prisma.alert.create).not.toHaveBeenCalled();
    const [args] = prisma.alert.update.mock.calls[0] as [
      { data: { level: number; reason: string } },
    ];
    expect(args.data.level).toBe(3);
    expect(args.data.reason).toContain('Em hay ngủ gật trong lớp.');
    expect(dispatch.enqueueOrDeliver).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ alertId: 'alert-gv', replay: true }),
    );
  });

  it('dữ liệu cũ có hai cảnh báo mở cùng lớp → so với cảnh báo mức cao nhất', async () => {
    const { service, prisma, dispatch } = setup({
      enrollments: [enrollment(3)],
      openAlerts: [
        {
          id: 'alert-3',
          studentId: 'sv-1',
          classSectionId: 'sec-a',
          level: 3,
          absentSessions: 3,
        },
        {
          id: 'alert-2',
          studentId: 'sv-1',
          classSectionId: 'sec-a',
          level: 2,
          absentSessions: 2,
        },
      ],
    });
    const result = await service.reviewTerm('FA26');
    expect(result).toMatchObject({ upgraded: 0, unchanged: 1 });
    expect(prisma.alert.update).not.toHaveBeenCalled();
    expect(dispatch.enqueueOrDeliver).not.toHaveBeenCalled();
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
      closed: 0,
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
      closed: 0,
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

describe('AttendanceReviewService.reviewTerm — môn không cấm thi do điểm danh', () => {
  it('mỗi lượt rà soát tự đóng cảnh báo điểm danh tự động còn mở của môn tỷ lệ phải đi học = 0', async () => {
    const { service, prisma, audit } = setup({ closed: 5 });
    const result = await service.reviewTerm('FA26', {
      batchId: 'batch-1',
      actorId: 'dt-1',
    });
    const [call] = prisma.alert.updateMany.mock.calls[0] as [
      { where: unknown; data: Record<string, unknown> },
    ];
    expect(call.where).toEqual({
      term: 'FA26',
      // Chỉ cảnh báo hệ thống tự phát — cảnh báo giảng viên phát tay giữ nguyên.
      source: 'AUTO_ATTENDANCE',
      status: { not: 'RESOLVED' },
      classSection: { subject: { attendanceRateRequired: 0 } },
    });
    expect(call.data).toMatchObject({
      status: 'RESOLVED',
      resolvedById: 'dt-1',
    });
    expect(call.data.resolvedAt).toBeInstanceOf(Date);
    expect(call.data.resolutionNote).toContain('tỷ lệ phải đi học = 0');
    expect(result).toMatchObject({ closed: 5 });
    const [entry] = audit.log.mock.calls[0] as [{ metadata: unknown }];
    expect(entry.metadata).toMatchObject({ term: 'FA26', closed: 5 });
  });

  it('hệ thống tự chạy (không có người bấm) → resolvedById null', async () => {
    const { service, prisma } = setup();
    await service.reviewTerm('FA26');
    const [call] = prisma.alert.updateMany.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(call.data.resolvedById).toBeNull();
  });

  it('đóng trước khi nạp cảnh báo mở để không gộp nhầm vào cảnh báo vừa đóng', async () => {
    const { service, prisma } = setup();
    await service.reviewTerm('FA26');
    expect(prisma.alert.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.alert.findMany.mock.invocationCallOrder[0],
    );
  });
});
