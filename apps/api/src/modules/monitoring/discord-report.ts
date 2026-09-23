import type { SystemErrorLevel, SystemErrorSource } from '@prisma/client';
import { WEEK_MS, formatWeekParam } from './error-fingerprint';

/** Giới hạn embed của Discord — vượt là Discord trả 400, mất cả báo cáo. */
const TITLE_LIMIT = 256;
const DESCRIPTION_LIMIT = 4096;
const FIELD_NAME_LIMIT = 256;
const FIELD_VALUE_LIMIT = 1024;
export const EMBED_TOTAL_LIMIT = 6000;
export const TOP_GROUPS = 10;
/** Mỗi field giữ ngắn để 10 field + phần đầu luôn dưới 6000 ký tự. */
const FIELD_VALUE_BUDGET = 400;

const COLOR_OK = 0x16a34a;
const COLOR_ERROR = 0xf27227;
const COLOR_FATAL = 0xdc2626;

const USERNAME = 'FCare Monitor';
const DAY_MS = 24 * 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const SOURCE_LABEL: Record<SystemErrorSource, string> = {
  HTTP: 'HTTP',
  QUEUE: 'Hàng đợi',
  PROCESS: 'Tiến trình',
  APP: 'Ứng dụng',
};

export interface ReportGroup {
  level: SystemErrorLevel;
  source: SystemErrorSource;
  context: string | null;
  route: string | null;
  statusCode: number | null;
  message: string;
  count: number;
  /** Lần đầu xuất hiện trong tuần này (không có ở tuần trước). */
  isNew: boolean;
}

export interface DiscordEmbed {
  title: string;
  description: string;
  url?: string;
  color: number;
  fields: { name: string; value: string }[];
  footer: { text: string };
  timestamp: string;
}

export interface DiscordPayload {
  username: string;
  allowed_mentions: { parse: never[] };
  embeds: DiscordEmbed[];
}

/**
 * Chỉ nhận URL webhook chính thức của Discord (chặn SSRF): https, host
 * discord.com / discordapp.com (kể cả ptb./canary.), không user-info, không
 * port lạ, đường dẫn đúng `/api/webhooks/<id số>/<token>`.
 */
export function isDiscordWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    /^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/.test(url.hostname) &&
    /^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname)
  );
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/** Vô hiệu hoá mention và khối code lồng nhau trong dữ liệu log. */
function neutralize(text: string): string {
  return text.replace(/@/g, '@​').replace(/`/g, "'");
}

function vnDate(date: Date): string {
  const [year, month, day] = new Date(date.getTime() + VN_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
    .split('-');
  return `${day}/${month}/${year}`;
}

function fieldFor(group: ReportGroup, index: number) {
  const where = group.route ?? group.context ?? SOURCE_LABEL[group.source];
  const status = group.statusCode ? ` · ${group.statusCode}` : '';
  const tag = group.isNew ? ' 🆕 MỚI' : '';
  const name = `${index + 1}. ${group.level} ×${group.count}${tag}`;
  const value = `**${neutralize(truncate(where, 120))}**${status} · ${SOURCE_LABEL[group.source]}\n\`\`\`${neutralize(truncate(group.message, 250))}\`\`\``;
  return {
    name: truncate(name, FIELD_NAME_LIMIT),
    value: truncate(value, Math.min(FIELD_VALUE_BUDGET, FIELD_VALUE_LIMIT)),
  };
}

function reportLink(webOrigin: string, weekStart: Date): string {
  return `${webOrigin.replace(/\/+$/, '')}/admin/monitoring?week=${formatWeekParam(weekStart)}`;
}

interface ReportTotals {
  totalEvents: number;
  groupCount: number;
  newGroupCount: number;
  hasFatal: boolean;
}

export function buildWeeklyReportPayload(input: {
  weekStart: Date;
  /** Các nhóm nhiều lần nhất (tối đa 10 được hiển thị). */
  top: ReportGroup[];
  totals: ReportTotals;
  webOrigin: string;
  environment: string;
}): DiscordPayload {
  const { weekStart, totals, webOrigin, environment } = input;
  const weekEnd = new Date(weekStart.getTime() + WEEK_MS - DAY_MS);
  const title = truncate(
    `Báo cáo lỗi hệ thống tuần ${vnDate(weekStart)} – ${vnDate(weekEnd)}`,
    TITLE_LIMIT,
  );
  const { totalEvents, groupCount, newGroupCount, hasFatal } = totals;
  const top = [...input.top]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_GROUPS);

  const description =
    groupCount === 0
      ? '✅ Không có lỗi nào được ghi nhận trong tuần.'
      : [
          `**${totalEvents}** lần lỗi · **${groupCount} nhóm** · **${newGroupCount} nhóm mới**`,
          groupCount > TOP_GROUPS
            ? `Hiển thị ${TOP_GROUPS} nhóm xảy ra nhiều nhất — xem đầy đủ trên trang giám sát.`
            : 'Chi tiết stack xem trên trang giám sát.',
        ].join('\n');

  return {
    username: USERNAME,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title,
        description: truncate(description, DESCRIPTION_LIMIT),
        url: reportLink(webOrigin, weekStart),
        color:
          groupCount === 0 ? COLOR_OK : hasFatal ? COLOR_FATAL : COLOR_ERROR,
        fields: top.map(fieldFor),
        footer: { text: `FCare · ${environment}` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export function buildTestPayload(environment: string): DiscordPayload {
  return {
    username: USERNAME,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: 'Tin nhắn thử từ FCare',
        description:
          'Webhook hoạt động. Báo cáo lỗi hệ thống sẽ được gửi vào kênh này mỗi sáng thứ Hai lúc 08:00.',
        color: COLOR_OK,
        fields: [],
        footer: { text: `FCare · ${environment}` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
