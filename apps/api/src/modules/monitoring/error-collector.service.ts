import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SystemErrorLevel, SystemErrorSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorSink } from './error-capture';
import { errorFingerprint, weekStartOf } from './error-fingerprint';
import type { CapturedError } from './monitoring.types';
import { buildAlertPayload, type AlertGroup } from './discord-alert';
import { DiscordWebhookClient } from './discord-webhook.client';
import { MonitoringSettingsService } from './monitoring-settings.service';

export const ERROR_SINK = Symbol('ERROR_SINK');
const FLUSH_INTERVAL_MS = 10_000;

interface AggregatedGroup {
  fingerprint: string;
  weekStart: Date;
  level: SystemErrorLevel;
  source: SystemErrorSource;
  context: string | null;
  route: string | null;
  statusCode: number | null;
  message: string;
  stack: string | null;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

function droppedGroup(dropped: number, now: Date): CapturedError {
  return {
    level: 'ERROR',
    source: 'APP',
    context: 'Monitoring',
    route: null,
    statusCode: null,
    message:
      'Bộ đệm giám sát bị tràn — một số lỗi không được ghi lại chi tiết (có thể đang có bão lỗi).',
    stack: null,
    at: now,
  };
}

/** Gộp một lô lỗi theo (fingerprint, tuần) — thuần, không chạm DB. */
export function aggregateBatch(
  events: readonly CapturedError[],
  dropped: number,
  now: Date,
): AggregatedGroup[] {
  const weighted: [CapturedError, number][] = events.map((e) => [e, 1]);
  if (dropped > 0) weighted.push([droppedGroup(dropped, now), dropped]);

  const groups = new Map<string, AggregatedGroup>();
  for (const [event, weight] of weighted) {
    const weekStart = weekStartOf(event.at);
    const fingerprint = errorFingerprint(event);
    const key = `${fingerprint}|${weekStart.getTime()}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        fingerprint,
        weekStart,
        level: event.level,
        source: event.source,
        context: event.context,
        route: event.route,
        statusCode: event.statusCode,
        message: event.message,
        stack: event.stack,
        count: weight,
        firstSeenAt: event.at,
        lastSeenAt: event.at,
      });
      continue;
    }
    const isLatest = event.at >= existing.lastSeenAt;
    groups.set(key, {
      ...existing,
      level: event.level === 'FATAL' ? 'FATAL' : existing.level,
      // Giữ bản mới nhất để người xem thấy lần lỗi gần đây.
      message: isLatest ? event.message : existing.message,
      statusCode: isLatest ? event.statusCode : existing.statusCode,
      stack: (isLatest ? event.stack : existing.stack) ?? existing.stack,
      count: existing.count + weight,
      firstSeenAt:
        event.at < existing.firstSeenAt ? event.at : existing.firstSeenAt,
      lastSeenAt: isLatest ? event.at : existing.lastSeenAt,
    });
  }
  return [...groups.values()];
}

/**
 * Định kỳ rút lỗi từ `errorSink` và ghi DB. Mọi lỗi của chính nó chỉ đi
 * stderr — gọi logger ở đây sẽ bị hook bắt lại, sinh vòng lặp vô hạn.
 */
@Injectable()
export class ErrorCollectorService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ERROR_SINK) private readonly sink: ErrorSink,
    private readonly webhook: DiscordWebhookClient,
    private readonly settings: MonitoringSettingsService,
    private readonly config: ConfigService,
  ) {}

  private get environment(): string {
    return this.config.get<string>('NODE_ENV', 'development');
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    const { events, dropped } = this.sink.drain();
    if (events.length === 0 && dropped === 0) return;
    this.flushing = true;
    try {
      const groups = aggregateBatch(events, dropped, new Date());
      const results = await this.prisma.$transaction(
        groups.map((g) => this.upsert(g)),
      );
      // Gửi cảnh báo Discord cho lỗi FATAL và lỗi ERROR lần đầu trong tuần.
      void this.sendAlerts(groups, results);
    } catch (error) {
      process.stderr.write(
        `[monitoring] Không ghi được ${events.length} lỗi vào DB: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Gửi Discord alert sau khi flush.
   * Chỉ alert khi: lỗi FATAL, hoặc ERROR lần đầu xuất hiện trong tuần này.
   * "Lần đầu" = `firstSeenAt` == `lastSeenAt` sau upsert (count ban đầu là 0 → mới tạo).
   * Lỗi của chính hàm này chỉ đi stderr để tránh vòng lặp giám sát.
   */
  private async sendAlerts(
    groups: AggregatedGroup[],
    results: Awaited<ReturnType<typeof this.upsert>>[],
  ): Promise<void> {
    try {
      const cfg = await this.settings.getEffectiveConfig();
      if (!cfg.webhookUrl) return;

      const alertable: AlertGroup[] = [];
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const saved = results[i];
        // firstSeenAt == lastSeenAt sau upsert → group mới được tạo lần đầu.
        const isFirstSeen =
          saved.firstSeenAt.getTime() === saved.lastSeenAt.getTime();
        if (group.level === 'FATAL' || isFirstSeen) {
          alertable.push({ ...group, isFirstSeen });
        }
      }

      for (const group of alertable) {
        try {
          await this.webhook.send(
            cfg.webhookUrl,
            buildAlertPayload(group, this.environment),
          );
        } catch (err) {
          process.stderr.write(
            `[monitoring] Không gửi được alert Discord: ${
              err instanceof Error ? err.message : String(err)
            }\n`,
          );
        }
      }
    } catch (err) {
      process.stderr.write(
        `[monitoring] Lỗi khi chuẩn bị alert Discord: ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      );
    }
  }

  private upsert(group: AggregatedGroup) {
    const { fingerprint, weekStart } = group;
    return this.prisma.systemErrorGroup.upsert({
      where: { fingerprint_weekStart: { fingerprint, weekStart } },
      create: group,
      update: {
        count: { increment: group.count },
        lastSeenAt: group.lastSeenAt,
        message: group.message,
        statusCode: group.statusCode,
        ...(group.stack ? { stack: group.stack } : {}),
        // Chỉ nâng cấp, không bao giờ hạ FATAL → ERROR.
        ...(group.level === 'FATAL' ? { level: group.level } : {}),
      },
    });
  }
}
