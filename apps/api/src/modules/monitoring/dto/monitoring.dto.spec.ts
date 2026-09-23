import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ListErrorGroupsQuery,
  SendReportDto,
  TestWebhookDto,
  UpdateMonitoringSettingsDto,
} from './monitoring.dto';

async function errorsOf(cls: new () => object, body: unknown) {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((e) => e.property);
}

const HOOK = 'https://discord.com/api/webhooks/123/abc_DEF-1';

describe('UpdateMonitoringSettingsDto', () => {
  it('hợp lệ, trim URL', async () => {
    const dto = plainToInstance(UpdateMonitoringSettingsDto, {
      webhookUrl: `  ${HOOK} `,
      enabled: true,
      retentionDays: 30,
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.webhookUrl).toBe(HOOK);
  });

  it('webhook không phải Discord → lỗi (chặn SSRF)', async () => {
    for (const webhookUrl of [
      'https://evil.io/api/webhooks/1/x',
      'http://discord.com/api/webhooks/1/x',
      'https://discord.com.evil.io/api/webhooks/1/x',
    ]) {
      expect(
        await errorsOf(UpdateMonitoringSettingsDto, {
          webhookUrl,
          enabled: true,
          retentionDays: 30,
        }),
      ).toContain('webhookUrl');
    }
  });

  it('số ngày lưu ngoài 7..365 → lỗi', async () => {
    for (const retentionDays of [6, 366, 10.5]) {
      expect(
        await errorsOf(UpdateMonitoringSettingsDto, {
          enabled: true,
          retentionDays,
        }),
      ).toContain('retentionDays');
    }
  });

  it('thiếu enabled → lỗi', async () => {
    expect(
      await errorsOf(UpdateMonitoringSettingsDto, { retentionDays: 30 }),
    ).toContain('enabled');
  });
});

describe('TestWebhookDto / SendReportDto', () => {
  it('webhookUrl tuỳ chọn nhưng phải là Discord', async () => {
    expect(await errorsOf(TestWebhookDto, {})).toEqual([]);
    expect(
      await errorsOf(TestWebhookDto, { webhookUrl: 'https://x.io/a' }),
    ).toContain('webhookUrl');
  });

  it('week phải là YYYY-MM-DD', async () => {
    expect(await errorsOf(SendReportDto, { week: '2026-09-14' })).toEqual([]);
    expect(await errorsOf(SendReportDto, { week: '14/09/2026' })).toContain(
      'week',
    );
  });
});

describe('ListErrorGroupsQuery', () => {
  it('mặc định trang 1, 20 dòng; ép kiểu số từ query string', async () => {
    const q = plainToInstance(ListErrorGroupsQuery, { page: '3', limit: '50' });
    expect(await validate(q)).toHaveLength(0);
    expect(q.page).toBe(3);
    expect(q.limit).toBe(50);
    const d = plainToInstance(ListErrorGroupsQuery, {});
    expect(d.page).toBe(1);
    expect(d.limit).toBe(20);
  });

  it('limit > 100, level/source lạ → lỗi', async () => {
    const errors = await errorsOf(ListErrorGroupsQuery, {
      limit: '500',
      level: 'WARN',
      source: 'X',
    });
    expect(errors).toEqual(
      expect.arrayContaining(['limit', 'level', 'source']),
    );
  });
});
