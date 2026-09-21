# Push cảnh báo cấp 3–4 qua OneSignal + âm thanh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cảnh báo cấp 3 (Cao) và 4 (Khẩn cấp) hiện popup hệ điều hành qua OneSignal Web Push kể cả khi đóng tab, và phát tiếng riêng khi tab FCare đang mở.

**Architecture:** API thêm `PushService` (module `push/`) gọi REST OneSignal, được `NotificationDispatchService.deliver()` gọi fire-and-forget cho đúng những người vừa được tạo thông báo; SSE payload thêm `alertLevel`. Web khởi tạo SDK `react-onesignal`, định danh bằng `OneSignal.login(staff.id)`, có nút bật/tắt push + công tắc âm thanh trong dropdown chuông; `useNotificationStream` phát tiếng Web Audio khi SSE có `alertLevel >= 3`.

**Tech Stack:** NestJS 11 + `@nestjs/config` + global `fetch` (Node 22), jest 30 · Next 15 / React 19, TanStack Query, `react-onesignal` 3.x, vitest 4 (env `node`).

**Spec:** `docs/superpowers/specs/2026-09-21-onesignal-alert-push-design.md`

## Global Constraints

- Chỉ push khi `source.kind === 'alert'` và `alert.level >= 3` (`PUSH_MIN_ALERT_LEVEL = 3`).
- Định danh OneSignal DUY NHẤT là `external_id = staff.id` — không gửi email, tên, vai trò cán bộ.
- Push/âm thanh KHÔNG bao giờ được ném lỗi ra luồng gửi cảnh báo hay render UI: lỗi → `logger.warn` (API, không in title/body) hoặc nuốt lặng (web).
- Timeout gọi OneSignal: `PUSH_TIMEOUT_MS = 5_000`. Header `Authorization: Key <ONESIGNAL_REST_API_KEY>`.
- Env: API `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`; web `NEXT_PUBLIC_ONESIGNAL_APP_ID`. Thiếu → tính năng tự tắt, app chạy bình thường.
- Web: chỉ dùng token/class có sẵn (`text-muted`, `text-ink`, `border-border`, `text-fpt-blue`, `bg-fpt-orange-50`…), không hardcode màu. `localStorage` luôn bọc try/catch.
- Không nâng Prisma, không thêm migration (tính năng không đổi schema).
- KHÔNG commit — dự án chỉ commit khi user yêu cầu. Bước "Commit" của skill được thay bằng "Kiểm tra diff".
- Trước khi sửa symbol có sẵn (`NotificationDispatchService.deliver`, `useNotificationStream`, `SidebarFooter`, `DashboardLayout`, `Topbar`): chạy gitnexus `impact({target, direction:"upstream", repo:"Fcare"})`, báo nếu HIGH/CRITICAL.
- Lệnh test: API `pnpm --filter @fcare/api test -- <pattern>`; web `pnpm --filter @fcare/web test -- <pattern>`.

## File Structure

| File | Trách nhiệm |
|---|---|
| `apps/api/src/modules/push/push.service.ts` (mới) | Gọi REST OneSignal cho 1 cảnh báo; lọc cấp, chia lô, timeout, idempotency |
| `apps/api/src/modules/push/push.module.ts` (mới) | Đăng ký + export `PushService` |
| `apps/api/src/modules/push/push.service.spec.ts` (mới) | Unit test `PushService` |
| `apps/api/src/modules/alerts/notification-events.service.ts` | Thêm `alertLevel` vào payload SSE |
| `apps/api/src/modules/alerts/notification-dispatch.service.ts` | Đọc level, đưa vào SSE, gọi push |
| `apps/api/src/modules/alerts/notification-dispatch.service.spec.ts` | Cập nhật + test mới |
| `apps/api/src/modules/notifications/notifications.module.ts` | Import `PushModule` |
| `apps/web/src/lib/push/alert-sound.ts` (+ `.test.ts`) (mới) | Quyết định phát tiếng, tuỳ chọn âm thanh, phát Web Audio |
| `apps/web/src/lib/push/push-state.ts` (+ `.test.ts`) (mới) | Hàm thuần suy trạng thái push + chữ hiển thị |
| `apps/web/src/lib/push/onesignal.ts` (mới) | Bọc `react-onesignal`: init/identify/reset/đọc trạng thái/bật/tắt |
| `apps/web/src/lib/push/use-push-subscription.ts` (mới) | Hook React cho UI + `usePushIdentity` |
| `apps/web/src/components/dashboard/push-settings.tsx` (mới) | Khối "Thông báo trình duyệt" + công tắc âm thanh trong dropdown |
| `apps/web/public/OneSignalSDKWorker.js` (mới) | Service worker OneSignal |
| `apps/web/src/lib/use-notification-stream.ts` | Phát tiếng khi SSE cấp ≥ 3 |
| `apps/web/src/components/dashboard/topbar.tsx` | Gắn `<PushSettings />` |
| `apps/web/src/app/(dashboard)/layout.tsx` | Gọi `usePushIdentity(user.id)` |
| `apps/web/src/components/dashboard/sidebar.tsx` | `resetPush()` khi đăng xuất |
| `.env.example`, `infra/docker/env.production.sample`, `infra/docker/docker-compose.prod.yml`, `infra/docker/Dockerfile.web` | Khai báo biến OneSignal |

---

### Task 1: `PushService` gọi OneSignal

