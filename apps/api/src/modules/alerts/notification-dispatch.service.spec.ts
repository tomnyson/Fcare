import type { PrismaService } from '../../prisma/prisma.service';
import {
  NotificationDispatchService,
  type NotificationDeliveryData,
} from './notification-dispatch.service';
import { NotificationEventsService } from './notification-events.service';
import type { EmailService } from '../email/email.service';
import type { PushService } from '../push/push.service';

describe('NotificationDispatchService — gửi thông báo idempotent', () => {
  function makeService(
    notifications: Array<Record<string, unknown>>,
    alertLevel: number | null = 3,
  ) {
    const createManyAndReturn = jest.fn().mockResolvedValue(notifications);
    const findUnique = jest
      .fn()
      .mockResolvedValue(alertLevel === null ? null : { level: alertLevel });
    const prisma = {
      notification: { createManyAndReturn },
      alert: { findUnique },
    } as unknown as PrismaService;
    const events = new NotificationEventsService();
    const emit = jest.spyOn(events, 'emit');
    const sendAlertPush = jest.fn().mockResolvedValue(undefined);
    const push = { sendAlertPush } as unknown as PushService;
    const service = new NotificationDispatchService(
      prisma,
      events,
      undefined,
      push,
    );
    return { service, createManyAndReturn, emit, findUnique, sendAlertPush };
  }

  const jobData = {
    alertId: 'alert-1',
    recipientIds: ['tbm-se', 'dt-hoa'],
    title: 'Cảnh báo',
    body: 'lý do',
  };

  it('tạo thông báo với skipDuplicates (an toàn khi retry)', async () => {
    const notifications = [
      {
        id: 'noti-1',
        recipientId: 'tbm-se',
        alertId: 'alert-1',
        title: 'Cảnh báo',
        body: 'lý do',
        createdAt: new Date(),
      },
      {
        id: 'noti-2',
        recipientId: 'dt-hoa',
        alertId: 'alert-1',
        title: 'Cảnh báo',
        body: 'lý do',
        createdAt: new Date(),
      },
    ];
    const { service, createManyAndReturn } = makeService(notifications);
    const delivered = await service.deliver(jobData);

    expect(delivered).toBe(2);
    expect(createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            recipientId: 'tbm-se',
            alertId: 'alert-1',
            title: 'Cảnh báo',
            body: 'lý do',
          }),
          expect.objectContaining({
            recipientId: 'dt-hoa',
            alertId: 'alert-1',
            title: 'Cảnh báo',
            body: 'lý do',
          }),
        ],
      }),
    );
  });

  it('phát sự kiện SSE tới từng người nhận', async () => {
    const createdAt = new Date('2026-07-02T00:00:00Z');
    const notifications = [
      {
        id: 'noti-1',
        recipientId: 'tbm-se',
        alertId: 'alert-1',
        title: 'Cảnh báo',
        body: 'lý do',
        createdAt,
      },
      {
        id: 'noti-2',
        recipientId: 'dt-hoa',
        alertId: 'alert-1',
        title: 'Cảnh báo',
        body: 'lý do',
        createdAt,
      },
    ];
    const { service, emit } = makeService(notifications);
    await service.deliver(jobData);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(1, {
      recipientId: 'tbm-se',
      payload: {
        id: 'noti-1',
        alertId: 'alert-1',
        alertLevel: 3,
        analysisVersionId: null,
        discussionMessageId: null,
        targetUrl: null,
        title: 'Cảnh báo',
        body: 'lý do',
        createdAt,
      },
    });
  });

  it('không có người nhận → không chạm database', async () => {
    const { service, createManyAndReturn } = makeService([]);
    const delivered = await service.deliver({ ...jobData, recipientIds: [] });
    expect(delivered).toBe(0);
    expect(createManyAndReturn).not.toHaveBeenCalled();
  });

  it('gửi thông báo analysis theo source riêng và giữ idempotency', async () => {
    const createdAt = new Date('2026-07-03T00:00:00Z');
    const notifications = [
      {
        id: 'noti-3',
        recipientId: 'gv-a',
        alertId: null,
        analysisVersionId: 'analysis-version-1',
        targetUrl: '/student-analyses/analysis-version-1',
        title: 'Phân tích AI',
        body: 'Tóm tắt đã duyệt',
        createdAt,
      },
    ];
    const { service, createManyAndReturn, emit, sendAlertPush } =
      makeService(notifications);
    const data: NotificationDeliveryData = {
      recipientIds: ['gv-a'],
      title: 'Phân tích AI',
      body: 'Tóm tắt đã duyệt',
      source: {
        kind: 'analysis',
        analysisVersionId: 'analysis-version-1',
        targetUrl: '/student-analyses/analysis-version-1',
      },
    };

    const delivered = await service.deliver(data);

    expect(delivered).toBe(1);
    expect(createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            recipientId: 'gv-a',
            alertId: null,
            analysisVersionId: 'analysis-version-1',
            targetUrl: '/student-analyses/analysis-version-1',
          }),
        ],
      }),
    );
    expect(emit).toHaveBeenCalledWith({
      recipientId: 'gv-a',
      payload: {
        id: 'noti-3',
        alertId: null,
        alertLevel: null,
        analysisVersionId: 'analysis-version-1',
        discussionMessageId: null,
        targetUrl: '/student-analyses/analysis-version-1',
        title: 'Phân tích AI',
        body: 'Tóm tắt đã duyệt',
        createdAt,
      },
    });
    expect(sendAlertPush).not.toHaveBeenCalled();
  });

  it('retry không phát lại SSE khi database không tạo thêm notification', async () => {
    const { service, emit } = makeService([]);
    await service.deliver(jobData);
    expect(emit).not.toHaveBeenCalled();
  });
  const oneNotification = () => [
    {
      id: 'noti-1',
      recipientId: 'tbm-se',
      alertId: 'alert-1',
      title: 'Cảnh báo',
      body: 'lý do',
      createdAt: new Date('2026-09-21T00:00:00Z'),
    },
  ];

  it('push cảnh báo chỉ cho người VỪA được tạo thông báo', async () => {
    // dt-hoa đã có thông báo từ lần chạy trước → createManyAndReturn bỏ qua.
    const { service, sendAlertPush, findUnique } =
      makeService(oneNotification());
    await service.deliver({ ...jobData, targetUrl: '/students/sv-1' });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      select: { level: true },
    });
    expect(sendAlertPush).toHaveBeenCalledWith({
      alertId: 'alert-1',
      alertLevel: 3,
      recipientIds: ['tbm-se'],
      title: 'Cảnh báo',
      body: 'lý do',
      targetUrl: '/students/sv-1',
    });
  });

  it('không tạo thông báo mới nào thì không push, không đọc level', async () => {
    const { service, sendAlertPush, findUnique } = makeService([]);
    await service.deliver(jobData);
    expect(sendAlertPush).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('không đọc được level → SSE alertLevel null, không push', async () => {
    const { service, sendAlertPush, emit } = makeService(
      oneNotification(),
      null,
    );
    await service.deliver(jobData);
    const [event] = emit.mock.calls[0] as [
      { payload: { alertLevel: unknown } },
    ];
    expect(event.payload.alertLevel).toBeNull();
    expect(sendAlertPush).not.toHaveBeenCalled();
  });

  it('lỗi database khi đọc level vẫn giao thông báo trong app', async () => {
    const { service, findUnique, emit, sendAlertPush } =
      makeService(oneNotification());
    findUnique.mockRejectedValue(new Error('db down'));
    await expect(service.deliver(jobData)).resolves.toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(sendAlertPush).not.toHaveBeenCalled();
  });

  it('push lỗi không làm hỏng deliver', async () => {
    const { service, sendAlertPush } = makeService(oneNotification());
    sendAlertPush.mockRejectedValue(new Error('boom'));
    await expect(service.deliver(jobData)).resolves.toBe(1);
  });
});

