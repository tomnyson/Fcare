/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import {
  DiscordWebhookClient,
  DiscordWebhookError,
} from './discord-webhook.client';
import { buildTestPayload } from './discord-report';

const URL_OK = 'https://discord.com/api/webhooks/123/secret-token';

function response(status: number, body: unknown = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('DiscordWebhookClient', () => {
  const payload = buildTestPayload('test');

  it('POST ?wait=true với JSON', async () => {
    const fetchFn = jest.fn().mockResolvedValue(response(200));
    const client = new DiscordWebhookClient(fetchFn, jest.fn());
    await client.send(URL_OK, payload);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${URL_OK}?wait=true`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(payload);
    expect(init.redirect).toBe('error');
  });

  it('429 → chờ retry_after (có trần) rồi thử lại', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(response(429, { retry_after: 2.5 }))
      .mockResolvedValueOnce(response(429, { retry_after: 999 }))
      .mockResolvedValueOnce(response(204));
    const sleep = jest.fn().mockResolvedValue(undefined);
    await new DiscordWebhookClient(fetchFn, sleep).send(URL_OK, payload);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2500, 10_000]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('429 liên tục → bỏ cuộc sau 3 lần thử lại', async () => {
    const fetchFn = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(response(429, { retry_after: 1 })),
      );
    const client = new DiscordWebhookClient(fetchFn, jest.fn());
    await expect(client.send(URL_OK, payload)).rejects.toBeInstanceOf(
      DiscordWebhookError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('lỗi HTTP khác → ném lỗi KHÔNG chứa URL/token', async () => {
    const fetchFn = jest.fn().mockResolvedValue(response(404));
    const client = new DiscordWebhookClient(fetchFn, jest.fn());
    const error = await client.send(URL_OK, payload).catch((e: Error) => e);
    expect(error).toBeInstanceOf(DiscordWebhookError);
    expect((error as DiscordWebhookError).status).toBe(404);
    expect(String((error as Error).message)).not.toContain('secret-token');
  });

  it('lỗi mạng → ném lỗi không lộ URL', async () => {
    const fetchFn = jest
      .fn()
      .mockRejectedValue(new Error(`connect ECONNREFUSED ${URL_OK}`));
    const error = await new DiscordWebhookClient(fetchFn, jest.fn())
      .send(URL_OK, payload)
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(DiscordWebhookError);
    expect((error as Error).message).not.toContain('secret-token');
  });

  it('URL không phải webhook Discord → từ chối, không gọi mạng', async () => {
    const fetchFn = jest.fn();
    await expect(
      new DiscordWebhookClient(fetchFn, jest.fn()).send(
        'https://evil.io/api/webhooks/1/x',
        payload,
      ),
    ).rejects.toBeInstanceOf(DiscordWebhookError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