**Files:**
- Create: `apps/api/src/modules/push/push.service.ts`
- Create: `apps/api/src/modules/push/push.module.ts`
- Test: `apps/api/src/modules/push/push.service.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export const ONESIGNAL_NOTIFICATIONS_URL = 'https://api.onesignal.com/notifications';
  export const PUSH_MIN_ALERT_LEVEL = 3;
  export const PUSH_TIMEOUT_MS = 5_000;
  export interface AlertPushData {
    alertId: string; alertLevel: number; recipientIds: string[];
    title: string; body: string; targetUrl: string | null;
  }
  export function pushIdempotencyKey(alertId: string, recipientIds: string[]): string;
  export class PushService { sendAlertPush(data: AlertPushData): Promise<void> } // không bao giờ reject
  export class PushModule {}
  ```

- [ ] **Step 1: Viết test fail**

`apps/api/src/modules/push/push.service.spec.ts`:

```ts
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
      idempotency_key: pushIdempotencyKey('alert-1', ['gv-b', 'gv-a']),
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
    await expect(makeService().sendAlertPush(baseData)).resolves.toBeUndefined();
  });

  it('HTTP 4xx/5xx không ném ra ngoài', async () => {
    fetchMock.mockResolvedValue(new Response('bad', { status: 400 }));
    await expect(makeService().sendAlertPush(baseData)).resolves.toBeUndefined();
  });

  it('gắn AbortSignal để cắt request treo', async () => {
    await makeService().sendAlertPush(baseData);
    const calls = fetchMock.mock.calls as unknown[][];
    expect((calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
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
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `pnpm --filter @fcare/api test -- push.service`
Expected: FAIL — `Cannot find module './push.service'`.

- [ ] **Step 3: Viết `push.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export const ONESIGNAL_NOTIFICATIONS_URL =
  'https://api.onesignal.com/notifications';
/** Chỉ cảnh báo Cao (3) và Khẩn cấp (4) mới push lên trình duyệt. */
export const PUSH_MIN_ALERT_LEVEL = 3;
export const PUSH_TIMEOUT_MS = 5_000;
/** Giới hạn external_id của OneSignal cho một request. */
const MAX_EXTERNAL_IDS_PER_REQUEST = 20_000;

export interface AlertPushData {
  alertId: string;
  alertLevel: number;
  /** Chỉ những người VỪA được tạo thông báo — retry không push lại. */
  recipientIds: string[];
  title: string;
  body: string;
  targetUrl: string | null;
}

/**
 * Khoá chống gửi trùng phía OneSignal: cùng cảnh báo + cùng tập người nhận
 * luôn ra cùng một chuỗi dạng UUID (OneSignal bỏ request trùng trong 30 ngày).
 */
