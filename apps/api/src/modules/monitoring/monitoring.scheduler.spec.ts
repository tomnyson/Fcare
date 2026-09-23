import type { Queue } from 'bullmq';
import { MonitoringScheduler } from './monitoring.scheduler';
import {
  PURGE_CRON,
  PURGE_ERRORS_JOB,
  WEEKLY_REPORT_CRON,
  WEEKLY_REPORT_JOB,
} from './monitoring.queue';

function queueWith(existing: { name: string; key: string }[]) {
  return {
    getRepeatableJobs: jest.fn().mockResolvedValue(existing),
    removeRepeatableByKey: jest.fn().mockResolvedValue(true),
    add: jest.fn().mockResolvedValue({}),
  } as unknown as Queue & {
    add: jest.Mock;
    removeRepeatableByKey: jest.Mock;
  };
}

describe('MonitoringScheduler', () => {
  it('xoá lịch cũ của chính nó rồi đăng ký 2 lịch theo giờ VN, jobId cố định', async () => {
    const queue = queueWith([
      { name: WEEKLY_REPORT_JOB, key: 'k1' },
      { name: 'other', key: 'k2' },
    ]);
    await new MonitoringScheduler(queue).onModuleInit();
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('k1');
    expect(queue.removeRepeatableByKey).not.toHaveBeenCalledWith('k2');
    const calls = queue.add.mock.calls as [
      string,
      unknown,
      { repeat: object; jobId: string },
    ][];
    expect(calls.map(([name]) => name)).toEqual([
      WEEKLY_REPORT_JOB,
      PURGE_ERRORS_JOB,
    ]);
    expect(calls[0][2].repeat).toEqual({
      pattern: WEEKLY_REPORT_CRON,
      tz: 'Asia/Ho_Chi_Minh',
    });
    expect(calls[1][2].repeat).toEqual({
      pattern: PURGE_CRON,
      tz: 'Asia/Ho_Chi_Minh',
    });
    expect(new Set(calls.map(([, , o]) => o.jobId)).size).toBe(2);
  });

  it('Redis lỗi lúc khởi động → không làm sập ứng dụng', async () => {
    const queue = queueWith([]);
    (queue.getRepeatableJobs as jest.Mock).mockRejectedValue(
      new Error('redis'),
    );
    await expect(
      new MonitoringScheduler(queue).onModuleInit(),
    ).resolves.toBeUndefined();
  });
});
