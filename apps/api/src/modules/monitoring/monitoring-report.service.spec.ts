/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { DiscordWebhookClient } from './discord-webhook.client';
import { DiscordWebhookError } from './discord-webhook.client';
import type { ErrorCollectorService } from './error-collector.service';
import { previousWeekStart, weekStartOf } from './error-fingerprint';
import type { MonitoringSettingsService } from './monitoring-settings.service';
import { MonitoringReportService } from './monitoring-report.service';

const NOW = new Date('2026-09-21T01:00:00Z'); // Thứ Hai 08:00 giờ VN
const HOOK = 'https://discord.com/api/webhooks/1/tok';

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    fingerprint: 'fp1',
    weekStart: previousWeekStart(NOW),
    level: 'ERROR',
    source: 'HTTP',
    context: null,
    route: 'GET /api/x',
    statusCode: 500,
    message: 'boom',
    stack: 'Error: boom',
    count: 4,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    ...overrides,
  };
}

function build(
  opts: {
    enabled?: boolean;
    webhookUrl?: string | null;
    top?: Record<string, unknown>[];
    sum?: number | null;
    groupCount?: number;
    newGroups?: number;
    previousFingerprints?: string[];
  } = {},
) {
  const findMany = jest
    .fn()
    .mockImplementation(
      (args: { where: { fingerprint?: unknown }; select?: unknown }) =>
        args.where.fingerprint
          ? (opts.previousFingerprints ?? []).map((fingerprint) => ({
              fingerprint,
            }))
          : (opts.top ?? []),
    );
  const prisma = {
    systemErrorGroup: {
      findMany,
      count: jest.fn().mockResolvedValue(opts.groupCount ?? 0),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { count: opts.sum ?? null },
        _count: { _all: opts.groupCount ?? 0 },
      }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ count: opts.newGroups ?? 0 }]),
  } as unknown as PrismaService;
  const settings = {
    getEffectiveConfig: jest.fn().mockResolvedValue({
      enabled: opts.enabled ?? true,
      webhookUrl: opts.webhookUrl === undefined ? HOOK : opts.webhookUrl,
      retentionDays: 30,
    }),
    recordReport: jest.fn().mockResolvedValue(undefined),
  } as unknown as MonitoringSettingsService;
  const webhook = {
    send: jest.fn().mockResolvedValue(undefined),
  } as unknown as DiscordWebhookClient;
  const collector = {
    flush: jest.fn().mockResolvedValue(undefined),
  } as unknown as ErrorCollectorService;
  const audit = { log: jest.fn() } as unknown as AuditService;
  const config = {
    get: jest.fn((_k: string, fallback?: unknown) => fallback),
  } as unknown as ConfigService;
  const service = new MonitoringReportService(
    prisma,
    settings,
    webhook,
    collector,
    audit,
    config,
  );
  service.now = () => NOW;
  return { service, prisma, settings, webhook, collector, audit };
}