export function pushIdempotencyKey(
  alertId: string,
  recipientIds: string[],
): string {
  const hex = createHash('sha256')
    .update([alertId, ...[...recipientIds].sort()].join('|'))
    .digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

/**
 * Web Push qua OneSignal — kênh phụ cho cảnh báo cấp 3–4 khi cán bộ đã đóng
 * tab. Chuông trong app + SSE vẫn là kênh chính, nên mọi lỗi ở đây chỉ ghi log
 * và KHÔNG ném ra luồng gửi cảnh báo. Định danh duy nhất gửi đi là staff.id.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly appId: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly webBaseUrl: string;
  private warnedMissingConfig = false;

  constructor(config: ConfigService) {
    this.appId = config.get<string>('ONESIGNAL_APP_ID') || undefined;
    this.apiKey = config.get<string>('ONESIGNAL_REST_API_KEY') || undefined;
    const base =
      config.get<string>('WEB_BASE_URL') ??
      config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
    this.webBaseUrl = base.replace(/\/+$/, '');
  }

  async sendAlertPush(data: AlertPushData): Promise<void> {
    if (
      data.alertLevel < PUSH_MIN_ALERT_LEVEL ||
      data.recipientIds.length === 0
    ) {
      return;
    }
    if (!this.appId || !this.apiKey) {
      if (!this.warnedMissingConfig) {
        this.warnedMissingConfig = true;
        this.logger.warn(
          'Chưa cấu hình ONESIGNAL_APP_ID/ONESIGNAL_REST_API_KEY — bỏ qua push trình duyệt.',
        );
      }
      return;
    }
    for (const batch of chunk(data.recipientIds, MAX_EXTERNAL_IDS_PER_REQUEST)) {
      await this.post(data, batch);
    }
  }

  private async post(data: AlertPushData, recipientIds: string[]): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);
    try {
      const response = await fetch(ONESIGNAL_NOTIFICATIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${this.apiKey}`,
        },
        body: JSON.stringify({
          app_id: this.appId,
          target_channel: 'push',
          include_aliases: { external_id: recipientIds },
          headings: { en: data.title, vi: data.title },
          contents: { en: data.body, vi: data.body },
          web_url: `${this.webBaseUrl}${data.targetUrl ?? '/alerts'}`,
          idempotency_key: pushIdempotencyKey(data.alertId, recipientIds),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(
          `OneSignal trả HTTP ${response.status} khi push cảnh báo ${data.alertId}.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Không push được cảnh báo ${data.alertId}: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
```

`push.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PushService } from './push.service';

@Module({
  imports: [ConfigModule],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `pnpm --filter @fcare/api test -- push.service`
Expected: PASS (11 test).

- [ ] **Step 5: Lint + kiểm tra diff**

Run: `pnpm --filter @fcare/api exec eslint --fix src/modules/push` → không còn lỗi. `git status` chỉ thấy 3 file mới trong `src/modules/push/`.

---

### Task 2: Nối push vào `NotificationDispatchService` + `alertLevel` trong SSE

**Files:**
- Modify: `apps/api/src/modules/alerts/notification-events.service.ts:6-15`
- Modify: `apps/api/src/modules/alerts/notification-dispatch.service.ts` (constructor ~dòng 53-57, `deliver()` ~dòng 93-150)
- Modify: `apps/api/src/modules/notifications/notifications.module.ts`
- Test: `apps/api/src/modules/alerts/notification-dispatch.service.spec.ts`

**Interfaces:**
- Consumes: `PushService.sendAlertPush(data: AlertPushData): Promise<void>`, `PushModule` (Task 1).
- Produces: SSE payload `NotificationEvent['payload'].alertLevel: number | null` — web (Task 3) đọc trường này.

- [ ] **Step 0: Impact**

Chạy `impact({target:"deliver", direction:"upstream", repo:"Fcare"})` (lọc file `notification-dispatch.service.ts`) và `impact({target:"NotificationEventsService"...})`. Báo blast radius; HIGH/CRITICAL → báo user trước khi sửa.

- [ ] **Step 1: Cập nhật + viết test fail**

Trong `notification-dispatch.service.spec.ts`:

1. Thêm import ở đầu file:
```ts
import type { PushService } from '../push/push.service';
```

2. Thay `makeService` trong describe đầu tiên:
```ts
  function makeService(
    notifications: Array<Record<string, unknown>>,
    alertLevel: number | null = 3,
  ) {
    const createManyAndReturn = jest.fn().mockResolvedValue(notifications);
    const findUnique = jest
      .fn()
      .mockResolvedValue(alertLevel === null ? null : { level: alertLevel });
    const prisma = {
      notification: { createManyAndReturn },
      alert: { findUnique },
    } as unknown as PrismaService;
    const events = new NotificationEventsService();
    const emit = jest.spyOn(events, 'emit');
    const sendAlertPush = jest.fn().mockResolvedValue(undefined);
    const push = { sendAlertPush } as unknown as PushService;
    const service = new NotificationDispatchService(
      prisma,
      events,
      undefined,
      push,
    );
    return { service, createManyAndReturn, emit, findUnique, sendAlertPush };
  }
```

3. Trong test `'phát sự kiện SSE tới từng người nhận'`, payload mong đợi thêm `alertLevel: 3,` (sau `body: 'lý do',`).

4. Trong test `'gửi thông báo analysis theo source riêng và giữ idempotency'`, payload mong đợi thêm `alertLevel: null,` và thêm cuối test:
```ts
    expect(sendAlertPush).not.toHaveBeenCalled();
```
đổi destructure thành `const { service, createManyAndReturn, emit, sendAlertPush } = makeService(notifications);`.

5. Thêm các test mới trong describe đầu tiên (trước `});` đóng describe):
```ts
  it('push cảnh báo chỉ cho người VỪA được tạo thông báo', async () => {
    const createdAt = new Date('2026-09-21T00:00:00Z');
    // dt-hoa đã có thông báo từ lần chạy trước → createManyAndReturn bỏ qua.
    const { service, sendAlertPush, findUnique } = makeService([
      {
        id: 'noti-1',
        recipientId: 'tbm-se',
        alertId: 'alert-1',
        title: 'Cảnh báo',
        body: 'lý do',
        createdAt,
      },
    ]);
    await service.deliver({ ...jobData, targetUrl: '/students/sv-1' });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      select: { level: true },
    });
    expect(sendAlertPush).toHaveBeenCalledWith({
      alertId: 'alert-1',
      alertLevel: 3,
      recipientIds: ['tbm-se'],
      title: 'Cảnh báo',
      body: 'lý do',
      targetUrl: '/students/sv-1',
    });
  });

  it('không tạo thông báo mới nào thì không push, không đọc level', async () => {
    const { service, sendAlertPush, findUnique } = makeService([]);
    await service.deliver(jobData);
    expect(sendAlertPush).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('cảnh báo đã bị xoá (không đọc được level) → SSE alertLevel null, không push', async () => {
    const { service, sendAlertPush, emit } = makeService(
      [
        {
          id: 'noti-1',
          recipientId: 'tbm-se',
          alertId: 'alert-1',
          title: 'Cảnh báo',
          body: 'lý do',
          createdAt: new Date(),
        },
      ],
      null,
    );
    await service.deliver(jobData);
    const [event] = emit.mock.calls[0] as [{ payload: { alertLevel: unknown } }];
    expect(event.payload.alertLevel).toBeNull();
    expect(sendAlertPush).not.toHaveBeenCalled();
  });

  it('push lỗi không làm hỏng deliver', async () => {
    const { service, sendAlertPush } = makeService([
      {
        id: 'noti-1',
        recipientId: 'tbm-se',
        alertId: 'alert-1',
        title: 'Cảnh báo',
        body: 'lý do',
        createdAt: new Date(),
      },
    ]);
    sendAlertPush.mockRejectedValue(new Error('boom'));
    await expect(service.deliver(jobData)).resolves.toBe(1);
  });
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `pnpm --filter @fcare/api test -- notification-dispatch`
Expected: FAIL — payload thiếu `alertLevel`, `sendAlertPush` không được gọi.

- [ ] **Step 3: Implement**

`notification-events.service.ts` — trong `payload` thêm sau `alertId: string | null;`:
```ts
    /** Cấp cảnh báo (1–4) khi thông báo gắn cảnh báo — web dùng để phát tiếng. */
    alertLevel: number | null;
```

`notification-dispatch.service.ts`:

Import:
```ts
import { PushService } from '../push/push.service';
```

Constructor:
```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: NotificationEventsService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly pushService?: PushService,
  ) {}
