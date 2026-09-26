import { ConfigService } from '@nestjs/config';
import {
  ONESIGNAL_NOTIFICATIONS_URL,
  PushService,
  pushIdempotencyKey,
  type AlertPushData,
} from './push.service';

const CONFIGURED = {
  ONESIGNAL_APP_ID: 'app-123',
  ONESIGNAL_REST_API_KEY: 'os_v2_secret',
  WEB_ORIGIN: 'https://fcare.test/',
};

const baseData: AlertPushData = {
  alertId: 'alert-1',
  alertLevel: 3,
  recipientIds: ['gv-b', 'gv-a'],
  title: 'Cảnh báo Cao (điểm danh) — Nguyễn An (SE1)',
  body: 'Vắng 3 buổi',
  targetUrl: '/students/sv-1?tab=care',
};

function makeService(env: Record<string, string> = CONFIGURED) {
  return new PushService(new ConfigService(env));
}

function sentBody(fetchMock: jest.SpyInstance): Record<string, unknown> {
  const calls = fetchMock.mock.calls as unknown[][];
  const init = calls[0][1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('PushService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('gửi cảnh báo cấp 3 tới đúng external_id với khoá REST', async () => {
    await makeService().sendAlertPush(baseData);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown[][];
    expect(calls[0][0]).toBe(ONESIGNAL_NOTIFICATIONS_URL);
    const init = calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Key os_v2_secret',
    );
    expect(sentBody(fetchMock)).toEqual({
      app_id: 'app-123',
      target_channel: 'push',
      include_aliases: { external_id: ['gv-b', 'gv-a'] },
      headings: { en: baseData.title, vi: baseData.title },
      contents: { en: baseData.body, vi: baseData.body },
      web_url: 'https://fcare.test/students/sv-1?tab=care',
      idempotency_key: pushIdempotencyKey(
        'alert-1',
        ['gv-b', 'gv-a'],
        baseData.alertLevel,
      ),
    });
  });

  it('không có targetUrl thì mở trang /alerts', async () => {
    await makeService().sendAlertPush({ ...baseData, targetUrl: null });
    expect(sentBody(fetchMock).web_url).toBe('https://fcare.test/alerts');
  });

  it.each([1, 2])('cảnh báo cấp %i không push', async (alertLevel) => {
    await makeService().sendAlertPush({ ...baseData, alertLevel });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('không có người nhận thì không gọi OneSignal', async () => {
    await makeService().sendAlertPush({ ...baseData, recipientIds: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('thiếu cấu hình thì tắt lặng lẽ', async () => {
    await makeService({ WEB_ORIGIN: 'https://fcare.test' }).sendAlertPush(
      baseData,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lỗi mạng không ném ra ngoài', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      makeService().sendAlertPush(baseData),
    ).resolves.toBeUndefined();
  });

  it('HTTP 4xx/5xx không ném ra ngoài', async () => {
    fetchMock.mockResolvedValue(new Response('bad', { status: 400 }));
    await expect(
      makeService().sendAlertPush(baseData),
    ).resolves.toBeUndefined();
  });

  it('gắn AbortSignal để cắt request treo', async () => {
    await makeService().sendAlertPush(baseData);
    const calls = fetchMock.mock.calls as unknown[][];
    expect((calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});

describe('PushService — NOTIFICATIONS_EXTERNAL_DISABLED', () => {
  it('bật cờ chặn → không gọi OneSignal dù đã cấu hình', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await makeService({
      ...CONFIGURED,
      NOTIFICATIONS_EXTERNAL_DISABLED: 'true',
    }).sendAlertPush(baseData);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('pushIdempotencyKey', () => {
  it('ổn định, không phụ thuộc thứ tự người nhận, có dạng UUID', () => {
    const a = pushIdempotencyKey('alert-1', ['gv-a', 'gv-b']);
    const b = pushIdempotencyKey('alert-1', ['gv-b', 'gv-a']);
    expect(a).toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('khác cảnh báo hoặc khác người nhận thì khác khoá', () => {
    const base = pushIdempotencyKey('alert-1', ['gv-a']);
    expect(pushIdempotencyKey('alert-2', ['gv-a'])).not.toBe(base);
    expect(pushIdempotencyKey('alert-1', ['gv-b'])).not.toBe(base);
  });

  it('cùng cảnh báo được nâng mức thì khác khoá — OneSignal không nuốt lượt báo lại', () => {
    expect(pushIdempotencyKey('alert-1', ['gv-a'], 4)).not.toBe(
      pushIdempotencyKey('alert-1', ['gv-a'], 3),
    );
  });
});