describe('NotificationDispatchService — nguồn discussion', () => {
  it('ghi discussionMessageId + targetUrl và phát sự kiện kèm discussionMessageId', async () => {
    const createManyAndReturn = jest.fn().mockResolvedValue([
      {
        id: 'ntf-1',
        recipientId: 'staff-2',
        alertId: null,
        analysisVersionId: null,
        discussionMessageId: 'msg-1',
        targetUrl: '/students/sv-1?tab=discussion',
        title: 'Trao đổi mới',
        body: 'GV A: em này nghỉ nhiều',
        createdAt: new Date('2026-09-06T02:00:00Z'),
      },
    ]);
    const emit = jest.fn();
    const service = new NotificationDispatchService(
      { notification: { createManyAndReturn } } as unknown as PrismaService,
      { emit } as unknown as NotificationEventsService,
    );

    const delivered = await service.deliver({
      recipientIds: ['staff-2'],
      title: 'Trao đổi mới',
      body: 'GV A: em này nghỉ nhiều',
      source: {
        kind: 'discussion',
        discussionMessageId: 'msg-1',
        targetUrl: '/students/sv-1?tab=discussion',
      },
    });

    expect(delivered).toBe(1);
    const [args] = createManyAndReturn.mock.calls[0] as [
      { data: { discussionMessageId?: string; targetUrl?: string }[] },
    ];
    expect(args.data[0].discussionMessageId).toBe('msg-1');
    expect(args.data[0].targetUrl).toBe('/students/sv-1?tab=discussion');
    const [event] = emit.mock.calls[0] as [
      { payload: { discussionMessageId?: string | null } },
    ];
    expect(event.payload.discussionMessageId).toBe('msg-1');
  });
});