```

Trong `deliver()`, ngay sau `createManyAndReturn(...)` và trước vòng `for` emit:
```ts
    const alertLevel =
      notifications.length > 0 ? await this.alertLevelOf(normalized.source) : null;
```
Trong object `payload` của `this.events.emit`, thêm sau `alertId: notification.alertId ?? null,`:
```ts
          alertLevel,
```
Sau khối `if (this.emailService) { ... }` thêm:
```ts
    if (
      this.pushService &&
      alertLevel !== null &&
      normalized.source.kind === 'alert'
    ) {
      this.pushService
        .sendAlertPush({
          alertId: normalized.source.alertId,
          alertLevel,
          recipientIds: notifications.map((row) => row.recipientId),
          title: normalized.title,
          body: normalized.body,
          targetUrl: normalized.source.targetUrl ?? null,
        })
        .catch((err) =>
          this.logger.warn(
            `Lỗi push trình duyệt: ${err instanceof Error ? err.message : 'Unknown error'}`,
          ),
        );
    }
```
Thêm method private (cạnh `normalize`):
```ts
  /** Chỉ thông báo nguồn `alert` mới mang cấp — nguồn khác không phát tiếng/push. */
  private async alertLevelOf(
    source: NotificationSource,
  ): Promise<number | null> {
    if (source.kind !== 'alert') {
      return null;
    }
    const alert = await this.prisma.alert.findUnique({
      where: { id: source.alertId },
      select: { level: true },
    });
    return alert?.level ?? null;
  }
```

`notifications.module.ts`:
```ts
import { PushModule } from '../push/push.module';
...
  imports: [EmailModule, PushModule],
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `pnpm --filter @fcare/api test -- notification-dispatch push.service`
Expected: PASS.
Sau đó toàn bộ API: `pnpm --filter @fcare/api test` → mọi test pass (nếu spec khác so khớp nguyên payload SSE, thêm `alertLevel` vào kỳ vọng của nó). `pnpm --filter @fcare/api typecheck` sạch.

- [ ] **Step 5: Lint + kiểm tra diff**

Run: `pnpm --filter @fcare/api exec eslint --fix src/modules/alerts src/modules/notifications src/modules/push`. `git diff --stat` chỉ gồm các file của task.

---

### Task 3: Âm thanh cảnh báo khi tab mở

**Files:**
- Create: `apps/web/src/lib/push/alert-sound.ts`
- Test: `apps/web/src/lib/push/alert-sound.test.ts`
- Modify: `apps/web/src/lib/use-notification-stream.ts` (hàm `invalidate`, ~dòng 24-44)

**Interfaces:**
- Consumes: SSE payload `alertLevel: number | null` (Task 2).
- Produces:
  ```ts
  export const ALERT_SOUND_MIN_LEVEL = 3;
  export const SOUND_PREFERENCE_KEY = 'fcare.alertSound';
  export interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
  export function shouldPlayAlertSound(payload: { alertLevel?: number | null }, enabled: boolean): boolean;
  export function readSoundPreference(storage?: PreferenceStorage | null): boolean;   // mặc định true
  export function writeSoundPreference(enabled: boolean, storage?: PreferenceStorage | null): void;
  export function playAlertSound(): void;
  ```

- [ ] **Step 1: Viết test fail**

`apps/web/src/lib/push/alert-sound.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  SOUND_PREFERENCE_KEY,
  readSoundPreference,
  shouldPlayAlertSound,
  writeSoundPreference,
  type PreferenceStorage,
} from './alert-sound';

function memoryStorage(initial: Record<string, string> = {}): PreferenceStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const throwingStorage: PreferenceStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('shouldPlayAlertSound', () => {
  it.each([
    [1, false],
    [2, false],
    [3, true],
    [4, true],
  ])('cấp %i → %s', (alertLevel, expected) => {
    expect(shouldPlayAlertSound({ alertLevel }, true)).toBe(expected);
  });

  it('không gắn cảnh báo thì im', () => {
    expect(shouldPlayAlertSound({ alertLevel: null }, true)).toBe(false);
    expect(shouldPlayAlertSound({}, true)).toBe(false);
  });

  it('người dùng tắt âm thì im kể cả cấp 4', () => {
    expect(shouldPlayAlertSound({ alertLevel: 4 }, false)).toBe(false);
  });
});

describe('tuỳ chọn âm thanh', () => {
  it('mặc định bật', () => {
    expect(readSoundPreference(memoryStorage())).toBe(true);
    expect(readSoundPreference(null)).toBe(true);
  });

  it('ghi tắt rồi đọc lại', () => {
    const storage = memoryStorage();
    writeSoundPreference(false, storage);
    expect(storage.data[SOUND_PREFERENCE_KEY]).toBe('off');
    expect(readSoundPreference(storage)).toBe(false);
    writeSoundPreference(true, storage);
    expect(readSoundPreference(storage)).toBe(true);
  });

  it('localStorage ném lỗi thì vẫn chạy, coi như bật', () => {
    expect(readSoundPreference(throwingStorage)).toBe(true);
    expect(() => writeSoundPreference(false, throwingStorage)).not.toThrow();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `pnpm --filter @fcare/web test -- alert-sound`
Expected: FAIL — không tìm thấy module `./alert-sound`.

- [ ] **Step 3: Implement `alert-sound.ts`**

```ts
/**
 * Tiếng báo cảnh báo cấp 3–4 khi tab FCare đang mở. Khi tab đã đóng, trình
 * duyệt không cho phát âm riêng — popup OneSignal dùng âm mặc định của máy.
 */

