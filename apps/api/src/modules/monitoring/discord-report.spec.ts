import {
  EMBED_TOTAL_LIMIT,
  buildTestPayload,
  buildWeeklyReportPayload,
  isDiscordWebhookUrl,
  type DiscordEmbed,
  type ReportGroup,
} from './discord-report';

const WEEK = new Date('2026-09-13T17:00:00Z'); // Thứ Hai 14/09/2026 giờ VN

function group(overrides: Partial<ReportGroup> = {}): ReportGroup {
  return {
    level: 'ERROR',
    source: 'HTTP',
    context: null,
    route: 'GET /api/students/:id',
    statusCode: 500,
    message: 'db down',
    count: 3,
    isNew: false,
    ...overrides,
  };
}

function totalsOf(groups: ReportGroup[]) {
  return {
    totalEvents: groups.reduce((n, g) => n + g.count, 0),
    groupCount: groups.length,
    newGroupCount: groups.filter((g) => g.isNew).length,
    hasFatal: groups.some((g) => g.level === 'FATAL'),
  };
}

function payloadFor(groups: ReportGroup[]) {
  return buildWeeklyReportPayload({
    weekStart: WEEK,
    webOrigin: 'https://fcare.example.vn/',
    environment: 'production',
    top: groups,
    totals: totalsOf(groups),
  });
}

function embedSize(embed: DiscordEmbed): number {
  return (
    embed.title.length +
    embed.description.length +
    embed.footer.text.length +
    embed.fields.reduce((n, f) => n + f.name.length + f.value.length, 0)
  );
}

describe('isDiscordWebhookUrl', () => {
  it.each([
    'https://discord.com/api/webhooks/123456/abcDEF_-x',
    'https://discordapp.com/api/webhooks/1/t',
    'https://ptb.discord.com/api/webhooks/1/t',
  ])('chấp nhận %s', (url) => expect(isDiscordWebhookUrl(url)).toBe(true));

  it.each([
    'http://discord.com/api/webhooks/1/t',
    'https://discord.com.evil.io/api/webhooks/1/t',
    'https://evil.io/?u=https://discord.com/api/webhooks/1/t',
    'https://user@discord.com/api/webhooks/1/t',
    'https://discord.com:8443/api/webhooks/1/t',
    'https://discord.com/api/webhooks/abc/t',
    'https://discord.com/api/webhooks/1/t/../../x',
    'not a url',
  ])('từ chối %s', (url) => expect(isDiscordWebhookUrl(url)).toBe(false));
});

describe('buildWeeklyReportPayload', () => {
  it('tuần không có lỗi → báo "Không có lỗi", màu xanh', () => {
    const payload = payloadFor([]);
    expect(payload.username).toBe('FCare Monitor');
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    const embed = payload.embeds[0];
    expect(embed.title).toContain('14/09/2026');
    expect(embed.title).toContain('20/09/2026');
    expect(embed.description).toContain('Không có lỗi');
    expect(embed.url).toBe(
      'https://fcare.example.vn/admin/monitoring?week=2026-09-14',
    );
  });

  it('tổng hợp số lần, số nhóm, nhóm mới; top 10 theo count', () => {
    const groups = Array.from({ length: 12 }, (_, i) =>
      group({ message: `lỗi ${i}`, count: i + 1, isNew: i % 2 === 0 }),
    );
    const embed = payloadFor(groups).embeds[0];
    expect(embed.description).toContain('78'); // 1+..+12
    expect(embed.description).toContain('12 nhóm');
    expect(embed.description).toContain('6 nhóm mới');
    expect(embed.fields).toHaveLength(10);
    expect(embed.fields[0].value).toContain('lỗi 11');
    expect(embed.fields[0].name).toContain('×12');
  });

  it('có FATAL → màu đỏ; nhóm mới có nhãn MỚI', () => {
    const embed = payloadFor([group({ level: 'FATAL', isNew: true })])
      .embeds[0];
    expect(embed.color).toBe(0xdc2626);
    expect(embed.fields[0].name).toContain('MỚI');
  });

  it('luôn nằm trong giới hạn embed dù dữ liệu rất dài; chặn @everyone', () => {
    const groups = Array.from({ length: 10 }, () =>
      group({
        message: '@everyone ' + 'x'.repeat(2000),
        route: 'y'.repeat(500),
        context: 'z'.repeat(500),
      }),
    );
    const payload = payloadFor(groups);
    const embed = payload.embeds[0];
    expect(embedSize(embed)).toBeLessThanOrEqual(EMBED_TOTAL_LIMIT);
    for (const f of embed.fields) {
      expect(f.name.length).toBeLessThanOrEqual(256);
      expect(f.value.length).toBeLessThanOrEqual(1024);
      expect(f.value).not.toContain('@everyone');
    }
  });
});

describe('buildTestPayload', () => {
  it('tin thử không chứa mention', () => {
    const payload = buildTestPayload('production');
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds[0].title).toContain('thử');
  });
});
