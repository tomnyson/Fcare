/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { PrismaService } from '../../prisma/prisma.service';
import { ErrorSink, extractCapturedError } from './error-capture';
import {
  ErrorCollectorService,
  aggregateBatch,
} from './error-collector.service';
import { weekStartOf } from './error-fingerprint';
import type { CapturedError } from './monitoring.types';

const T1 = new Date('2026-09-22T01:00:00Z');
const T2 = new Date('2026-09-22T05:00:00Z');

function captured(message: string, at: Date, level = 50): CapturedError {
  return extractCapturedError([{ context: 'Svc' }, message], level, at)!;
}

describe('aggregateBatch', () => {
  it('gộp lỗi cùng loại (khác id) thành một nhóm, đếm số lần', () => {
    const rows = aggregateBatch(
      [
        captured('Không tìm thấy lớp 123', T1),
        captured('Không tìm thấy lớp 456', T2),
      ],
      0,
      T2,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      count: 2,
      firstSeenAt: T1,
      lastSeenAt: T2,
      weekStart: weekStartOf(T1),
      message: 'Không tìm thấy lớp 456',
    });
  });

  it('một lần FATAL trong nhóm → cả nhóm FATAL', () => {
    const rows = aggregateBatch(
      [captured('boom', T1, 50), captured('boom', T2, 60)],
      0,
      T2,
    );
    expect(rows[0].level).toBe('FATAL');
  });

  it('lỗi ở hai tuần khác nhau → hai nhóm', () => {
    const nextWeek = new Date(T1.getTime() + 7 * 24 * 3600 * 1000);
    expect(
      aggregateBatch([captured('boom', T1), captured('boom', nextWeek)], 0, T2),
    ).toHaveLength(2);
  });

  it('có lỗi bị bỏ vì tràn bộ đệm → thêm nhóm tổng hợp riêng', () => {
    const rows = aggregateBatch([], 42, T2);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ context: 'Monitoring', count: 42 });
  });
});

describe('ErrorCollectorService', () => {
  function build() {
    const upsert = jest.fn().mockResolvedValue({ firstSeenAt: T1, lastSeenAt: T1 });
    const prisma = {
      systemErrorGroup: { upsert },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    } as unknown as PrismaService;
    const sink = new ErrorSink();
    // Stub các dependency mới — không được gọi trong các test hiện tại.
    const webhook = { send: jest.fn().mockResolvedValue(undefined) } as never;
    const settings = {
      getEffectiveConfig: jest.fn().mockResolvedValue({ webhookUrl: null, enabled: true, retentionDays: 30 }),
    } as never;
    const config = { get: jest.fn().mockReturnValue('test') } as never;
    return {
      prisma,
      sink,
      upsert,
      service: new ErrorCollectorService(prisma, sink, webhook, settings, config),
    };
  }

  it('flush: upsert theo (fingerprint, tuần) và cộng dồn count', async () => {
    const { sink, service, upsert } = build();
    sink.push(captured('boom', T1));
    sink.push(captured('boom', T2));
    await service.flush();
    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0][0];
    expect(args.where.fingerprint_weekStart.weekStart).toEqual(weekStartOf(T1));
    expect(args.create.count).toBe(2);
    expect(args.update.count).toEqual({ increment: 2 });
    expect(args.update.lastSeenAt).toEqual(T2);
    expect(args.update).not.toHaveProperty('level'); // ERROR không hạ cấp nhóm FATAL
  });

  it('bộ đệm rỗng → không chạm DB', async () => {
    const { service, prisma } = build();
    await service.flush();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('DB lỗi → chỉ ghi stderr, KHÔNG gọi logger (tránh vòng lặp), không ném', async () => {
    const { sink, service, prisma } = build();
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('db down'));
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    sink.push(captured('boom', T1));
    await expect(service.flush()).resolves.toBeUndefined();
    expect(stderr).toHaveBeenCalled();
    stderr.mockRestore();
  });

  it('không chạy hai lượt flush chồng nhau', async () => {
    const { sink, service, prisma } = build();
    let release!: () => void;
    (prisma.$transaction as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => (release = resolve)),
    );
    sink.push(captured('a', T1));
    const first = service.flush();
    sink.push(captured('b', T1));
    await service.flush();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});