export const ALERT_SOUND_MIN_LEVEL = 3;
export const SOUND_PREFERENCE_KEY = 'fcare.alertSound';

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function shouldPlayAlertSound(
  payload: { alertLevel?: number | null },
  enabled: boolean,
): boolean {
  return (
    enabled && payload.alertLevel != null && payload.alertLevel >= ALERT_SOUND_MIN_LEVEL
  );
}

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Tuỳ chọn theo từng máy; không đọc được (chế độ riêng tư, bị chặn) → bật. */
export function readSoundPreference(
  storage: PreferenceStorage | null = browserStorage(),
): boolean {
  try {
    return storage?.getItem(SOUND_PREFERENCE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeSoundPreference(
  enabled: boolean,
  storage: PreferenceStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(SOUND_PREFERENCE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Không lưu được thì chỉ mất ghi nhớ giữa các lần mở — không ảnh hưởng gì khác.
  }
}

const TONES: ReadonlyArray<{ frequency: number; start: number }> = [
  { frequency: 880, start: 0 },
  { frequency: 660, start: 0.18 },
];
const TONE_DURATION_S = 0.16;

/** Hai nốt ngắn bằng Web Audio — không cần file âm thanh. Bị chặn autoplay → im. */
export function playAlertSound(): void {
  if (typeof window === 'undefined') return;
  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return;
  try {
    const context = new AudioCtor();
    void context.resume().catch(() => undefined);
    const now = context.currentTime;
    for (const tone of TONES) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = tone.frequency;
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.25, now + tone.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + TONE_DURATION_S);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + tone.start);
      oscillator.stop(now + tone.start + TONE_DURATION_S);
    }
    window.setTimeout(() => void context.close().catch(() => undefined), 800);
  } catch {
    // Trình duyệt chặn âm thanh khi chưa có tương tác — bỏ qua.
  }
}
```

- [ ] **Step 4: Nối vào `useNotificationStream`**

Chạy `impact({target:"useNotificationStream", direction:"upstream", repo:"Fcare"})` trước.

Import thêm trong `apps/web/src/lib/use-notification-stream.ts`:
```ts
import { playAlertSound, readSoundPreference, shouldPlayAlertSound } from './push/alert-sound';
```
Trong `invalidate`, đổi kiểu payload và thêm phát tiếng ngay sau `JSON.parse`:
```ts
        const payload = JSON.parse(event.data) as {
          discussionMessageId?: string | null;
          alertId?: string | null;
          alertLevel?: number | null;
        };
        // Cảnh báo cấp 3–4 → kêu để cán bộ đang làm việc khác trong tab vẫn biết.
        if (shouldPlayAlertSound(payload, readSoundPreference())) {
          playAlertSound();
        }
```

- [ ] **Step 5: Chạy test, xác nhận PASS**

Run: `pnpm --filter @fcare/web test -- alert-sound` → PASS (10 test). `pnpm --filter @fcare/web typecheck` sạch.

---

### Task 4: SDK OneSignal, định danh, đăng xuất, cấu hình triển khai

**Files:**
- Modify: `apps/web/package.json` (thêm `react-onesignal`)
- Create: `apps/web/public/OneSignalSDKWorker.js`
- Create: `apps/web/src/lib/push/push-state.ts`
- Test: `apps/web/src/lib/push/push-state.test.ts`
- Create: `apps/web/src/lib/push/onesignal.ts`
- Create: `apps/web/src/lib/push/use-push-subscription.ts`
- Modify: `apps/web/src/app/(dashboard)/layout.tsx`
- Modify: `apps/web/src/components/dashboard/sidebar.tsx` (`SidebarFooter.onLogout`, ~dòng 306)
- Modify: `.env.example`, `infra/docker/env.production.sample`, `infra/docker/docker-compose.prod.yml`, `infra/docker/Dockerfile.web`

**Interfaces:**
- Produces:
  ```ts
  // push-state.ts (thuần, test được trong vitest env node)
  export type PushState = 'unsupported' | 'default' | 'denied' | 'subscribed' | 'unsubscribed';
  export function derivePushState(input: { supported: boolean; permission: NotificationPermission; optedIn: boolean }): PushState;
  export const PUSH_STATE_COPY: Record<PushState, { label: string; hint: string | null; action: 'enable' | 'disable' | null }>;
  // onesignal.ts
  export function isPushConfigured(): boolean;
  export function initPush(): Promise<boolean>;
  export function identifyPush(staffId: string): Promise<void>;
  export function resetPush(): Promise<void>;
  export function readPushState(): Promise<PushState>;
  export function enablePush(): Promise<void>;
  export function disablePush(): Promise<void>;
  export function onPushChange(listener: () => void): () => void;
  // use-push-subscription.ts
  export function usePushIdentity(staffId: string | undefined): void;
  export function usePushSubscription(): { state: PushState; busy: boolean; enable(): Promise<void>; disable(): Promise<void> };
  ```

- [ ] **Step 1: Cài gói + service worker**

Run: `pnpm --filter @fcare/web add react-onesignal@^3.5.6`

`apps/web/public/OneSignalSDKWorker.js`:
```js
// Service worker của OneSignal — phải nằm ở gốc site (/OneSignalSDKWorker.js).
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
```

- [ ] **Step 2: Viết test fail cho `push-state`**

`apps/web/src/lib/push/push-state.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PUSH_STATE_COPY, derivePushState } from './push-state';

