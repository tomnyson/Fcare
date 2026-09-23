/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { EventEmitter } from 'node:events';
import { installCrashHandlers } from './process-crash';

function setup(flush: () => Promise<void> = () => Promise.resolve()) {
  const proc = new EventEmitter();
  const logger = { fatal: jest.fn() };
  const exit = jest.fn();
  installCrashHandlers({ proc, logger, flush, exit, flushTimeoutMs: 50 });
  return { proc, logger, exit };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('installCrashHandlers', () => {
  it('uncaughtException → log fatal kèm stack, flush rồi thoát mã 1', async () => {
    const flush = jest.fn().mockResolvedValue(undefined);
    const { proc, logger, exit } = setup(flush);
    const error = new Error('boom');
    proc.emit('uncaughtException', error);
    await tick();
    const logged = logger.fatal.mock.calls[0][0] as Error;
    expect(logged).toBeInstanceOf(Error);
    expect(logged.message).toBe('uncaughtException: boom');
    expect(logged.stack).toBe(error.stack);
    expect(flush).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('unhandledRejection với lý do không phải Error vẫn log được', async () => {
    const { proc, logger, exit } = setup();
    proc.emit('unhandledRejection', 'lý do chuỗi');
    await tick();
    expect((logger.fatal.mock.calls[0][0] as Error).message).toContain(
      'lý do chuỗi',
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('flush treo → vẫn thoát sau thời gian chờ', async () => {
    const { proc, exit } = setup(() => new Promise(() => undefined));
    proc.emit('uncaughtException', new Error('x'));
    await tick(10);
    expect(exit).not.toHaveBeenCalled();
    await tick(80);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('lỗi dồn dập chỉ thoát một lần', async () => {
    const { proc, exit } = setup();
    proc.emit('uncaughtException', new Error('a'));
    proc.emit('uncaughtException', new Error('b'));
    await tick();
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
