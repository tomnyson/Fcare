import type { Page } from '@playwright/test';

/**
 * `ImportsController` gắn `@Throttle({ default: { limit: 10, ttl: 60_000 } })`.
 * Khoá throttler của @nestjs/throttler băm theo `ClassName-HandlerName-...`, tức
 * mỗi handler (`upload`, `commit`, `discard`, `preview`, `list`) có ngân sách
 * RIÊNG 10 lượt/phút cho mỗi IP.
 *
 * Bộ E2E gọi các handler này liên tiếp, chạy lại 3 lần cho 3 trình duyệt. Thay
 * vì nới giới hạn thật ở API (làm yếu một biện pháp bảo mật để test dễ xanh),
 * test tự giữ nhịp.
 *
 * QUAN TRỌNG: không thể đếm bằng cách "mỗi lần test chủ động gọi thì +1", vì
 * `GET /imports` còn được gọi ngầm mỗi khi TanStack Query invalidate cache sau
 * commit/huỷ. Vì vậy bộ đếm nghe THẲNG trên network của trình duyệt —
 * `trackImportCalls(page)` — còn `paceImportCall` chỉ đọc bộ đếm đó và ngủ.
 */
const LIMIT_PER_WINDOW = 8; // chừa 2 lượt dự phòng so với trần thật là 10
const WINDOW_MS = 61_000; // dài hơn ttl 60s một chút cho lệch đồng hồ

const calls = new Map<string, number[]>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Suy ra tên handler bị tính throttle từ method + URL của request. */
function handlerOf(method: string, url: string): string | null {
  const match = /\/api\/imports(\/[^?]*)?/.exec(url);
  if (!match) return null;
  const rest = match[1] ?? '';
  if (method === 'POST' && rest === '') return 'upload';
  if (method === 'POST' && rest.endsWith('/commit')) return 'commit';
  if (method === 'DELETE') return 'discard';
  if (method === 'GET' && rest.endsWith('/preview')) return 'preview';
  if (method === 'GET' && rest === '') return 'list';
  return null;
}

function recent(handler: string, now: number): number[] {
  return (calls.get(handler) ?? []).filter((at) => now - at < WINDOW_MS);
}

/**
 * Gắn một lần cho mỗi `page` (làm trong `login`) — mọi request tới `/imports`,
 * kể cả request do cache invalidation tự phát, đều được ghi nhận.
 */
export function trackImportCalls(page: Page): void {
  page.on('request', (request) => {
    const handler = handlerOf(request.method(), request.url());
    if (!handler) return;
    const now = Date.now();
    calls.set(handler, [...recent(handler, now), now]);
  });
  // Bộ đếm reset mỗi lần chạy Playwright, còn cửa sổ throttle ở API thì không:
  // chạy lại ngay sau một lượt trước có thể dính 429 ngay từ đầu. Thấy 429 thì
  // coi như ngân sách đã cạn để các lượt sau tự chờ hết cửa sổ.
  page.on('response', (response) => {
    if (response.status() !== 429) return;
    const handler = handlerOf(response.request().method(), response.url());
    if (!handler) return;
    const now = Date.now();
    calls.set(
      handler,
      Array.from({ length: LIMIT_PER_WINDOW }, () => now),
    );
  });
}

/** Chờ hết cửa sổ hiện tại của một handler rồi xoá bộ đếm. */
export async function waitOutThrottleWindow(handler: string): Promise<void> {
  const now = Date.now();
  const seen = recent(handler, now);
  await sleep(seen.length > 0 ? WINDOW_MS - (now - seen[0]) + 250 : WINDOW_MS);
  calls.delete(handler);
}

/**
 * Gọi TRƯỚC mỗi thao tác chạm một handler của `/imports`. Ngủ đúng bằng thời
 * gian còn lại của cửa sổ khi ngân sách đã cạn, còn lại thì không tốn gì.
 */
export async function paceImportCall(handler: string): Promise<void> {
  // Cửa sổ trượt thật: ngủ cho tới khi lượt CŨ NHẤT rời cửa sổ rồi đếm lại. Nếu
  // chỉ ngủ một lần rồi xoá sạch bộ đếm, các lượt còn trong cửa sổ bị bỏ sót và
  // vẫn có thể vượt trần 10 lượt/phút của API.
  for (;;) {
    const now = Date.now();
    const seen = recent(handler, now);
    calls.set(handler, seen);
    if (seen.length < LIMIT_PER_WINDOW) return;
    await sleep(WINDOW_MS - (now - seen[0]) + 250);
  }
}