describe('derivePushState', () => {
  it('trình duyệt không hỗ trợ → unsupported bất kể quyền', () => {
    expect(derivePushState({ supported: false, permission: 'granted', optedIn: true })).toBe(
      'unsupported',
    );
  });

  it('bị chặn → denied', () => {
    expect(derivePushState({ supported: true, permission: 'denied', optedIn: false })).toBe(
      'denied',
    );
  });

  it('chưa hỏi → default', () => {
    expect(derivePushState({ supported: true, permission: 'default', optedIn: false })).toBe(
      'default',
    );
  });

  it('đã cho phép + đang nhận → subscribed', () => {
    expect(derivePushState({ supported: true, permission: 'granted', optedIn: true })).toBe(
      'subscribed',
    );
  });

  it('đã cho phép nhưng tự tắt → unsubscribed', () => {
    expect(derivePushState({ supported: true, permission: 'granted', optedIn: false })).toBe(
      'unsubscribed',
    );
  });
});

describe('PUSH_STATE_COPY', () => {
  it('mỗi trạng thái có hành động đúng', () => {
    expect(PUSH_STATE_COPY.default.action).toBe('enable');
    expect(PUSH_STATE_COPY.unsubscribed.action).toBe('enable');
    expect(PUSH_STATE_COPY.subscribed.action).toBe('disable');
    expect(PUSH_STATE_COPY.denied.action).toBeNull();
    expect(PUSH_STATE_COPY.denied.hint).toMatch(/cài đặt/i);
  });
});
```

Run: `pnpm --filter @fcare/web test -- push-state` → FAIL (module chưa có).

- [ ] **Step 3: Implement `push-state.ts`**

```ts
export type PushState = 'unsupported' | 'default' | 'denied' | 'subscribed' | 'unsubscribed';

export function derivePushState(input: {
  supported: boolean;
  permission: NotificationPermission;
  optedIn: boolean;
}): PushState {
  if (!input.supported) return 'unsupported';
  if (input.permission === 'denied') return 'denied';
  if (input.permission === 'default') return 'default';
  return input.optedIn ? 'subscribed' : 'unsubscribed';
}

export const PUSH_STATE_COPY: Record<
  PushState,
  { label: string; hint: string | null; action: 'enable' | 'disable' | null }
> = {
  unsupported: { label: 'Trình duyệt không hỗ trợ thông báo', hint: null, action: null },
  default: {
    label: 'Bật thông báo trình duyệt',
    hint: 'Nhận cảnh báo Cao/Khẩn cấp cả khi đã đóng tab.',
    action: 'enable',
  },
  subscribed: {
    label: 'Thông báo trình duyệt: đang bật',
    hint: 'Cảnh báo Cao/Khẩn cấp sẽ hiện cả khi đã đóng tab.',
    action: 'disable',
  },
  unsubscribed: {
    label: 'Thông báo trình duyệt: đang tắt',
    hint: 'Bật lại để nhận cảnh báo Cao/Khẩn cấp khi đã đóng tab.',
    action: 'enable',
  },
  denied: {
    label: 'Trình duyệt đang chặn thông báo',
    hint: 'Mở cài đặt trang (biểu tượng ổ khoá cạnh địa chỉ) → cho phép Thông báo, rồi tải lại trang.',
    action: null,
  },
};
```

Run: `pnpm --filter @fcare/web test -- push-state` → PASS (6 test).

- [ ] **Step 4: `onesignal.ts` (bọc SDK)**

```ts
import OneSignal from 'react-onesignal';
import { derivePushState, type PushState } from './push-state';

const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ?? '';

let initPromise: Promise<boolean> | null = null;

export function isPushConfigured(): boolean {
  return APP_ID.length > 0;
}

/** Khởi tạo SDK đúng một lần mỗi tab; thiếu cấu hình hoặc lỗi → false, không ném. */
export function initPush(): Promise<boolean> {
  if (!isPushConfigured() || typeof window === 'undefined') {
    return Promise.resolve(false);
  }
  initPromise ??= OneSignal.init({ appId: APP_ID, allowLocalhostAsSecureOrigin: true }).then(
    () => true,
    () => {
      initPromise = null;
      return false;
    },
  );
  return initPromise;
}

/** Gắn thiết bị với cán bộ — định danh duy nhất gửi sang OneSignal là staff.id. */
export async function identifyPush(staffId: string): Promise<void> {
  if (!(await initPush())) return;
  await OneSignal.login(staffId).catch(() => undefined);
}

/** Gỡ định danh khi đăng xuất để máy dùng chung không nhận cảnh báo của người trước. */
export async function resetPush(): Promise<void> {
  if (!initPromise || !(await initPromise)) return;
  await OneSignal.logout().catch(() => undefined);
}

export async function readPushState(): Promise<PushState> {
  if (!(await initPush())) return 'unsupported';
  return derivePushState({
    supported: OneSignal.Notifications.isPushSupported(),
    permission: OneSignal.Notifications.permissionNative,
    optedIn: Boolean(OneSignal.User.PushSubscription.optedIn),
  });
}

/** Gọi từ thao tác bấm của người dùng — optIn tự hiện hộp xin quyền nếu chưa có. */
export async function enablePush(): Promise<void> {
  if (!(await initPush())) return;
  await OneSignal.User.PushSubscription.optIn();
}

