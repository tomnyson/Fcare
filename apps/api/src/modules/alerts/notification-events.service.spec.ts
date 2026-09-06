import { firstValueFrom } from 'rxjs';
import { take, toArray } from 'rxjs/operators';
import { NotificationEventsService } from './notification-events.service';

function payloadFor(title: string) {
  return {
    id: `id-${title}`,
    alertId: 'alert-1',
    analysisVersionId: null,
    targetUrl: null,
    title,
    body: 'nội dung',
    createdAt: new Date('2026-07-02T00:00:00Z'),
  };
}

describe('NotificationEventsService — kênh SSE in-process', () => {
  it('chỉ đẩy sự kiện tới đúng người nhận', async () => {
    const service = new NotificationEventsService();
    const received = firstValueFrom(
      service.streamFor('staff-a').pipe(take(1), toArray()),
    );

    service.emit({ recipientId: 'staff-b', payload: payloadFor('cho B') });
    service.emit({ recipientId: 'staff-a', payload: payloadFor('cho A') });

    const events = await received;
    expect(events).toHaveLength(1);
    expect(events[0].payload.title).toBe('cho A');
  });

  it('nhiều kết nối cùng nhận sự kiện của mình độc lập', async () => {
    const service = new NotificationEventsService();
    const receivedA = firstValueFrom(
      service.streamFor('staff-a').pipe(take(1)),
    );
    const receivedB = firstValueFrom(
      service.streamFor('staff-b').pipe(take(1)),
    );

    service.emit({ recipientId: 'staff-a', payload: payloadFor('A') });
    service.emit({ recipientId: 'staff-b', payload: payloadFor('B') });

    expect((await receivedA).payload.title).toBe('A');
    expect((await receivedB).payload.title).toBe('B');
  });
});
