import type { SystemErrorLevel, SystemErrorSource } from '@prisma/client';
import type { DiscordPayload } from './discord-report';

const TITLE_LIMIT = 256;
const DESCRIPTION_LIMIT = 4096;
const USERNAME = 'FCare Monitor';
const COLOR_ERROR = 0xf27227;
const COLOR_FATAL = 0xdc2626;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const SOURCE_LABEL: Record<SystemErrorSource, string> = {
  HTTP: 'HTTP',
  QUEUE: 'Hàng đợi',
  PROCESS: 'Tiến trình',
  APP: 'Ứng dụng',
};

export interface AlertGroup {
  level: SystemErrorLevel;
  source: SystemErrorSource;
  context: string | null;
  route: string | null;
  statusCode: number | null;
  message: string;
  stack: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  count: number;
  /** true = lần đầu gặp lỗi này trong tuần → cần alert. */
  isFirstSeen: boolean;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/** Vô hiệu hoá mention và khối code lồng nhau trong dữ liệu log. */
function neutralize(text: string): string {
  return text.replace(/@/g, '@\u200b').replace(/`/g, "'");
}

function vnTime(date: Date): string {
  return new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(11, 19);
}

/**
 * Tạo Discord embed nhỏ gọn cho cảnh báo lỗi theo thời gian thực.
 * Chỉ gửi với lỗi FATAL hoặc lỗi ERROR lần đầu xuất hiện trong tuần.
 */
export function buildAlertPayload(
  group: AlertGroup,
  environment: string,
): DiscordPayload {
  const where = group.route ?? group.context ?? SOURCE_LABEL[group.source];
  const statusPart = group.statusCode ? ` · HTTP ${group.statusCode}` : '';
  const isFatal = group.level === 'FATAL';
  const levelIcon = isFatal ? '🔴' : '🟠';
  const tag = isFatal ? 'LỖI NGHIÊM TRỌNG' : 'LỖI MỚI';

  const title = truncate(
    `${levelIcon} ${tag}: ${neutralize(where)}${statusPart}`,
    TITLE_LIMIT,
  );

  const stackSnippet = group.stack
    ? `\n\`\`\`\n${neutralize(truncate(group.stack, 800))}\n\`\`\``
    : '';

  const description = truncate(
    [
      `**Nguồn:** ${SOURCE_LABEL[group.source]}`,
      `**Thời điểm:** ${vnTime(group.lastSeenAt)} (VN)`,
      `**Số lần:** ${group.count}`,
      '',
      `\`${neutralize(truncate(group.message, 500))}\``,
      stackSnippet,
    ]
      .filter(Boolean)
      .join('\n'),
    DESCRIPTION_LIMIT,
  );

  return {
    username: USERNAME,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title,
        description,
        color: isFatal ? COLOR_FATAL : COLOR_ERROR,
        fields: [],
        footer: { text: `FCare · ${environment}` },
        timestamp: group.lastSeenAt.toISOString(),
      },
    ],
  };
}