export async function disablePush(): Promise<void> {
  if (!(await initPush())) return;
  await OneSignal.User.PushSubscription.optOut();
}

export function onPushChange(listener: () => void): () => void {
  let active = true;
  const handler = () => {
    if (active) listener();
  };
  void initPush().then((ready) => {
    if (!ready || !active) return;
    OneSignal.Notifications.addEventListener('permissionChange', handler);
    OneSignal.User.PushSubscription.addEventListener('change', handler);
  });
  return () => {
    active = false;
    if (!initPromise) return;
    OneSignal.Notifications.removeEventListener('permissionChange', handler);
    OneSignal.User.PushSubscription.removeEventListener('change', handler);
  };
}
```

- [ ] **Step 5: `use-push-subscription.ts`**

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  disablePush,
  enablePush,
  identifyPush,
  isPushConfigured,
  onPushChange,
  readPushState,
} from './onesignal';
import type { PushState } from './push-state';

/** Khởi tạo SDK + gắn staff.id sau khi đã vào dashboard (đã qua consent). */
export function usePushIdentity(staffId: string | undefined): void {
  useEffect(() => {
    if (staffId && isPushConfigured()) {
      void identifyPush(staffId);
    }
  }, [staffId]);
}

export function usePushSubscription(): {
  state: PushState;
  busy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
} {
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void readPushState().then(setState, () => setState('unsupported'));
  }, []);

  useEffect(() => {
    if (!isPushConfigured()) return;
    refresh();
    return onPushChange(refresh);
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
      } catch {
        // Người dùng bấm "Chặn" hoặc SDK lỗi — trạng thái mới đọc lại bên dưới.
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [refresh],
  );

  return {
    state,
    busy,
    enable: () => run(enablePush),
    disable: () => run(disablePush),
  };
}
```

- [ ] **Step 6: Gắn vào layout + đăng xuất**

Chạy `impact` cho `DashboardLayout` và `SidebarFooter` trước.

`apps/web/src/app/(dashboard)/layout.tsx`: import `import { usePushIdentity } from '../../lib/push/use-push-subscription';` và thêm ngay sau `useSessionKeepAlive();`:
```ts
  usePushIdentity(data?.user.id);
```

`apps/web/src/components/dashboard/sidebar.tsx`: import `import { resetPush } from '../../lib/push/onesignal';`, sửa `onLogout`:
```ts
  async function onLogout() {
    // Gỡ định danh push trước — máy dùng chung không nhận cảnh báo của người trước.
    await resetPush();
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    queryClient.clear();
    router.push('/login');
  }
```

- [ ] **Step 7: Cấu hình triển khai**

`.env.example` — sau dòng `NEXT_PUBLIC_API_URL=...`:
```
# --- Push trình duyệt (OneSignal) — bỏ trống thì tắt tính năng ---
# Web: App ID (công khai). API: App ID + REST API Key (bí mật, dạng os_v2_…).
NEXT_PUBLIC_ONESIGNAL_APP_ID=
ONESIGNAL_APP_ID=
ONESIGNAL_REST_API_KEY=
```

`infra/docker/env.production.sample` — sau `DEEPSEEK_BASE_URL=...`:
```
# Push trình duyệt (OneSignal). App ID dùng cho cả API lẫn build web; đổi App ID = build lại image web.
ONESIGNAL_APP_ID=
ONESIGNAL_REST_API_KEY=
```

`infra/docker/docker-compose.prod.yml`:
- Service `api` → `environment`, sau dòng `DEEPSEEK_BASE_URL: ...`:
```yaml
      ONESIGNAL_APP_ID: ${ONESIGNAL_APP_ID:-}
      ONESIGNAL_REST_API_KEY: ${ONESIGNAL_REST_API_KEY:-}
```
- Service `web` → `build.args`, sau `NEXT_PUBLIC_API_URL: ...`:
```yaml
        NEXT_PUBLIC_ONESIGNAL_APP_ID: ${ONESIGNAL_APP_ID:-}
```

`infra/docker/Dockerfile.web` — sau `ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL`:
```dockerfile
ARG NEXT_PUBLIC_ONESIGNAL_APP_ID=
ENV NEXT_PUBLIC_ONESIGNAL_APP_ID=$NEXT_PUBLIC_ONESIGNAL_APP_ID
```

- [ ] **Step 8: Kiểm tra**

Run: `pnpm --filter @fcare/web test` → PASS. `pnpm --filter @fcare/web typecheck` và `pnpm --filter @fcare/web lint` sạch. Nếu kiểu `permissionNative` của SDK khác `NotificationPermission`, ép bằng `as NotificationPermission` tại `readPushState` (không đổi `derivePushState`).

---

### Task 5: Khối cài đặt trong dropdown chuông

**Files:**
- Create: `apps/web/src/components/dashboard/push-settings.tsx`
- Modify: `apps/web/src/components/dashboard/topbar.tsx` (sau `</ul>` của danh sách thông báo, ~dòng 133)

**Interfaces:**
- Consumes: `usePushSubscription()`, `PUSH_STATE_COPY`, `readSoundPreference`, `writeSoundPreference`, `playAlertSound`, `isPushConfigured`.
- Produces: `export function PushSettings(): JSX.Element`.

- [ ] **Step 1: Viết component**