describe('NotificationDispatchService — phát lại khi cảnh báo được nâng mức', () => {
  const row = (id: string, recipientId: string) => ({
    id,
    recipientId,
    alertId: 'alert-1',
    title: 'Nâng cảnh báo',
    body: 'lý do',
    createdAt: new Date('2026-09-26T00:00:00Z'),
  });

  function makeReplay(
    inserted: Array<ReturnType<typeof row>>,
    refreshed: Array<ReturnType<typeof row>>,
  ) {
    const createManyAndReturn = jest.fn().mockResolvedValue(inserted);
    const updateManyAndReturn = jest.fn().mockResolvedValue(refreshed);
    const prisma = {
      notification: { createManyAndReturn, updateManyAndReturn },
      alert: { findUnique: jest.fn().mockResolvedValue({ level: 4 }) },
    } as unknown as PrismaService;
    const events = new NotificationEventsService();
    const emit = jest.spyOn(events, 'emit');
    const sendAlertPush = jest.fn().mockResolvedValue(undefined);
    const sendAlertEmail = jest.fn().mockResolvedValue(undefined);
    const service = new NotificationDispatchService(
      prisma,
      events,
      { sendAlertEmail } as unknown as EmailService,
      { sendAlertPush } as unknown as PushService,
    );
    return {
      service,
      updateManyAndReturn,
      emit,
      sendAlertPush,
      sendAlertEmail,
    };
  }

  const replayJob = {
    alertId: 'alert-1',
    recipientIds: ['tbm-se', 'dt-hoa'],
    title: 'Nâng cảnh báo',
    body: 'lý do',
    replay: true,
  };

  it('người đã có thông báo cũ: làm mới thành chưa đọc, đưa lên đầu, rồi báo lại đủ kênh', async () => {
    const {
      service,
      updateManyAndReturn,
      emit,
      sendAlertPush,
      sendAlertEmail,
    } = makeReplay([row('n-new', 'tbm-se')], [row('n-old', 'dt-hoa')]);

    await expect(service.deliver(replayJob)).resolves.toBe(2);

    expect(updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { alertId: 'alert-1', recipientId: { in: ['dt-hoa'] } },
        data: {
          readAt: null,
          createdAt: expect.any(Date) as unknown,
          title: 'Nâng cảnh báo',
          body: 'lý do',
        },
      }),
    );
    expect(emit).toHaveBeenCalledTimes(2);
    expect(sendAlertPush).toHaveBeenCalledWith(
      expect.objectContaining({
        alertLevel: 4,
        recipientIds: ['tbm-se', 'dt-hoa'],
      }),
    );
    // Chờ promise email chạy nền.
    await new Promise((resolve) => setImmediate(resolve));
    expect(sendAlertEmail).toHaveBeenCalledWith('alert-1', [
      'tbm-se',
      'dt-hoa',
    ]);
  });

  it('không replay: không làm mới thông báo cũ', async () => {
    const { service, updateManyAndReturn } = makeReplay([], []);
    await service.deliver({ ...replayJob, replay: false });
    expect(updateManyAndReturn).not.toHaveBeenCalled();
  });

  it('retry không tạo thêm thông báo nào thì cũng không gửi email lại', async () => {
    const { service, sendAlertEmail } = makeReplay([], []);
    await service.deliver({ ...replayJob, replay: false });
    await new Promise((resolve) => setImmediate(resolve));
    expect(sendAlertEmail).not.toHaveBeenCalled();
  });

  it('email chỉ tới người vừa được tạo thông báo', async () => {
    const { service, sendAlertEmail } = makeReplay([row('n-1', 'tbm-se')], []);
    await service.deliver({ ...replayJob, replay: false });
    await new Promise((resolve) => setImmediate(resolve));
    expect(sendAlertEmail).toHaveBeenCalledWith('alert-1', ['tbm-se']);
  });
});
