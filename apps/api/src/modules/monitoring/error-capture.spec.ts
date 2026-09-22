/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  ErrorSink,
  MAX_BUFFERED_ERRORS,
  createErrorCaptureHook,
  extractCapturedError,
} from './error-capture';

const AT = new Date('2026-09-23T03:00:00Z');

function fakeHttpRes(statusCode: number, route?: string) {
  return {
    statusCode,
    req: {
      method: 'GET',
      baseUrl: '/api/students',
      originalUrl:
        '/api/students/3f2b8c1e-9a4d-4c2e-8f1a-0b2c3d4e5f60?q=a@b.vn',
      route: route ? { path: route } : undefined,
    },
  };
}

describe('extractCapturedError', () => {
  it('bỏ qua mức dưới error (warn = 40)', () => {
    expect(extractCapturedError([{ context: 'X' }, 'hmm'], 40, AT)).toBeNull();
  });

  it('Logger.error của Nest: lấy context + message', () => {
    const got = extractCapturedError(
      [{ context: 'EmailService' }, 'Gửi mail tới a@fpt.edu.vn thất bại'],
      50,
      AT,
    );
    expect(got).toMatchObject({
      level: 'ERROR',
      source: 'APP',
      context: 'EmailService',
      route: null,
      message: 'Gửi mail tới [email] thất bại',
      at: AT,
    });
  });

  it('có err → lấy message + stack đã che', () => {
    const err = new Error('boom for 0912345678');
    const got = extractCapturedError([{ context: 'Svc', err }], 60, AT);
    expect(got?.level).toBe('FATAL');
    expect(got?.message).toBe('boom for [số điện thoại]');
    expect(got?.stack).toContain('[số điện thoại]');
  });

  it('pino-http 5xx: route mẫu (không phải URL thật), status, lỗi gốc', () => {
    const got = extractCapturedError(
      [
        { res: fakeHttpRes(500, '/:id'), err: new Error('db down') },
        'request errored',
      ],
      50,
      AT,
    );
    expect(got).toMatchObject({
      source: 'HTTP',
      route: 'GET /api/students/:id',
      statusCode: 500,
      message: 'db down',
    });
  });

  it('pino-http không khớp route → dùng path đã bỏ query và thay id', () => {
    const got = extractCapturedError(
      [{ res: fakeHttpRes(502), err: new Error('bad gateway') }],
      50,
      AT,
    );
    expect(got?.route).toBe('GET /api/students/:id');
  });

  it('context Queue:* → QUEUE, Process → PROCESS', () => {
    expect(
      extractCapturedError([{ context: 'Queue:email' }, 'x'], 50, AT)?.source,
    ).toBe('QUEUE');
    expect(
      extractCapturedError([{ context: 'Process' }, 'x'], 60, AT)?.source,
    ).toBe('PROCESS');
  });

  it('chỉ có chuỗi, không có object', () => {
    expect(extractCapturedError(['plain failure'], 50, AT)).toMatchObject({
      context: null,
      message: 'plain failure',
    });
  });
});

describe('ErrorSink', () => {
  it('đầy bộ đệm → bỏ bớt và đếm số bị bỏ; drain trả hết rồi làm rỗng', () => {
    const sink = new ErrorSink();
    const event = extractCapturedError(['x'], 50, AT)!;
    for (let i = 0; i < MAX_BUFFERED_ERRORS + 5; i += 1) sink.push(event);
    const first = sink.drain();
    expect(first.events).toHaveLength(MAX_BUFFERED_ERRORS);
    expect(first.dropped).toBe(5);
    expect(sink.drain()).toEqual({ events: [], dropped: 0 });
  });
});

describe('createErrorCaptureHook', () => {
  it('luôn gọi method gốc; lỗi được đẩy vào sink', () => {
    const sink = new ErrorSink();
    const hook = createErrorCaptureHook(sink);
    const method = jest.fn();
    hook.call({}, [{ context: 'A' }, 'fail'], method, 50);
    hook.call({}, ['info'], method, 30);
    expect(method).toHaveBeenCalledTimes(2);
    expect(sink.drain().events).toHaveLength(1);
  });

  it('bắt lỗi không bao giờ làm hỏng việc ghi log', () => {
    const sink = new ErrorSink();
    jest.spyOn(sink, 'push').mockImplementation(() => {
      throw new Error('sink broken');
    });
    const method = jest.fn();
    expect(() =>
      createErrorCaptureHook(sink).call({}, ['fail'], method, 50),
    ).not.toThrow();
    expect(method).toHaveBeenCalled();
  });
});