```tsx
'use client';

import { useState } from 'react';
import { playAlertSound, readSoundPreference, writeSoundPreference } from '../../lib/push/alert-sound';
import { isPushConfigured } from '../../lib/push/onesignal';
import { PUSH_STATE_COPY } from '../../lib/push/push-state';
import { usePushSubscription } from '../../lib/push/use-push-subscription';

/** Cuối dropdown chuông: bật/tắt push trình duyệt (OneSignal) + tiếng báo khi tab mở. */
export function PushSettings() {
  const { state, busy, enable, disable } = usePushSubscription();
  const [soundOn, setSoundOn] = useState(() => readSoundPreference());
  const copy = PUSH_STATE_COPY[state];
  const showPush = isPushConfigured() && state !== 'unsupported';

  function onToggleSound(next: boolean) {
    setSoundOn(next);
    writeSoundPreference(next);
    // Nghe thử ngay — cũng là thao tác người dùng giúp mở khoá âm thanh cho tab.
    if (next) playAlertSound();
  }

  return (
    <section
      aria-label="Cài đặt thông báo"
      className="space-y-3 border-t border-border bg-surface px-4 py-3 text-xs"
    >
      {showPush ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-ink">{copy.label}</p>
            {copy.hint ? <p className="mt-0.5 text-muted">{copy.hint}</p> : null}
          </div>
          {copy.action ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void (copy.action === 'enable' ? enable() : disable())}
              className={`shrink-0 rounded-md px-2.5 py-1 font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-fpt-blue disabled:opacity-50 ${
                copy.action === 'enable'
                  ? 'bg-fpt-blue text-white hover:bg-fpt-blue-700'
                  : 'border border-border text-ink hover:bg-fpt-orange-50'
              }`}
            >
              {busy ? 'Đang xử lý…' : copy.action === 'enable' ? 'Bật' : 'Tắt'}
            </button>
          ) : null}
        </div>
      ) : null}

      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block font-semibold text-ink">Âm thanh cảnh báo</span>
          <span className="block text-muted">Kêu khi có cảnh báo Cao/Khẩn cấp lúc tab đang mở.</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={soundOn}
          onChange={(event) => onToggleSound(event.target.checked)}
          className="h-4 w-4 shrink-0 accent-fpt-blue"
        />
      </label>
    </section>
  );
}
```

Trước khi dùng các class `bg-surface`, `bg-fpt-blue-700`, `accent-fpt-blue`, kiểm tra chúng có trong `apps/web/src/styles/tokens.css` (grep `--color-surface`, `--color-fpt-blue-700`, `--color-fpt-blue`); nếu thiếu, thay bằng token gần nhất đang có — không hardcode màu.

- [ ] **Step 2: Gắn vào Topbar**

Chạy `impact({target:"Topbar", direction:"upstream", repo:"Fcare"})`.

Trong `topbar.tsx`: `import { PushSettings } from './push-settings';` và thêm `<PushSettings />` ngay sau thẻ đóng `</ul>` của danh sách thông báo (vẫn trong div dropdown).

- [ ] **Step 3: Kiểm tra tĩnh**

Run: `pnpm --filter @fcare/web typecheck && pnpm --filter @fcare/web lint && pnpm --filter @fcare/web test` → sạch/PASS.

---

### Task 6: Xác minh tổng + trình duyệt

**Files:** không sửa code (chỉ sửa nếu phát hiện lỗi).

- [ ] **Step 1: Toàn repo**

Run: `pnpm typecheck && pnpm lint && pnpm test` → xanh. `pnpm build` CHỈ khi `lsof -i :3000` không có `next dev` đang chạy; nếu có, ghi rõ là bỏ qua build.

- [ ] **Step 2: Trình duyệt (dev đang chạy, đăng nhập admin)**

Dùng Playwright (MCP) hoặc script harness trong scratchpad:
1. Mở dropdown chuông → thấy khối "Cài đặt thông báo" với công tắc "Âm thanh cảnh báo" bật sẵn. Nếu `NEXT_PUBLIC_ONESIGNAL_APP_ID` có và origin trùng Site URL của app OneSignal → thấy "Bật thông báo trình duyệt".
2. Tắt công tắc âm thanh → `localStorage['fcare.alertSound'] === 'off'`; tải lại trang → vẫn tắt.
3. Giả lập âm thanh: trong console `window.AudioContext` được gọi khi `shouldPlayAlertSound({alertLevel:3}, true)`; kiểm chứng bằng cách spy `AudioContext.prototype.createOscillator` rồi gọi `playAlertSound()` (import qua module không khả dụng trong console → thay bằng: tạo cảnh báo cấp 3 thật qua UI/API khi API đã chạy code mới và quan sát spy).
4. Chụp màn hình dropdown ở 1440 và 375.

- [ ] **Step 3: Push thật (cần user)**

Sau khi user sửa env (`ONESIGNAL_APP_ID` cho API, `NEXT_PUBLIC_ONESIGNAL_APP_ID` cho web) và restart `pnpm dev`: bấm "Bật", cho phép quyền, đóng tab, tạo cảnh báo cấp 3 cho sinh viên có người nhận là tài khoản đó → popup hệ điều hành hiện đúng tiêu đề; bấm mở đúng trang. Trên OneSignal dashboard → Subscriptions thấy External ID = staff.id.

- [ ] **Step 4: Trước khi báo hoàn thành**

Chạy `detect_changes({repo:"Fcare"})` xác nhận chỉ các symbol/luồng dự kiến bị ảnh hưởng. Cập nhật memory `fcare-stack-decisions.md` (1 dòng: push cảnh báo cấp 3–4 qua OneSignal, external_id = staff.id, env tên gì). Không commit.