describe('MonitoringReportService.sendWeeklyReport', () => {
  it('lịch tự động: báo cáo tuần TRƯỚC, đánh dấu nhóm mới, ghi kết quả', async () => {
    const { service, webhook, settings } = build({
      top: [groupRow(), groupRow({ id: 'g2', fingerprint: 'fp2', count: 1 })],
      sum: 5,
      groupCount: 2,
      newGroups: 1,
      previousFingerprints: ['fp1'],
    });
    const result = await service.sendWeeklyReport({ trigger: 'SCHEDULED' });
    expect(result).toMatchObject({
      sent: true,
      weekStart: previousWeekStart(NOW).toISOString(),
      totalEvents: 5,
      groupCount: 2,
    });
    const payload = (webhook.send as jest.Mock).mock.calls[0][1];
    expect(payload.embeds[0].description).toContain('1 nhóm mới');
    const names = payload.embeds[0].fields.map((f: { name: string }) => f.name);
    expect(names[0]).not.toContain('MỚI'); // fp1 đã có ở tuần trước
    expect(names[1]).toContain('MỚI');
    expect(settings.recordReport).toHaveBeenCalledWith(NOW, true);
  });

  it('tuần không có lỗi vẫn gửi', async () => {
    const { service, webhook } = build();
    await service.sendWeeklyReport({ trigger: 'SCHEDULED' });
    const payload = (webhook.send as jest.Mock).mock.calls[0][1];
    expect(payload.embeds[0].description).toContain('Không có lỗi');
  });

  it('đang tắt → lịch tự động bỏ qua, không gửi', async () => {
    const { service, webhook } = build({ enabled: false });
    await expect(
      service.sendWeeklyReport({ trigger: 'SCHEDULED' }),
    ).resolves.toMatchObject({ sent: false, reason: 'DISABLED' });
    expect(webhook.send).not.toHaveBeenCalled();
  });

  it('chưa có webhook → không gửi, lý do NO_WEBHOOK', async () => {
    const { service } = build({ webhookUrl: null });
    await expect(
      service.sendWeeklyReport({ trigger: 'SCHEDULED' }),
    ).resolves.toMatchObject({ sent: false, reason: 'NO_WEBHOOK' });
  });

  it('gửi tay: mặc định tuần hiện tại, flush trước, ghi audit, bỏ qua cờ tắt', async () => {
    const { service, collector, audit, webhook } = build({ enabled: false });
    const result = await service.sendWeeklyReport({
      trigger: 'MANUAL',
      actorId: 's1',
    });
    expect(result.weekStart).toBe(weekStartOf(NOW).toISOString());
    expect(collector.flush).toHaveBeenCalled();
    expect(webhook.send).toHaveBeenCalled();
    expect((audit.log as jest.Mock).mock.calls[0][0]).toMatchObject({
      staffId: 's1',
      action: 'MONITORING_REPORT_SEND',
    });
  });

  it('gửi tay chưa có webhook → 400', async () => {
    const { service } = build({ webhookUrl: null });
    await expect(
      service.sendWeeklyReport({ trigger: 'MANUAL', actorId: 's1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Discord lỗi → ghi lastReportOk=false rồi ném tiếp', async () => {
    const { service, webhook, settings } = build();
    (webhook.send as jest.Mock).mockRejectedValue(
      new DiscordWebhookError('Discord từ chối webhook (HTTP 404)', 404),
    );
    await expect(
      service.sendWeeklyReport({ trigger: 'SCHEDULED' }),
    ).rejects.toBeInstanceOf(DiscordWebhookError);
    expect(settings.recordReport).toHaveBeenCalledWith(NOW, false);
  });
});

describe('MonitoringReportService.sendTest', () => {
  it('dùng URL truyền vào (chưa lưu) nếu có', async () => {
    const { service, webhook } = build({ webhookUrl: null });
    const other = 'https://discord.com/api/webhooks/9/other';
    await service.sendTest('s1', other);
    expect((webhook.send as jest.Mock).mock.calls[0][0]).toBe(other);
  });

  it('Discord lỗi → 400 kèm mã, không lộ URL', async () => {
    const { service, webhook } = build();
    (webhook.send as jest.Mock).mockRejectedValue(
      new DiscordWebhookError('Discord từ chối webhook (HTTP 401)', 401),
    );
    const error = await service.sendTest('s1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    const body = (error as BadRequestException).getResponse();
    expect(body).toMatchObject({ code: 'MONITORING_WEBHOOK_FAILED' });
    expect(JSON.stringify(body)).not.toContain('tok');
  });
});

describe('MonitoringReportService.purgeExpired', () => {
  it('xoá theo lô 5000 tới khi hết, theo mốc lastSeenAt', async () => {
    const { service, prisma } = build();
    const ids = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `${i}` }));
    (prisma.systemErrorGroup.findMany as jest.Mock)
      .mockResolvedValueOnce(ids(5000))
      .mockResolvedValueOnce(ids(12));
    (prisma.systemErrorGroup.deleteMany as jest.Mock)
      .mockResolvedValueOnce({ count: 5000 })
      .mockResolvedValueOnce({ count: 12 });
    await expect(service.purgeExpired(30)).resolves.toBe(5012);
    const where = (prisma.systemErrorGroup.findMany as jest.Mock).mock
      .calls[0][0].where;
    expect(where.lastSeenAt.lt).toEqual(
      new Date(NOW.getTime() - 30 * 24 * 3600 * 1000),
    );
    expect(prisma.systemErrorGroup.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('MonitoringReportService.listGroups', () => {
  it('phân trang + lọc tuần/mức, trả envelope items/meta', async () => {
    const { service, prisma } = build({ top: [groupRow()], groupCount: 21 });
    const result = await service.listGroups({
      week: '2026-09-16',
      level: 'FATAL',
      page: 2,
      limit: 20,
    });
    const args = (prisma.systemErrorGroup.findMany as jest.Mock).mock
      .calls[0][0];
    expect(args.where).toEqual({
      weekStart: weekStartOf(new Date('2026-09-16T05:00:00Z')),
      level: 'FATAL',
    });
    expect(args.skip).toBe(20);
    expect(args.take).toBe(20);
    expect(result.meta).toEqual({ total: 21, page: 2, limit: 20 });
    expect(result.items[0].weekStart).toBe(
      previousWeekStart(NOW).toISOString(),
    );
  });

  it('tuần sai định dạng → 400', async () => {
    const { service } = build();
    await expect(
      service.listGroups({ week: '2026-13-40', page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
