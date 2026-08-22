import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationEventsService } from './notification-events.service';

describe('NotificationDispatchService — gửi thông báo idempotent', () => {
  function makeService(existingCount: number) {
    const createMany = jest
      .fn()
      .mockResolvedValue({ count: 2 - existingCount });
    const findMany = jest.fn().mockResolvedValue([
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
    ]);
    const prisma = {
      notification: { createMany, findMany },
    } as unknown as PrismaService;
    const events = new NotificationEventsService();
    const emitted: string[] = [];
    events.streamFor('tbm-se').subscribe(() => emitted.push('tbm-se'));
    events.streamFor('dt-hoa').subscribe(() => emitted.push('dt-hoa'));
    const service = new NotificationDispatchService(prisma, events);
    return { service, createMany, emitted };
  }

  const jobData = {
    alertId: 'alert-1',
    recipientIds: ['tbm-se', 'dt-hoa'],
    title: 'Cảnh báo',
    body: 'lý do',
  };

  it('tạo thông báo với skipDuplicates (an toàn khi retry)', async () => {
    const { service, createMany } = makeService(0);
    const delivered = await service.deliver(jobData);

    expect(delivered).toBe(2);
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('phát sự kiện SSE tới từng người nhận', async () => {
    const { service, emitted } = makeService(0);
    await service.deliver(jobData);
    expect(emitted.sort()).toEqual(['dt-hoa', 'tbm-se']);
  });

  it('không có người nhận → không chạm database', async () => {
    const { service, createMany } = makeService(0);
    const delivered = await service.deliver({ ...jobData, recipientIds: [] });
    expect(delivered).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});
