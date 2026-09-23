import { type DiscordPayload, isDiscordWebhookUrl } from './discord-report';

const REQUEST_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 10_000;

type FetchFn = typeof fetch;
type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lỗi gửi webhook. Thông điệp CỐ Ý không chứa URL — URL webhook là bí mật
 * (ai có nó đều post được vào kênh) và lỗi này sẽ đi vào log/audit.
 */
export class DiscordWebhookError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'DiscordWebhookError';
  }
}

async function retryAfterMs(res: Response): Promise<number> {
  try {
    const body = (await res.json()) as { retry_after?: unknown };
    const seconds = Number(body.retry_after);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(Math.ceil(seconds * 1000), MAX_RETRY_WAIT_MS);
    }
  } catch {
    // Body lạ → dùng mặc định bên dưới.
  }
  return 1000;
}

export class DiscordWebhookClient {
  constructor(
    private readonly fetchFn: FetchFn = fetch,
    private readonly sleep: SleepFn = defaultSleep,
  ) {}

  async send(webhookUrl: string, payload: DiscordPayload): Promise<void> {
    if (!isDiscordWebhookUrl(webhookUrl)) {
      throw new DiscordWebhookError('URL webhook Discord không hợp lệ', null);
    }
    const url = `${webhookUrl.replace(/\/$/, '')}?wait=true`;
    const body = JSON.stringify(payload);

    for (let attempt = 0; ; attempt += 1) {
      const res = await this.post(url, body);
      if (res.ok) return;
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await this.sleep(await retryAfterMs(res));
        continue;
      }
      throw new DiscordWebhookError(
        res.status === 429
          ? 'Discord giới hạn tần suất gửi, thử lại sau'
          : `Discord từ chối webhook (HTTP ${res.status})`,
        res.status,
      );
    }
  }

  private async post(url: string, body: string): Promise<Response> {
    try {
      return await this.fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        // Không theo redirect: tránh bị dẫn sang host khác (SSRF).
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new DiscordWebhookError(
        timedOut
          ? 'Discord không phản hồi trong 5 giây'
          : 'Không kết nối được tới Discord',
        null,
      );
    }
  }
}
