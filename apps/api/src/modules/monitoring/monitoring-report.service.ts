import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  Prisma,
  SystemErrorLevel,
  SystemErrorSource,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TOP_GROUPS,
  buildTestPayload,
  buildWeeklyReportPayload,
  type ReportGroup,
} from './discord-report';
import {
  DiscordWebhookClient,
  DiscordWebhookError,
} from './discord-webhook.client';
import { ErrorCollectorService } from './error-collector.service';
import {
  WEEK_MS,
  parseWeekParam,
  previousWeekStart,
  weekStartOf,
} from './error-fingerprint';
import { MonitoringSettingsService } from './monitoring-settings.service';
import type {
  ErrorGroupView,
  WeekSummary,
  WeeklyReportResult,
} from './monitoring.types';

const PURGE_BATCH = 5000;
const WEEKS_LISTED = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ListGroupsQuery {
  week?: string;
  level?: SystemErrorLevel;
  source?: SystemErrorSource;
  page: number;
  limit: number;
}

type ReportTrigger =
  | { trigger: 'SCHEDULED' }
  | { trigger: 'MANUAL'; actorId: string; week?: string };

type GroupRow = Awaited<
  ReturnType<PrismaService['systemErrorGroup']['findMany']>
>[number];

function toView(row: GroupRow): ErrorGroupView {
  return {
    id: row.id,
    weekStart: row.weekStart.toISOString(),
    level: row.level,
    source: row.source,
    context: row.context,
    route: row.route,
    statusCode: row.statusCode,
    message: row.message,
    stack: row.stack,
    count: row.count,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

function weekOrThrow(value: string): Date {
  const week = parseWeekParam(value);
  if (!week) {
    throw new BadRequestException({
      code: 'MONITORING_WEEK_INVALID',
      message: 'Tuần phải có dạng YYYY-MM-DD.',
    });
  }
  return week;
}

@Injectable()
export class MonitoringReportService {
  /** Ghi đè được trong test. */
  now: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: MonitoringSettingsService,
    private readonly webhook: DiscordWebhookClient,
    private readonly collector: ErrorCollectorService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private get environment(): string {
    return this.config.get<string>('NODE_ENV', 'development');
  }

  private get webOrigin(): string {
    return this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  }

  async sendWeeklyReport(input: ReportTrigger): Promise<WeeklyReportResult> {
    const now = this.now();
    const manual = input.trigger === 'MANUAL';
    const weekStart = manual
      ? input.week
        ? weekOrThrow(input.week)
        : weekStartOf(now)
      : previousWeekStart(now);
    const config = await this.settings.getEffectiveConfig();
    const skipped = (reason: 'DISABLED' | 'NO_WEBHOOK') => ({
      sent: false,
      reason,
      weekStart: weekStart.toISOString(),
      totalEvents: 0,
      groupCount: 0,
    });

    if (!manual && !config.enabled) return skipped('DISABLED');
    if (!config.webhookUrl) {
      if (manual) {
        throw new BadRequestException({
          code: 'MONITORING_WEBHOOK_MISSING',
          message: 'Chưa cấu hình webhook Discord.',
        });
      }
      return skipped('NO_WEBHOOK');
    }
    // Gửi tay thường là tuần hiện tại — ghi nốt lỗi đang nằm trong bộ đệm.
    if (manual) await this.collector.flush();

    const { top, totals } = await this.loadWeek(weekStart);
    const payload = buildWeeklyReportPayload({
      weekStart,
      top,
      totals,
      webOrigin: this.webOrigin,
      environment: this.environment,
    });

    try {
      await this.webhook.send(config.webhookUrl, payload);
    } catch (error) {
      await this.settings.recordReport(now, false);
      if (manual) throw this.webhookFailure(error);
      throw error;
    }
    await this.settings.recordReport(now, true);
    if (manual) {
      await this.audit.log({
        staffId: input.actorId,
        action: 'MONITORING_REPORT_SEND',
        entity: 'MonitoringSetting',
        entityId: 'default',
        metadata: { weekStart: weekStart.toISOString() },
      });
    }
    return {
      sent: true,
      weekStart: weekStart.toISOString(),
      totalEvents: totals.totalEvents,
      groupCount: totals.groupCount,
    };
  }

  private async loadWeek(weekStart: Date) {
    const prevWeek = new Date(weekStart.getTime() - WEEK_MS);
    const [rows, aggregate, newRows] = await Promise.all([
      this.prisma.systemErrorGroup.findMany({
        where: { weekStart },
        orderBy: [{ count: 'desc' }, { lastSeenAt: 'desc' }],
        take: TOP_GROUPS,
      }),
      this.prisma.systemErrorGroup.aggregate({
        where: { weekStart },
        _sum: { count: true },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ count: bigint | number }[]>`
        SELECT COUNT(*) AS count FROM system_error_groups cur
        WHERE cur.week_start = ${weekStart}
          AND NOT EXISTS (
            SELECT 1 FROM system_error_groups prev
            WHERE prev.fingerprint = cur.fingerprint AND prev.week_start = ${prevWeek}
          )`,
    ]);
    const seenBefore = new Set(
      (
        await this.prisma.systemErrorGroup.findMany({
          where: {
            weekStart: prevWeek,
            fingerprint: { in: rows.map((r) => r.fingerprint) },
          },
          select: { fingerprint: true },
        })
      ).map((r) => r.fingerprint),
    );
    const top: ReportGroup[] = rows.map((r) => ({
      level: r.level,
      source: r.source,
      context: r.context,
      route: r.route,
      statusCode: r.statusCode,
      message: r.message,
      count: r.count,
      isNew: !seenBefore.has(r.fingerprint),
    }));
    const hasFatal =
      top.some((g) => g.level === 'FATAL') ||
      (await this.prisma.systemErrorGroup.count({
        where: { weekStart, level: 'FATAL' },
      })) > 0;
    return {
      top,
      totals: {
        totalEvents: aggregate._sum.count ?? 0,
        groupCount: aggregate._count._all,
        newGroupCount: Number(newRows[0]?.count ?? 0),
        hasFatal,
      },
    };
  }

  private webhookFailure(error: unknown): BadRequestException {
    return new BadRequestException({
      code: 'MONITORING_WEBHOOK_FAILED',
      message:
        error instanceof DiscordWebhookError
          ? error.message
          : 'Không gửi được tới Discord.',
    });
  }

  async sendTest(actorId: string, webhookUrl?: string): Promise<void> {
    const url =
      webhookUrl?.trim() ||
      (await this.settings.getEffectiveConfig()).webhookUrl;
    if (!url) {
      throw new BadRequestException({
        code: 'MONITORING_WEBHOOK_MISSING',
        message: 'Chưa cấu hình webhook Discord.',
      });
    }
    try {
      await this.webhook.send(url, buildTestPayload(this.environment));
    } catch (error) {
      throw this.webhookFailure(error);
    }
    await this.audit.log({
      staffId: actorId,
      action: 'MONITORING_TEST_SEND',
      entity: 'MonitoringSetting',
      entityId: 'default',
      metadata: { unsavedUrl: Boolean(webhookUrl?.trim()) },
    });
  }

  /** Xoá nhóm lỗi không tái diễn quá `retentionDays` ngày, theo lô để không khoá bảng lâu. */
  async purgeExpired(retentionDays: number): Promise<number> {
    const cutoff = new Date(this.now().getTime() - retentionDays * DAY_MS);
    let deleted = 0;
    for (;;) {
      const batch = await this.prisma.systemErrorGroup.findMany({
        where: { lastSeenAt: { lt: cutoff } },
        select: { id: true },
        take: PURGE_BATCH,
      });
      if (batch.length === 0) break;
      const result = await this.prisma.systemErrorGroup.deleteMany({
        where: { id: { in: batch.map((r) => r.id) } },
      });
      deleted += result.count;
      if (batch.length < PURGE_BATCH) break;
    }
    return deleted;
  }

  async purgeNow(actorId: string): Promise<{ deleted: number }> {
    const { retentionDays } = await this.settings.getEffectiveConfig();
    const deleted = await this.purgeExpired(retentionDays);
    await this.audit.log({
      staffId: actorId,
      action: 'MONITORING_PURGE',
      entity: 'SystemErrorGroup',
      metadata: { retentionDays, deleted },
    });
    return { deleted };
  }

  /**
   * Xoá AuditLog cũ hơn `retentionDays` ngày.
   * Không cần chia lô — audit log nhỏ, không có FK phức tạp.
   */
  async purgeExpiredAuditLogs(retentionDays: number): Promise<number> {
    const cutoff = new Date(this.now().getTime() - retentionDays * DAY_MS);
    const { count } = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  }

  async listGroups(query: ListGroupsQuery) {
    const where: Prisma.SystemErrorGroupWhereInput = {
      ...(query.week ? { weekStart: weekOrThrow(query.week) } : {}),
      ...(query.level ? { level: query.level } : {}),
      ...(query.source ? { source: query.source } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.systemErrorGroup.findMany({
        where,
        orderBy: [{ count: 'desc' }, { lastSeenAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.systemErrorGroup.count({ where }),
    ]);
    return {
      items: rows.map(toView),
      meta: { total, page: query.page, limit: query.limit },
    };
  }

  async listWeeks(): Promise<WeekSummary[]> {
    const rows = await this.prisma.systemErrorGroup.groupBy({
      by: ['weekStart'],
      _count: { _all: true },
      _sum: { count: true },
      orderBy: { weekStart: 'desc' },
      take: WEEKS_LISTED,
    });
    return rows.map((r) => ({
      weekStart: r.weekStart.toISOString(),
      groupCount: r._count._all,
      totalEvents: r._sum.count ?? 0,
    }));
  }
}
