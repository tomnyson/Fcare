/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Logger } from '@nestjs/common';
import { QueueFailureMonitor } from './queue-failure.monitor';

type Listener = (payload: { jobId: string; failedReason: string }) => void;

function fakeEventsFactory() {
  const created: {
    name: string;
    listeners: Record<string, Listener>;
    close: jest.Mock;
  }[] = [];
  const factory = jest.fn((name: string) => {
    const entry = {
      name,
      listeners: {} as Record<string, Listener>,
      close: jest.fn().mockResolvedValue(undefined),
    };
    created.push(entry);
    return {
      on: (event: string, listener: Listener) => {
        entry.listeners[event] = listener;
      },
      close: entry.close,
    };
  });
  return { factory, created };
}

describe('QueueFailureMonitor', () => {
  it('job thất bại hẳn → logger.error với context Queue:<tên>', () => {
    const { factory, created } = fakeEventsFactory();
    const monitor = new QueueFailureMonitor(['email-notifications'], factory);
    const seen: { context: unknown; message: unknown }[] = [];
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(function (this: Logger, message: unknown) {
        seen.push({
          context: (this as unknown as { context: unknown }).context,
          message,
        });
      });
    monitor.onModuleInit();
    created[0].listeners.failed({ jobId: 'j1', failedReason: 'SMTP timeout' });
    expect(seen).toEqual([
      {
        context: 'Queue:email-notifications',
        message: expect.stringContaining('SMTP timeout'),
      },
    ]);
    errorSpy.mockRestore();
  });

  it('đóng toàn bộ QueueEvents khi tắt', async () => {
    const { factory, created } = fakeEventsFactory();
    const monitor = new QueueFailureMonitor(['a', 'b'], factory);
    monitor.onModuleInit();
    await monitor.onModuleDestroy();
    expect(created.every((c) => c.close.mock.calls.length === 1)).toBe(true);
  });
});
