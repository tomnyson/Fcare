# Module chat nội bộ (Trao đổi theo sinh viên) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép giảng viên, cán bộ CTSV và cán bộ đào tạo trao đổi với nhau về tình trạng một sinh viên, ngay trong hồ sơ sinh viên đó, mà không làm rò rỉ PII và không mở rộng phạm vi xem sinh viên.

**Architecture:** Mỗi sinh viên = một luồng trao đổi; không có bảng `Thread`, không có bảng `Participant` — `studentId` CHÍNH LÀ định danh luồng. Quyền đọc/ghi luồng đúng bằng `studentScope(user)`, không có cơ chế mời. Tin nhắn thu hồi mềm (`deletedAt`). Realtime tái dùng nguyên hạ tầng thông báo hiện có (`Notification` + `NotificationEventsService` + SSE `/notifications/stream`) — KHÔNG thêm endpoint SSE mới. Chặn PII bằng lớp thứ tư: `assertNoPii` chạy trên nội dung tin nhắn trước khi ghi.

**Tech Stack:** NestJS 11 · Prisma 6 (PostgreSQL) · CASL · Next.js 15 App Router · TanStack Query · Tailwind 4 (token CSS) · Jest (API) · Vitest (web)

**Spec:** `docs/superpowers/specs/2026-09-05-thong-ke-va-chat-noi-bo-design.md` — mục §4 (module chat), §5 (thứ tự triển khai), §6 (ngoài phạm vi)

## Global Constraints

Chép nguyên văn từ `CLAUDE.md` — vi phạm là lỗi CRITICAL, override mọi hướng dẫn khác:

1. **CẤM lưu/hiển thị** CCCD/CMND, số điện thoại, email, địa chỉ của sinh viên và nhân viên. KHÔNG thêm các cột/field này vào schema, DTO, UI hay file Excel.
2. **Scope sinh viên**: mọi query chạm sinh viên PHẢI đi qua `studentScope(user)` (`apps/api/src/common/utils/dept-scope.ts`). **LECTURER chỉ thấy sinh viên của lớp học phần mình đứng lớp**. **HEAD_OF_DEPT** thấy cả bộ môn mình + lớp mình dạy. Đã load bản ghi rồi mới kiểm tra: `isStudentInScope(prisma, user, studentId)` — KHÔNG so `departmentId` bằng tay.
3. **Excel I/O** chỉ dành cho HEAD_OF_DEPT, TRAINING_OFFICER, SA_OFFICER/SA_HEAD, ADMIN — LECTURER không bao giờ có quyền `import`/`export`. *(Module này không đụng Excel; giữ nguyên.)*
4. **Consent gate**: mọi endpoint mới đều nằm sau `ConsentGuard` mặc định — KHÔNG gắn `@Public` hay `@SkipConsent`.

Ràng buộc kiến trúc bắt buộc giữ:

- Guard chain: Throttler → Csrf → JwtAuth → Consent → Policies. Endpoint mutation phải chấp nhận header `X-Requested-With: XMLHttpRequest` (web `apiFetch` đã tự gắn).
- Response envelope `{ success, data, error }` cho mọi endpoint mới. Lỗi nghiệp vụ ném `HttpException` với `{ code, message }` — `HttpExceptionFilter` đưa `code` ra envelope.
- **Prisma pin v6** — KHÔNG nâng v7.
- **Realtime dùng SSE sẵn có** — KHÔNG thêm WebSocket, KHÔNG thêm endpoint SSE mới.
- Ngoài phạm vi (spec §6): chat 1-1 ngoài ngữ cảnh sinh viên · phòng chat theo bộ môn · đính kèm file · `@`mention · mời người ngoài scope vào luồng · áp `assertNoPii` lên `CareLog`/`Alert`/`Evaluation` (cần rà dữ liệu cũ trước).
- Trước khi báo hoàn thành: `pnpm typecheck && pnpm lint && pnpm test` xanh. **KHÔNG chạy `pnpm build` nếu cổng 3000 đang bận** (`lsof -ti :3000`). **KHÔNG commit khi user chưa yêu cầu** — mỗi task chỉ `git add` + `git commit` phần việc của mình theo đúng bước Commit trong task (đây là nhánh feature `feat/excel-import-admin-crud`, việc commit từng task là yêu cầu của quy trình SDD, không phải push/merge).
- Không hardcode màu: chỉ dùng token trong `apps/web/src/styles/tokens.css`. Token brand HỢP LỆ: `fpt-orange`, `fpt-orange-600`, `fpt-orange-50`, `fpt-blue`, `fpt-blue-700`, `fpt-blue-900`, `fpt-green`. **`fpt-orange-300` và `fpt-blue-600` KHÔNG tồn tại** — dùng sẽ lỗi thầm lặng.

---

## File Structure

**API — tạo mới**

| File | Trách nhiệm |
|---|---|
| `apps/api/src/common/utils/pii-text.ts` | `assertNoPii(text)` — lớp chặn PII thứ tư cho văn bản tự do |
| `apps/api/src/common/utils/pii-text.spec.ts` | Unit test: bắt đúng, và KHÔNG bắt nhầm mã SV/mã lớp/điểm |
| `apps/api/src/modules/discussions/dto/discussion.dto.ts` | `CreateMessageDto`, `ListMessagesQuery` |
| `apps/api/src/modules/discussions/discussions.service.ts` | Nghiệp vụ: scope gate → 404, gửi/thu hồi/đánh dấu đọc/đếm chưa đọc |
| `apps/api/src/modules/discussions/discussions.service.spec.ts` | Test scope, thu hồi, danh sách người nhận thông báo |
| `apps/api/src/modules/discussions/discussions.controller.ts` | 5 endpoint |
| `apps/api/src/modules/discussions/discussions.module.ts` | Đăng ký provider |

**API — sửa**

| File | Sửa gì |
|---|---|
| `apps/api/prisma/schema.prisma` | 2 model mới + `Notification.discussionMessageId` + back-relation ở `Student`/`Staff` |
| `apps/api/prisma/migrations/<ts>_add_discussions/migration.sql` | Migration tương ứng |
| `apps/api/src/casl/ability.factory.ts` | Thêm subject `'Discussion'` + quyền cho 5 role |
| `apps/api/src/modules/alerts/notification-dispatch.service.ts` | Thêm `NotificationSource` nhánh `discussion` |
| `apps/api/src/modules/alerts/notification-events.service.ts` | Thêm `discussionMessageId` vào payload sự kiện |
| `apps/api/src/app.module.ts` | Đăng ký `DiscussionsModule` |

**Web — tạo mới**

| File | Trách nhiệm |
|---|---|
| `apps/web/src/lib/discussion.ts` | Hàm thuần: gom tin theo ngày, đếm tin chưa đọc trong luồng |
| `apps/web/src/lib/discussion.test.ts` | Vitest cho hai hàm trên |
| `apps/web/src/components/students/discussion-tab.tsx` | Tab "Trao đổi" |
| `apps/web/e2e/discussion-flow.spec.ts` | E2E: gửi ở giảng viên → nhận ở CTSV, chặn PII, thu hồi |

**Web — sửa**

| File | Sửa gì |
|---|---|
| `apps/web/src/lib/types.ts` | `DiscussionMessage`, `DiscussionThreadMeta` |
| `apps/web/src/lib/use-notification-stream.ts` | Sự kiện mang `discussionMessageId` → invalidate `['discussions']` |
| `apps/web/src/app/(dashboard)/students/[id]/page.tsx` | Tab thứ 5 + đọc `?tab=` từ URL |

---

## Task 1: Schema + migration cho luồng trao đổi

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_discussions/migration.sql` (do `prisma migrate dev` sinh)

**Interfaces:**
- Consumes: model `Student`, `Staff`, `Notification` hiện có.
- Produces: model Prisma `DiscussionMessage { id, studentId, authorId, body, deletedAt, createdAt, student, author, notifications }`, `DiscussionRead { studentId, staffId, lastReadAt, student, staff }` (khóa chính ghép `[studentId, staffId]`), và trường `Notification.discussionMessageId: String?` với `@@unique([discussionMessageId, recipientId])`.

- [ ] **Bước 1: Thêm hai model vào cuối `apps/api/prisma/schema.prisma`**

```prisma
/// Một tin nhắn trong luồng trao đổi của MỘT sinh viên.
/// Không có bảng thread/participant: `studentId` chính là định danh luồng, và
/// quyền đọc luồng đúng bằng `studentScope(user)` (RULE 2) — không có cơ chế mời.
/// Khác `CareLog` (biên bản chăm sóc chính thức, một chiều, có outcome/nextAction):
/// đây là trao đổi nội bộ giữa cán bộ với nhau, KHÔNG phải hồ sơ chăm sóc.
model DiscussionMessage {
  id        String    @id @default(uuid())
  studentId String
  authorId  String
  body      String
  deletedAt DateTime? // thu hồi mềm: giữ vết, UI hiện "tin nhắn đã thu hồi"
  createdAt DateTime  @default(now())

  student       Student        @relation(fields: [studentId], references: [id], onDelete: Cascade)
  author        Staff          @relation(fields: [authorId], references: [id])
  notifications Notification[]

  @@index([studentId, createdAt])
  @@map("discussion_messages")
}

/// Mốc đã đọc của một cán bộ trong một luồng. Có hàng ở đây = đã tham gia luồng,
/// nên cũng là căn cứ xác định người nhận thông báo khi có tin mới.
model DiscussionRead {
  studentId  String
  staffId    String
  lastReadAt DateTime

  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  staff   Staff   @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@id([studentId, staffId])
  @@map("discussion_reads")
}
```

- [ ] **Bước 2: Thêm back-relation vào `model Student`**

Trong khối `model Student`, ngay dưới dòng `alerts       Alert[]`, thêm:

```prisma
  discussionMessages DiscussionMessage[]
  discussionReads    DiscussionRead[]
```

- [ ] **Bước 3: Thêm back-relation vào `model Staff`**

Trong khối `model Staff`, ngay dưới dòng `importBatches                ImportBatch[]`, thêm:

```prisma
  discussionMessages           DiscussionMessage[]
  discussionReads              DiscussionRead[]
```

- [ ] **Bước 4: Mở rộng `model Notification`**

Thêm trường `discussionMessageId` ngay sau `analysisVersionId`, thêm quan hệ ngay sau `analysisVersion`, và thêm một `@@unique` nữa. Kết quả khối `Notification` phải là:

```prisma
model Notification {
  id                  String    @id @default(uuid())
  recipientId         String
  alertId             String?
  analysisVersionId   String?
  discussionMessageId String?
  title               String
  body                String
  targetUrl           String?
  readAt              DateTime?
  createdAt           DateTime  @default(now())

  recipient         Staff                         @relation(fields: [recipientId], references: [id], onDelete: Cascade)
  alert             Alert?                        @relation(fields: [alertId], references: [id], onDelete: SetNull)
  analysisVersion   StudentTermAnalysisVersion?   @relation(fields: [analysisVersionId], references: [id], onDelete: SetNull)
  discussionMessage DiscussionMessage?            @relation(fields: [discussionMessageId], references: [id], onDelete: SetNull)
  analysisRecipient StudentTermAnalysisRecipient? @relation("AnalysisRecipientNotification")

  // Idempotency cho queue escalation: retry không tạo trùng thông báo cùng cảnh báo.
  @@unique([alertId, recipientId])
  @@unique([analysisVersionId, recipientId])
  @@unique([discussionMessageId, recipientId])
  @@index([recipientId, readAt])
  @@index([recipientId, createdAt(sort: Desc)])
  @@map("notifications")
}
```

- [ ] **Bước 5: Sinh migration + Prisma Client**

Bảo đảm Postgres đang chạy trước:

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
pnpm --filter @fcare/api db:migrate:dev --name add_discussions
```

Nếu (và chỉ nếu) không kết nối được database, sinh SQL thủ công rồi tạo thư mục migration bằng tay:

```bash
pnpm --filter @fcare/api exec prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --script > /tmp/add_discussions.sql
```

Sau đó bắt buộc chạy `pnpm --filter @fcare/api exec prisma generate` để typecheck thấy model mới.

- [ ] **Bước 6: Xác nhận migration hợp lệ**

Mở file `migration.sql` vừa sinh và kiểm tra đủ 4 thứ: `CREATE TABLE "discussion_messages"`, `CREATE TABLE "discussion_reads"`, `ALTER TABLE "notifications" ADD COLUMN "discussionMessageId"`, và `CREATE UNIQUE INDEX` cho `("discussionMessageId", "recipientId")`. Thiếu bất kỳ mục nào → schema chưa đúng, quay lại bước 1-4.

- [ ] **Bước 7: Typecheck**

Run: `pnpm --filter @fcare/api typecheck`
Expected: PASS (Prisma Client đã có `prisma.discussionMessage` và `prisma.discussionRead`)

- [ ] **Bước 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): schema luong trao doi theo sinh vien"
```

---

## Task 2: `assertNoPii` — lớp chặn PII thứ tư

**Files:**
- Create: `apps/api/src/common/utils/pii-text.ts`
- Test: `apps/api/src/common/utils/pii-text.spec.ts`

**Interfaces:**
- Consumes: `BadRequestException` của `@nestjs/common`.
- Produces:
  - `export function detectPii(text: string): string | null` — trả nhãn loại PII tìm thấy (`'số điện thoại'` | `'địa chỉ email'` | `'dãy số giống CCCD/CMND'`) hoặc `null`.
  - `export function assertNoPii(text: string): void` — ném `BadRequestException` với `{ code: 'PII_IN_MESSAGE', message }` khi phát hiện.
  - `export const PII_IN_MESSAGE = 'PII_IN_MESSAGE'`.

- [ ] **Bước 1: Viết test thất bại — `apps/api/src/common/utils/pii-text.spec.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import { assertNoPii, detectPii, PII_IN_MESSAGE } from './pii-text';

describe('detectPii — bắt đúng PII bị cấm (RULE 1)', () => {
  it.each([
    ['số điện thoại liền', 'Gọi cho phụ huynh 0912345678 nhé'],
    ['số điện thoại có dấu cách', 'SĐT: 0912 345 678'],
    ['số điện thoại có dấu chấm', 'liên hệ 091.234.5678'],
    ['số điện thoại có gạch', 'gọi 0912-345-678'],
    ['số điện thoại +84', 'Zalo +84 912 345 678'],
    ['email', 'gửi mail cho sv.nguyen@fpt.edu.vn'],
    ['CCCD 12 số', 'CCCD 001203004567 của em ấy'],
    ['CMND 9 số', 'CMND 123456789'],
  ])('chặn %s', (_label, text) => {
    expect(detectPii(text)).not.toBeNull();
  });
});

describe('detectPii — KHÔNG bắt nhầm dữ liệu học vụ hợp lệ', () => {
  it.each([
    ['mã sinh viên', 'Sinh viên HE160123 vắng nhiều buổi'],
    ['mã lớp hành chính', 'Lớp SE1901 kỳ SU25 điểm kém'],
    ['mã lớp học phần', 'Lớp học phần PRF192-SU25-01 cần theo sát'],
    ['danh sách điểm', 'Điểm quá trình: 8.5 9.0 7.5 6.0 8.0'],
    ['điểm và số buổi', 'Nghỉ 3 buổi, điểm 4.5, cần cảnh báo mức 2'],
    ['năm học', 'Từ 2024 đến 2026 em ấy học lại 2 môn'],
    ['tỷ lệ', 'Tỷ lệ qua môn 72.5% trong kỳ SU25'],
  ])('cho qua %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });
});

describe('assertNoPii', () => {
  it('nội dung sạch thì không ném lỗi', () => {
    expect(() => assertNoPii('Em này nghỉ nhiều, TBM xem giúp.')).not.toThrow();
  });

  it('ném BadRequest kèm mã nghiệp vụ PII_IN_MESSAGE', () => {
    try {
      assertNoPii('SĐT phụ huynh 0912345678');
      fail('assertNoPii phải ném lỗi');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        code: string;
        message: string;
      };
      expect(body.code).toBe(PII_IN_MESSAGE);
      expect(body.message).toContain('số điện thoại');
    }
  });
});
```

- [ ] **Bước 2: Chạy test để chắc chắn nó FAIL**

Run: `pnpm --filter @fcare/api test -- pii-text`
Expected: FAIL — `Cannot find module './pii-text'`

- [ ] **Bước 3: Viết `apps/api/src/common/utils/pii-text.ts`**

```ts
import { BadRequestException } from '@nestjs/common';

export const PII_IN_MESSAGE = 'PII_IN_MESSAGE';

/**
 * Lớp chặn PII thứ tư (RULE 1), dành cho văn bản tự do người dùng gõ — nơi ba
 * lớp kia (schema không có cột, PiiGuardInterceptor, Excel import) không với tới.
 *
 * Cố tình chấp nhận CHẶN NHẦM: một mã lớp toàn số dài 9-12 ký tự sẽ bị từ chối.
 * Chặn nhầm thì người dùng viết lại một câu; lọt PII thì vi phạm quy định. Vì
 * vậy thông báo lỗi phải nói rõ loại bị chặn để họ biết sửa chỗ nào.
 *
 * Ngược lại, KHÔNG được chặn nhầm dữ liệu học vụ thường gặp (mã SV, mã lớp,
 * danh sách điểm) — nên dãy số CCCD chỉ tính khi các chữ số LIỀN NHAU, và số
 * điện thoại chỉ tính khi các nhóm chữ số dài từ 2 ký tự trở lên.
 */

/** Ứng viên số điện thoại: 0/+84 rồi các nhóm 2-4 chữ số, ngăn bởi cách/chấm/gạch. */
const PHONE_CANDIDATE = /(?:\+84|0)[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4}){1,3}/g;
const EMAIL = /\S+@\S+\.\S+/;
/** CCCD/CMND: 9-12 chữ số LIỀN NHAU — "8.5 9.0 7.5" không rơi vào đây. */
const ID_NUMBER = /\d{9,12}/;

const PHONE_MIN_DIGITS = 10; // 0 + 9 số
const PHONE_MAX_DIGITS = 11; // 84 + 9 số

function hasPhone(text: string): boolean {
  for (const match of text.matchAll(PHONE_CANDIDATE)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS) {
      return true;
    }
  }
  return false;
}

/** Trả nhãn loại PII tìm thấy, hoặc null nếu nội dung sạch. */
export function detectPii(text: string): string | null {
  if (hasPhone(text)) {
    return 'số điện thoại';
  }
  if (EMAIL.test(text)) {
    return 'địa chỉ email';
  }
  if (ID_NUMBER.test(text)) {
    return 'dãy số giống CCCD/CMND';
  }
  return null;
}

/** Ném BadRequest kèm mã nghiệp vụ khi nội dung chứa PII bị cấm. */
export function assertNoPii(text: string): void {
  const found = detectPii(text);
  if (!found) {
    return;
  }
  throw new BadRequestException({
    code: PII_IN_MESSAGE,
    message:
      `Nội dung có vẻ chứa ${found}. Theo quy định bảo mật, hệ thống không lưu ` +
      'số điện thoại, email, CCCD/CMND hay địa chỉ. Vui lòng bỏ thông tin đó rồi gửi lại.',
  });
}
```

- [ ] **Bước 4: Chạy test để chắc chắn nó PASS**

Run: `pnpm --filter @fcare/api test -- pii-text`
Expected: PASS — toàn bộ 3 describe xanh.

- [ ] **Bước 5: Lint**

Run: `pnpm --filter @fcare/api lint`
Expected: PASS

- [ ] **Bước 6: Commit**

```bash
git add apps/api/src/common/utils/pii-text.ts apps/api/src/common/utils/pii-text.spec.ts
git commit -m "feat(api): assertNoPii chan PII trong van ban tu do"
```

---

## Task 3: Thông báo cho tin nhắn mới — mở rộng dispatch sẵn có

**Files:**
- Modify: `apps/api/src/modules/alerts/notification-events.service.ts`
- Modify: `apps/api/src/modules/alerts/notification-dispatch.service.ts`
- Test: `apps/api/src/modules/alerts/notification-dispatch.service.spec.ts` (bổ sung case)

**Interfaces:**
- Consumes: `NotificationDispatchService.deliver`, `NotificationEventsService.emit` hiện có; cột `Notification.discussionMessageId` từ Task 1.
- Produces:
  - `NotificationSource` có thêm nhánh `{ kind: 'discussion'; discussionMessageId: string; targetUrl: string }`.
  - `NotificationEvent['payload']` có thêm `discussionMessageId?: string | null`.
  - Không cần đổi module: `NotificationsModule` (`apps/api/src/modules/notifications/notifications.module.ts`) ĐÃ provide và export sẵn `NotificationDispatchService` — `DiscussionsModule` chỉ việc import module đó.

- [ ] **Bước 1: Viết test thất bại — thêm vào cuối `notification-dispatch.service.spec.ts`**

Thêm khối describe sau vào cuối file, giữ nguyên toàn bộ test đang có. File này đã có helper `makeService(notifications)` ở describe đầu tiên (dựng prisma mock + `NotificationEventsService` thật + spy `emit`) — helper đó nằm trong scope của describe cũ, nên khối mới tự dựng mock riêng như dưới đây:

```ts
describe('NotificationDispatchService — nguồn discussion', () => {
  it('ghi discussionMessageId + targetUrl và phát sự kiện kèm discussionMessageId', async () => {
    const createManyAndReturn = jest.fn().mockResolvedValue([
      {
        id: 'ntf-1',
        recipientId: 'staff-2',
        alertId: null,
        analysisVersionId: null,
        discussionMessageId: 'msg-1',
        targetUrl: '/students/sv-1?tab=discussion',
        title: 'Trao đổi mới',
        body: 'GV A: em này nghỉ nhiều',
        createdAt: new Date('2026-09-06T02:00:00Z'),
      },
    ]);
    const emit = jest.fn();
    const service = new NotificationDispatchService(
      { notification: { createManyAndReturn } } as unknown as PrismaService,
      { emit } as unknown as NotificationEventsService,
    );

    const delivered = await service.deliver({
      recipientIds: ['staff-2'],
      title: 'Trao đổi mới',
      body: 'GV A: em này nghỉ nhiều',
      source: {
        kind: 'discussion',
        discussionMessageId: 'msg-1',
        targetUrl: '/students/sv-1?tab=discussion',
      },
    });

    expect(delivered).toBe(1);
    const [args] = createManyAndReturn.mock.calls[0] as [
      { data: { discussionMessageId?: string; targetUrl?: string }[] },
    ];
    expect(args.data[0].discussionMessageId).toBe('msg-1');
    expect(args.data[0].targetUrl).toBe('/students/sv-1?tab=discussion');
    const [event] = emit.mock.calls[0] as [
      { payload: { discussionMessageId?: string | null } },
    ];
    expect(event.payload.discussionMessageId).toBe('msg-1');
  });
});
```

- [ ] **Bước 2: Chạy test để chắc chắn nó FAIL**

Run: `pnpm --filter @fcare/api test -- notification-dispatch`
Expected: FAIL — TypeScript từ chối `kind: 'discussion'`.

- [ ] **Bước 3: Mở rộng payload sự kiện trong `notification-events.service.ts`**

Trong `interface NotificationEvent`, thêm một trường vào `payload` ngay dưới `analysisVersionId`:

```ts
    discussionMessageId?: string | null;
```

- [ ] **Bước 4: Mở rộng `notification-dispatch.service.ts`**

Sửa `NotificationSource` thành:

```ts
export type NotificationSource =
  | { kind: 'alert'; alertId: string }
  | {
      kind: 'analysis';
      analysisVersionId: string;
      targetUrl: string;
    }
  | {
      kind: 'discussion';
      discussionMessageId: string;
      targetUrl: string;
    };
```

Trong `deliver`, thêm `discussionMessageId: true,` vào khối `select` của `createManyAndReturn` (ngay dưới `analysisVersionId: true,`), và thêm trường tương ứng khi `emit`:

```ts
          discussionMessageId: notification.discussionMessageId ?? null,
```

Sửa `buildRow` — nhánh `analysis` giữ nguyên, thêm nhánh `discussion` trước khi trả về:

```ts
    if (data.source.kind === 'discussion') {
      row.discussionMessageId = data.source.discussionMessageId;
      row.targetUrl = data.source.targetUrl;
      return row;
    }
    row.analysisVersionId = data.source.analysisVersionId;
    row.targetUrl = data.source.targetUrl;
    return row;
```

Sửa `describeDelivery` — thêm nhánh trước dòng `return` cuối:

```ts
    if (data.source.kind === 'discussion') {
      return `Đã gửi ${delivered}/${data.recipientIds.length} thông báo cho tin trao đổi ${data.source.discussionMessageId}`;
    }
```

- [ ] **Bước 5: Xác nhận provider đã sẵn sàng cho module khác dùng lại**

KHÔNG sửa module nào ở bước này. Chỉ kiểm tra rằng `NotificationsModule` đã export sẵn provider:

Run: `grep -n "NotificationDispatchService" apps/api/src/modules/notifications/notifications.module.ts`
Expected: tên này xuất hiện ở cả `providers` lẫn `exports`. Nếu đúng như vậy → không cần thay đổi gì; `DiscussionsModule` ở Task 4 sẽ `imports: [NotificationsModule]`.

- [ ] **Bước 6: Chạy test để chắc chắn nó PASS**

Run: `pnpm --filter @fcare/api test -- notification-dispatch notification-events`
Expected: PASS — cả test cũ lẫn test mới xanh.

- [ ] **Bước 7: Commit**

```bash
git add apps/api/src/modules/alerts
git commit -m "feat(api): dispatch thong bao cho tin trao doi"
```

---

## Task 4: `DiscussionsService` + controller + CASL

**Files:**
- Create: `apps/api/src/modules/discussions/dto/discussion.dto.ts`
- Create: `apps/api/src/modules/discussions/discussions.service.ts`
- Create: `apps/api/src/modules/discussions/discussions.controller.ts`
- Create: `apps/api/src/modules/discussions/discussions.module.ts`
- Test: `apps/api/src/modules/discussions/discussions.service.spec.ts`
- Modify: `apps/api/src/casl/ability.factory.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `assertNoPii` (Task 2); `NotificationSource` nhánh `discussion` (Task 3); `NotificationDispatchService` qua `NotificationsModule`; `studentScope(user)` từ `apps/api/src/common/utils/dept-scope.ts`; model Prisma từ Task 1.
- Produces:
  - `DiscussionsService.list(user, studentId, query): Promise<{ messages: DiscussionMessageView[]; lastReadAt: Date | null }>` — `messages` tăng dần theo `createdAt`; `lastReadAt` là mốc đã đọc của chính người gọi (null nếu chưa từng mở luồng), để web vẽ badge chưa đọc trên nhãn tab.
  - `DiscussionsService.create(user, studentId, dto): Promise<DiscussionMessageView>`
  - `DiscussionsService.remove(user, messageId): Promise<DiscussionMessageView>`
  - `DiscussionsService.markRead(user, studentId): Promise<{ lastReadAt: Date }>`
  - `DiscussionsService.unreadCount(user): Promise<{ count: number }>`
  - `DiscussionMessageView = { id, body, deletedAt, createdAt, author: { id, staffCode, fullName } | null }`
  - Subject CASL `'Discussion'`.
- Web (Task 6) dựa vào đúng các hình dạng JSON này.

- [ ] **Bước 1: Viết test thất bại — `apps/api/src/modules/discussions/discussions.service.spec.ts`**

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationDispatchService } from '../alerts/notification-dispatch.service';
import { DiscussionsService } from './discussions.service';

const lecturer: AuthUser = {
  id: 'gv-1',
  staffCode: 'GV1',
  fullName: 'Giảng viên 1',
  roles: ['LECTURER'],
  departmentId: 'dept-se',
  consented: true,
  mustChangePassword: false,
};

/** Sinh viên ngoài phạm vi → `findFirst` không trả gì. */
function outOfScopePrisma() {
  return {
    student: { findFirst: jest.fn().mockResolvedValue(null) },
    discussionMessage: { findMany: jest.fn(), create: jest.fn() },
    discussionRead: { upsert: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  } as unknown as PrismaService;
}

const noopDispatch = { deliver: jest.fn() } as unknown as NotificationDispatchService;

describe('DiscussionsService — RULE 2: ngoài phạm vi trả 404, không bao giờ 403', () => {
  it('đọc luồng của sinh viên ngoài phạm vi → NotFound', async () => {
    const service = new DiscussionsService(outOfScopePrisma(), noopDispatch);
    await expect(service.list(lecturer, 'sv-la', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('gửi tin vào luồng ngoài phạm vi → NotFound', async () => {
    const prisma = outOfScopePrisma();
    const service = new DiscussionsService(prisma, noopDispatch);
    await expect(
      service.create(lecturer, 'sv-la', { body: 'thử xem' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.discussionMessage.create).not.toHaveBeenCalled();
  });

  it('đánh dấu đã đọc luồng ngoài phạm vi → NotFound', async () => {
    const prisma = outOfScopePrisma();
    const service = new DiscussionsService(prisma, noopDispatch);
    await expect(service.markRead(lecturer, 'sv-la')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.discussionRead.upsert).not.toHaveBeenCalled();
  });
});

describe('DiscussionsService.remove — chỉ tác giả được thu hồi', () => {
  function prismaWithMessage(authorId: string) {
    return {
      discussionMessage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'msg-1',
          studentId: 'sv-1',
          authorId,
          deletedAt: null,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'msg-1',
          body: 'x',
          deletedAt: new Date(),
          createdAt: new Date(),
          author: { id: authorId, staffCode: 'GV1', fullName: 'Giảng viên 1' },
        }),
      },
      student: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sv-1', studentCode: 'HE1' }),
      },
    } as unknown as PrismaService;
  }

  it('tin của người khác → Forbidden, không update', async () => {
    const prisma = prismaWithMessage('gv-khac');
    const service = new DiscussionsService(prisma, noopDispatch);
    await expect(service.remove(lecturer, 'msg-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.discussionMessage.update).not.toHaveBeenCalled();
  });

  it('tin của chính mình → đặt deletedAt', async () => {
    const prisma = prismaWithMessage('gv-1');
    const service = new DiscussionsService(prisma, noopDispatch);
    const result = await service.remove(lecturer, 'msg-1');
    expect(result.deletedAt).not.toBeNull();
    expect(prisma.discussionMessage.update).toHaveBeenCalled();
  });
});

describe('DiscussionsService.create — danh sách người nhận thông báo', () => {
  it('gồm người đã gửi tin + người đã đọc luồng, KHÔNG gồm người gửi', async () => {
    const deliver = jest.fn().mockResolvedValue(1);
    const prisma = {
      student: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'sv-1', studentCode: 'HE160123', fullName: 'Nguyễn A' }),
      },
      discussionMessage: {
        create: jest.fn().mockResolvedValue({
          id: 'msg-9',
          body: 'em này nghỉ nhiều',
          deletedAt: null,
          createdAt: new Date(),
          author: { id: 'gv-1', staffCode: 'GV1', fullName: 'Giảng viên 1' },
        }),
        // gv-1 (chính người gửi) đã bị loại bằng điều kiện where authorId != gv-1
        findMany: jest.fn().mockResolvedValue([{ authorId: 'gv-2' }]),
      },
      discussionRead: {
        findMany: jest.fn().mockResolvedValue([
          { staffId: 'gv-2' }, // trùng với người đã gửi tin → phải khử trùng
          { staffId: 'ctsv-1' },
        ]),
      },
    } as unknown as PrismaService;

    const service = new DiscussionsService(prisma, {
      deliver,
    } as unknown as NotificationDispatchService);

    await service.create(lecturer, 'sv-1', { body: 'em này nghỉ nhiều' });

    const [payload] = deliver.mock.calls[0] as [
      { recipientIds: string[]; source: { kind: string; targetUrl: string } },
    ];
    expect([...payload.recipientIds].sort()).toEqual(['ctsv-1', 'gv-2']);
    expect(payload.recipientIds).not.toContain('gv-1');
    expect(payload.source.kind).toBe('discussion');
    expect(payload.source.targetUrl).toBe('/students/sv-1?tab=discussion');
  });

  it('nội dung chứa số điện thoại → chặn trước khi ghi DB', async () => {
    const prisma = {
      student: { findFirst: jest.fn().mockResolvedValue({ id: 'sv-1', studentCode: 'HE1' }) },
      discussionMessage: { create: jest.fn() },
    } as unknown as PrismaService;
    const service = new DiscussionsService(prisma, noopDispatch);

    await expect(
      service.create(lecturer, 'sv-1', { body: 'gọi phụ huynh 0912345678' }),
    ).rejects.toThrow();
    expect(prisma.discussionMessage.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Bước 2: Chạy test để chắc chắn nó FAIL**

Run: `pnpm --filter @fcare/api test -- discussions`
Expected: FAIL — `Cannot find module './discussions.service'`

- [ ] **Bước 3: Viết DTO — `apps/api/src/modules/discussions/dto/discussion.dto.ts`**

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({ description: 'Nội dung trao đổi (không được chứa PII)' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung trao đổi không được để trống.' })
  @MaxLength(2000, { message: 'Nội dung trao đổi tối đa 2000 ký tự.' })
  body!: string;
}

export class ListMessagesQuery {
  @ApiPropertyOptional({
    description: 'Con trỏ cuộn ngược: chỉ lấy tin tạo TRƯỚC mốc ISO này',
  })
  @IsOptional()
  @IsISO8601()
  before?: string;

  @ApiPropertyOptional({ description: 'Số tin mỗi trang (mặc định 30, tối đa 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
```

- [ ] **Bước 4: Viết service — `apps/api/src/modules/discussions/discussions.service.ts`**

```ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { studentScope } from '../../common/utils/dept-scope';
import { assertNoPii } from '../../common/utils/pii-text';
import type { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDispatchService } from '../alerts/notification-dispatch.service';
import type { CreateMessageDto, ListMessagesQuery } from './dto/discussion.dto';

const DEFAULT_LIMIT = 30;
const NOTIFICATION_BODY_LIMIT = 120;

/** Người gửi hiện lên trong danh sách; chỉ mã + tên, tuyệt đối không PII (RULE 1). */
const AUTHOR_SELECT = {
  select: { id: true, staffCode: true, fullName: true },
} as const;

const MESSAGE_SELECT = {
  id: true,
  body: true,
  deletedAt: true,
  createdAt: true,
  author: AUTHOR_SELECT,
} as const;

/**
 * Luồng trao đổi nội bộ về MỘT sinh viên.
 *
 * Không có bảng thread/participant: `studentId` là định danh luồng, và cửa thật
 * không phải CASL mà là phạm vi — mọi thao tác đều đi qua `studentScope(user)`
 * trước. Ngoài phạm vi luôn trả 404 (không bao giờ 403): 403 sẽ xác nhận sinh
 * viên đó tồn tại, chính là thứ RULE 2 muốn giấu.
 */
@Injectable()
export class DiscussionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationDispatchService,
  ) {}

  /** Cửa phạm vi dùng chung; trả về sinh viên để dựng nội dung thông báo. */
  private async requireStudent(user: AuthUser, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ...studentScope(user) },
      select: { id: true, studentCode: true, fullName: true },
    });
    if (!student) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong phạm vi quản lý của bạn.',
      );
    }
    return student;
  }

  /**
   * Trang tin, cuộn ngược theo `before`, nhưng trả về TĂNG DẦN cho UI hội thoại.
   * Kèm mốc đã đọc của người gọi để web đếm được tin chưa đọc mà không cần
   * thêm một lượt gọi API nữa.
   */
  async list(user: AuthUser, studentId: string, query: ListMessagesQuery) {
    await this.requireStudent(user, studentId);
    const [rows, read] = await Promise.all([
      this.prisma.discussionMessage.findMany({
        where: {
          studentId,
          ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? DEFAULT_LIMIT,
        select: MESSAGE_SELECT,
      }),
      this.prisma.discussionRead.findUnique({
        where: { studentId_staffId: { studentId, staffId: user.id } },
        select: { lastReadAt: true },
      }),
    ]);
    return { messages: rows.reverse(), lastReadAt: read?.lastReadAt ?? null };
  }

  async create(user: AuthUser, studentId: string, dto: CreateMessageDto) {
    const student = await this.requireStudent(user, studentId);
    assertNoPii(dto.body);

    const message = await this.prisma.discussionMessage.create({
      data: { studentId, authorId: user.id, body: dto.body },
      select: MESSAGE_SELECT,
    });

    const recipientIds = await this.participantsExcept(studentId, user.id);
    if (recipientIds.length > 0) {
      await this.notifications.deliver({
        recipientIds,
        title: `Trao đổi mới về SV ${student.studentCode}`,
        body: `${user.fullName}: ${this.preview(dto.body)}`,
        source: {
          kind: 'discussion',
          discussionMessageId: message.id,
          targetUrl: `/students/${studentId}?tab=discussion`,
        },
      });
    }
    return message;
  }

  /** Thu hồi mềm. Chỉ tác giả — kể cả ADMIN cũng không sửa lời người khác. */
  async remove(user: AuthUser, messageId: string) {
    const message = await this.prisma.discussionMessage.findUnique({
      where: { id: messageId },
      select: { id: true, studentId: true, authorId: true, deletedAt: true },
    });
    if (!message) {
      throw new NotFoundException('Không tìm thấy tin nhắn.');
    }
    // Kiểm tra phạm vi TRƯỚC khi lộ ra rằng tin nhắn này của người khác.
    await this.requireStudent(user, message.studentId);
    if (message.authorId !== user.id) {
      throw new ForbiddenException('Chỉ tác giả mới thu hồi được tin nhắn này.');
    }
    return this.prisma.discussionMessage.update({
      where: { id: messageId },
      data: { deletedAt: message.deletedAt ?? new Date() },
      select: MESSAGE_SELECT,
    });
  }

  async markRead(user: AuthUser, studentId: string) {
    await this.requireStudent(user, studentId);
    const lastReadAt = new Date();
    await this.prisma.discussionRead.upsert({
      where: { studentId_staffId: { studentId, staffId: user.id } },
      create: { studentId, staffId: user.id, lastReadAt },
      update: { lastReadAt },
    });
    return { lastReadAt };
  }

  /**
   * Số LUỒNG đang có tin chưa đọc — chỉ tính luồng người này đã tham gia
   * (có mốc đã đọc), khớp với quy tắc người nhận thông báo ở §4.6 của spec.
   */
  async unreadCount(user: AuthUser) {
    const reads = await this.prisma.discussionRead.findMany({
      where: { staffId: user.id },
      select: { studentId: true, lastReadAt: true },
    });
    if (reads.length === 0) {
      return { count: 0 };
    }
    const threads = await this.prisma.discussionMessage.groupBy({
      by: ['studentId'],
      where: {
        deletedAt: null,
        authorId: { not: user.id },
        OR: reads.map((read) => ({
          studentId: read.studentId,
          createdAt: { gt: read.lastReadAt },
        })),
      },
      _count: { _all: true },
    });
    return { count: threads.length };
  }

  /**
   * Người nhận thông báo = người đã tham gia luồng (từng gửi tin chưa thu hồi,
   * hoặc đã mở luồng), trừ chính người gửi. Người trong phạm vi nhưng chưa bao
   * giờ mở luồng thì KHÔNG nhận — nếu không, mỗi tin sẽ dội cho cả phòng CTSV.
   */
  private async participantsExcept(
    studentId: string,
    authorId: string,
  ): Promise<string[]> {
    const [authors, readers] = await Promise.all([
      this.prisma.discussionMessage.findMany({
        where: { studentId, deletedAt: null, authorId: { not: authorId } },
        distinct: ['authorId'],
        select: { authorId: true },
      }),
      this.prisma.discussionRead.findMany({
        where: { studentId, staffId: { not: authorId } },
        select: { staffId: true },
      }),
    ]);
    return [
      ...new Set([
        ...authors.map((row) => row.authorId),
        ...readers.map((row) => row.staffId),
      ]),
    ];
  }

  private preview(body: string): string {
    return body.length > NOTIFICATION_BODY_LIMIT
      ? `${body.slice(0, NOTIFICATION_BODY_LIMIT)}…`
      : body;
  }
}
```

- [ ] **Bước 5: Viết controller — `apps/api/src/modules/discussions/discussions.controller.ts`**

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { DiscussionsService } from './discussions.service';
import { CreateMessageDto, ListMessagesQuery } from './dto/discussion.dto';

/**
 * CASL chỉ là cửa ngoài (role nào được dùng tính năng); cửa thật là phạm vi
 * sinh viên, do service kiểm — xem `DiscussionsService.requireStudent`.
 */
@ApiTags('discussions')
@Controller('discussions')
@CheckPolicies((ability: AppAbility) => ability.can('read', 'Discussion'))
export class DiscussionsController {
  constructor(private readonly discussions: DiscussionsService) {}

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.discussions.unreadCount(user);
  }

  @Get(':studentId/messages')
  list(
    @CurrentUser() user: AuthUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: ListMessagesQuery,
  ) {
    return this.discussions.list(user, studentId, query);
  }

  @Post(':studentId/messages')
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Discussion'))
  create(
    @CurrentUser() user: AuthUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.discussions.create(user, studentId, dto);
  }

  @Post(':studentId/read')
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.discussions.markRead(user, studentId);
  }

  @Delete('messages/:id')
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Discussion'))
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discussions.remove(user, id);
  }
}
```

- [ ] **Bước 6: Viết module — `apps/api/src/modules/discussions/discussions.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DiscussionsController } from './discussions.controller';
import { DiscussionsService } from './discussions.service';

// `NotificationDispatchService` do `NotificationsModule` provide và export sẵn —
// import module đó thay vì khai báo lại provider (tránh hai thực thể khác nhau).
@Module({
  imports: [NotificationsModule],
  controllers: [DiscussionsController],
  providers: [DiscussionsService],
})
export class DiscussionsModule {}
```

- [ ] **Bước 7: Thêm subject `'Discussion'` vào `apps/api/src/casl/ability.factory.ts`**

Thêm `'Discussion'` vào union `Subjects` (đặt ngay sau `'CareLog'`):

```ts
export type Subjects =
  | 'Student'
  | 'Evaluation'
  | 'CareLog'
  | 'Discussion'
  | 'Alert'
  | 'Notification'
  | 'MasterData'
  | 'Staff'
  | 'Statistics'
  | 'Excel'
  | 'all';
```

Rồi cấp quyền cho **năm** role không phải ADMIN — `HEAD_OF_DEPT`, `LECTURER`, `TRAINING_OFFICER`, `SA_OFFICER`, `SA_HEAD`. Trong mỗi khối role đó, thêm đúng một dòng:

```ts
    can(['read', 'create'], 'Discussion');
```

Giảng viên CÓ quyền này — đó chính là nhu cầu gốc của tính năng. `ADMIN` đã có `can('manage', 'all')` nên không cần thêm gì.

- [ ] **Bước 8: Đăng ký module trong `apps/api/src/app.module.ts`**

Thêm `import { DiscussionsModule } from './modules/discussions/discussions.module';` vào khối import, và thêm `DiscussionsModule,` vào mảng `imports` — đặt ngay sau `CareLogsModule,`.

- [ ] **Bước 9: Chạy test để chắc chắn nó PASS**

Run: `pnpm --filter @fcare/api test -- discussions`
Expected: PASS — cả 7 test.

- [ ] **Bước 10: Typecheck + lint + toàn bộ test API**

Run: `pnpm --filter @fcare/api typecheck && pnpm --filter @fcare/api lint && pnpm --filter @fcare/api test`
Expected: PASS, không có test cũ nào đỏ.

- [ ] **Bước 11: Commit**

```bash
git add apps/api/src/modules/discussions apps/api/src/casl/ability.factory.ts apps/api/src/app.module.ts
git commit -m "feat(api): endpoint trao doi noi bo theo sinh vien"
```

---

## Task 5: Hàm thuần phía web cho luồng trao đổi

**Files:**
- Create: `apps/web/src/lib/discussion.ts`
- Test: `apps/web/src/lib/discussion.test.ts`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/hooks.ts`

**Interfaces:**
- Consumes: hình dạng JSON `DiscussionMessageView` do Task 4 trả về.
- Produces:
  - `export interface DiscussionMessage { id: string; body: string; deletedAt: string | null; createdAt: string; author: { id: string; staffCode: string; fullName: string } | null }` và `export interface DiscussionThread { messages: DiscussionMessage[]; lastReadAt: string | null }` (trong `lib/types.ts`)
  - `export function useDiscussion(studentId: string)` trong `lib/hooks.ts` — một queryKey dùng chung cho cả trang (vẽ badge) lẫn tab (vẽ hội thoại)
  - `export interface DiscussionDayGroup { day: string; label: string; messages: DiscussionMessage[] }`
  - `export function groupMessagesByDay(messages: DiscussionMessage[]): DiscussionDayGroup[]`
  - `export function countUnread(messages: DiscussionMessage[], lastReadAt: string | null, currentStaffId: string): number`

- [ ] **Bước 1: Thêm kiểu vào `apps/web/src/lib/types.ts`**

Thêm vào cuối file:

```ts
/** Tin trong luồng trao đổi nội bộ về một sinh viên. `author` null khi tài khoản đã bị xóa. */
export interface DiscussionMessage {
  id: string;
  body: string;
  deletedAt: string | null;
  createdAt: string;
  author: { id: string; staffCode: string; fullName: string } | null;
}

/** Một trang của luồng, kèm mốc đã đọc của chính người đang xem. */
export interface DiscussionThread {
  messages: DiscussionMessage[];
  lastReadAt: string | null;
}
```

- [ ] **Bước 2: Viết test thất bại — `apps/web/src/lib/discussion.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { countUnread, groupMessagesByDay } from './discussion';
import type { DiscussionMessage } from './types';

function message(
  id: string,
  createdAt: string,
  authorId = 'gv-2',
  deletedAt: string | null = null,
): DiscussionMessage {
  return {
    id,
    body: `noi dung ${id}`,
    deletedAt,
    createdAt,
    author: { id: authorId, staffCode: 'GV2', fullName: 'Giảng viên 2' },
  };
}

describe('groupMessagesByDay', () => {
  it('gom các tin cùng ngày vào một nhóm, giữ thứ tự tăng dần', () => {
    const groups = groupMessagesByDay([
      message('a', '2026-09-01T01:00:00.000Z'),
      message('b', '2026-09-01T09:00:00.000Z'),
      message('c', '2026-09-02T02:00:00.000Z'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].messages.map((m) => m.id)).toEqual(['a', 'b']);
    expect(groups[1].messages.map((m) => m.id)).toEqual(['c']);
    expect(groups[0].label).toBeTruthy();
  });

  it('danh sách rỗng trả mảng rỗng', () => {
    expect(groupMessagesByDay([])).toEqual([]);
  });
});

describe('countUnread', () => {
  const messages = [
    message('a', '2026-09-01T01:00:00.000Z', 'gv-2'),
    message('b', '2026-09-01T03:00:00.000Z', 'gv-1'), // của chính mình
    message('c', '2026-09-01T05:00:00.000Z', 'gv-2'),
    message('d', '2026-09-01T06:00:00.000Z', 'gv-2', '2026-09-01T07:00:00.000Z'), // đã thu hồi
  ];

  it('chỉ đếm tin của người khác, chưa thu hồi, sau mốc đã đọc', () => {
    expect(countUnread(messages, '2026-09-01T02:00:00.000Z', 'gv-1')).toBe(1);
  });

  it('chưa từng đọc thì đếm mọi tin của người khác chưa thu hồi', () => {
    expect(countUnread(messages, null, 'gv-1')).toBe(2);
  });

  it('đã đọc tới sau tin cuối thì bằng 0', () => {
    expect(countUnread(messages, '2026-09-02T00:00:00.000Z', 'gv-1')).toBe(0);
  });
});
```

- [ ] **Bước 3: Chạy test để chắc chắn nó FAIL**

Run: `pnpm --filter @fcare/web test -- discussion`
Expected: FAIL — không tìm thấy `./discussion`

- [ ] **Bước 4: Viết `apps/web/src/lib/discussion.ts`**

```ts
import type { DiscussionMessage } from './types';

export interface DiscussionDayGroup {
  /** Khóa ngày dạng YYYY-MM-DD, dùng làm React key. */
  day: string;
  /** Nhãn hiển thị trên vạch ngăn ngày. */
  label: string;
  messages: DiscussionMessage[];
}

const DAY_LABEL = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function dayKey(iso: string): string {
  const date = new Date(iso);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Gom tin theo ngày (giờ địa phương) để chèn vạch ngăn ngày trong hội thoại.
 * Giữ nguyên thứ tự đầu vào — API đã trả tăng dần theo thời gian.
 */
export function groupMessagesByDay(
  messages: DiscussionMessage[],
): DiscussionDayGroup[] {
  return messages.reduce<DiscussionDayGroup[]>((groups, message) => {
    const day = dayKey(message.createdAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) {
      return [
        ...groups.slice(0, -1),
        { ...last, messages: [...last.messages, message] },
      ];
    }
    return [
      ...groups,
      { day, label: DAY_LABEL.format(new Date(message.createdAt)), messages: [message] },
    ];
  }, []);
}

/**
 * Số tin chưa đọc trong luồng: của người khác, chưa thu hồi, tạo sau mốc đã đọc.
 * `lastReadAt` null = chưa từng mở luồng.
 */
export function countUnread(
  messages: DiscussionMessage[],
  lastReadAt: string | null,
  currentStaffId: string,
): number {
  const readAt = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  return messages.filter(
    (message) =>
      message.deletedAt === null &&
      message.author?.id !== currentStaffId &&
      new Date(message.createdAt).getTime() > readAt,
  ).length;
}
```

- [ ] **Bước 5: Chạy test để chắc chắn nó PASS**

Run: `pnpm --filter @fcare/web test -- discussion`
Expected: PASS — 5 test.

- [ ] **Bước 6: Thêm hook `useDiscussion` vào `apps/web/src/lib/hooks.ts`**

Thêm `DiscussionThread` vào import kiểu sẵn có ở đầu file:

```ts
import type { AuthUser, DiscussionThread, Notification } from './types';
```

Thêm vào cuối file:

```ts
/**
 * Một luồng trao đổi. Cả trang hồ sơ (vẽ badge chưa đọc trên nhãn tab) lẫn
 * `DiscussionTab` (vẽ hội thoại) dùng chung queryKey này, nên TanStack Query
 * gộp thành một lượt gọi — badge phải hiện được TRƯỚC khi người dùng mở tab,
 * mà tab thì chỉ mount khi đã mở.
 */
export function useDiscussion(studentId: string) {
  return useQuery({
    queryKey: ['discussions', studentId],
    queryFn: () => apiFetch<DiscussionThread>(`/discussions/${studentId}/messages`),
  });
}
```

- [ ] **Bước 7: Typecheck web**

Run: `pnpm --filter @fcare/web typecheck`
Expected: PASS

- [ ] **Bước 8: Commit**

```bash
git add apps/web/src/lib/discussion.ts apps/web/src/lib/discussion.test.ts \
  apps/web/src/lib/types.ts apps/web/src/lib/hooks.ts
git commit -m "feat(web): ham gom tin va dem chua doc cho luong trao doi"
```

---

## Task 6: Tab "Trao đổi" trong hồ sơ sinh viên

**Files:**
- Create: `apps/web/src/components/students/discussion-tab.tsx`
- Modify: `apps/web/src/app/(dashboard)/students/[id]/page.tsx`
- Modify: `apps/web/src/lib/use-notification-stream.ts`

**Interfaces:**
- Consumes: `groupMessagesByDay`, `countUnread`, `DiscussionMessage`, `useDiscussion` (Task 5); endpoint `GET/POST /discussions/:studentId/messages`, `POST /discussions/:studentId/read`, `DELETE /discussions/messages/:id` (Task 4); `useMe()` từ `apps/web/src/lib/hooks.ts`; `apiFetch`, `ApiError` từ `apps/web/src/lib/api.ts`.
- Produces: `export function DiscussionTab({ studentId, currentStaffId }: { studentId: string; currentStaffId: string })`.

- [ ] **Bước 1: Viết `apps/web/src/components/students/discussion-tab.tsx`**

```tsx
'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { groupMessagesByDay } from '../../lib/discussion';
import { useDiscussion } from '../../lib/hooks';
import { formatDateTime } from '../../lib/labels';
import type { DiscussionMessage } from '../../lib/types';
import { FormError, Textarea } from '../ui/form';

/**
 * Luồng trao đổi nội bộ về một sinh viên: giảng viên ↔ giảng viên ↔ CTSV ↔ đào tạo.
 * Đây KHÔNG phải nhật ký chăm sóc (tab bên cạnh) — nội dung ở đây là trao đổi
 * giữa cán bộ với nhau, không phải biên bản làm việc với sinh viên.
 */
export function DiscussionTab({
  studentId,
  currentStaffId,
}: {
  studentId: string;
  currentStaffId: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const thread = useDiscussion(studentId);

  // Mở tab là đã đọc: đánh dấu một lần, rồi làm mới để badge trên nhãn tab về 0.
  useEffect(() => {
    void apiFetch(`/discussions/${studentId}/read`, { method: 'POST' })
      .then(() => queryClient.invalidateQueries({ queryKey: ['discussions'] }))
      .catch(() => undefined);
  }, [studentId, queryClient]);

  const send = useMutation({
    mutationFn: (body: string) =>
      apiFetch<DiscussionMessage>(`/discussions/${studentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: async () => {
      setDraft('');
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['discussions', studentId] });
    },
    // Giữ nguyên nội dung đã gõ khi bị chặn PII — người dùng chỉ cần sửa, không phải gõ lại.
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Không gửi được tin nhắn.'),
  });

  const recall = useMutation({
    mutationFn: (id: string) =>
      apiFetch<DiscussionMessage>(`/discussions/messages/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['discussions', studentId] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Không thu hồi được tin nhắn.'),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      return;
    }
    send.mutate(body);
  }

  if (thread.isError) {
    return (
      <FormError>
        {thread.error instanceof ApiError
          ? thread.error.message
          : 'Không tải được luồng trao đổi.'}
      </FormError>
    );
  }

  const groups = groupMessagesByDay(thread.data?.messages ?? []);

  return (
    <section aria-label="Luồng trao đổi nội bộ">
      <div className="mb-4 max-h-[28rem] space-y-6 overflow-y-auto rounded-[var(--radius-card)] border border-border bg-surface p-5">
        {thread.isLoading ? (
          <p className="text-center text-sm text-muted">Đang tải trao đổi…</p>
        ) : null}

        {!thread.isLoading && groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Chưa có trao đổi nào về sinh viên này. Nêu một quan sát cụ thể để đồng nghiệp
            cùng theo dõi.
          </p>
        ) : null}

        {groups.map((group) => (
          <div key={group.day} className="space-y-3">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted">
              {group.label}
            </p>
            {group.messages.map((message) => {
              const mine = message.author?.id === currentStaffId;
              return (
                <article
                  key={message.id}
                  className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                >
                  <p className="mb-1 text-xs text-muted">
                    <span className="font-semibold text-ink">
                      {message.author?.fullName ?? 'Tài khoản đã gỡ'}
                    </span>
                    {message.author ? ` · ${message.author.staffCode}` : ''}
                    {' · '}
                    {formatDateTime(message.createdAt)}
                  </p>
                  <div
                    className={`max-w-[85%] rounded-[var(--radius-card)] px-4 py-2.5 text-sm ${
                      message.deletedAt
                        ? 'border border-dashed border-border bg-surface text-muted italic'
                        : mine
                          ? 'bg-fpt-blue text-white'
                          : 'border border-border bg-surface-raised text-ink'
                    }`}
                  >
                    {message.deletedAt ? 'Tin nhắn đã thu hồi' : message.body}
                  </div>
                  {mine && !message.deletedAt ? (
                    <button
                      type="button"
                      onClick={() => recall.mutate(message.id)}
                      disabled={recall.isPending}
                      className="mt-1 text-xs text-muted underline-offset-2 transition-colors duration-[var(--duration-fast)] hover:text-danger hover:underline"
                    >
                      Thu hồi
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <FormError>{error}</FormError>
        <Textarea
          aria-label="Nội dung trao đổi"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          placeholder="Trao đổi với đồng nghiệp về tình trạng học tập của sinh viên…"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Không ghi số điện thoại, email, CCCD/CMND hay địa chỉ — hệ thống sẽ từ chối.
          </p>
          <Button type="submit" disabled={send.isPending || draft.trim().length === 0}>
            {send.isPending ? 'Đang gửi…' : 'Gửi'}
          </Button>
        </div>
      </form>
    </section>
  );
}
```

- [ ] **Bước 2: Gắn tab thứ 5 vào `apps/web/src/app/(dashboard)/students/[id]/page.tsx`**

Thêm import (giữ thứ tự alphabet của khối import component):

```tsx
import { DiscussionTab } from '../../../../components/students/discussion-tab';
```

Thêm `useSearchParams` vào import từ `next/navigation` và `Suspense` vào import từ `react`:

```tsx
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
```

Mở rộng `TABS`:

```tsx
const TABS = [
  { key: 'enrollments', label: 'Học phần & điểm' },
  { key: 'evaluations', label: 'Đánh giá' },
  { key: 'care-logs', label: 'Nhật ký chăm sóc' },
  { key: 'alerts', label: 'Cảnh báo' },
  { key: 'discussion', label: 'Trao đổi' },
] as const;
```

Đổi tên component hiện có `StudentDetailPage` thành `StudentDetailContent` (giữ nguyên toàn bộ thân hàm, bỏ từ khóa `export default`), rồi thêm ở cuối file:

```tsx
export default function StudentDetailPage() {
  // useSearchParams bắt buộc phải nằm trong Suspense ở App Router.
  return (
    <Suspense fallback={null}>
      <StudentDetailContent />
    </Suspense>
  );
}
```

- [ ] **Bước 3: Cho tab nhận giá trị đầu từ `?tab=` để link thông báo mở đúng chỗ**

Trong `StudentDetailContent`, ngay dưới `const studentId = params.id;`, thay dòng `const [tab, setTab] = useState<TabKey>('enrollments');` bằng:

```tsx
  // Thông báo trao đổi trỏ tới `/students/:id?tab=discussion` — mở đúng tab ngay.
  const search = useSearchParams();
  const requested = search.get('tab');
  const [tab, setTab] = useState<TabKey>(
    TABS.some((item) => item.key === requested) ? (requested as TabKey) : 'enrollments',
  );
```

- [ ] **Bước 4: Badge chưa đọc trên nhãn tab "Trao đổi"**

Badge phải hiện được TRƯỚC khi người dùng mở tab, mà `DiscussionTab` chỉ mount khi
tab đang mở — nên trang phải tự lấy luồng. Dùng chung `useDiscussion` nên TanStack
Query gộp lại một lượt gọi, không tốn thêm request.

Thêm import:

```tsx
import { countUnread } from '../../../../lib/discussion';
import { useDiscussion, useMe } from '../../../../lib/hooks';
```

(`useMe` đã được import sẵn — chỉ thêm `useDiscussion` vào đúng dòng import đó, đừng
tạo dòng import thứ hai từ cùng một module.)

Ngay dưới `const { data: me } = useMe();` thêm:

```tsx
  const discussion = useDiscussion(studentId);
```

Trong `TABS.map(...)`, thay `{item.label}` bằng:

```tsx
            {item.label}
            {item.key === 'discussion' && unreadDiscussion > 0 ? (
              <span
                aria-label={`${unreadDiscussion} tin chưa đọc`}
                className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-fpt-orange px-1.5 py-0.5 text-xs font-bold leading-none text-white"
              >
                {unreadDiscussion}
              </span>
            ) : null}
```

Và ngay trước `return (` của phần thân chính (sau khối `if (isLoading || !student || !me)`),
thêm:

```tsx
  const unreadDiscussion = countUnread(
    discussion.data?.messages ?? [],
    discussion.data?.lastReadAt ?? null,
    me.user.id,
  );
```

- [ ] **Bước 5: Render tab mới**

Ngay dưới dòng render `AlertsTab`, thêm:

```tsx
      {tab === 'discussion' ? (
        <DiscussionTab studentId={studentId} currentStaffId={me.user.id} />
      ) : null}
```

- [ ] **Bước 6: Cho SSE làm mới luồng đang mở — `apps/web/src/lib/use-notification-stream.ts`**

Thay hàm `invalidate` và cách đăng ký listener bằng:

```ts
    function invalidate(event: MessageEvent<string>) {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      // Thông báo của tin trao đổi → làm mới luồng đang mở, không cần biết luồng nào.
      try {
        const payload = JSON.parse(event.data) as { discussionMessageId?: string | null };
        if (payload.discussionMessageId) {
          void queryClient.invalidateQueries({ queryKey: ['discussions'] });
        }
      } catch {
        // Payload lạ thì bỏ qua — invalidate thông báo ở trên đã chạy rồi.
      }
    }
```

Giữ nguyên `source.addEventListener('notification', invalidate);` — chữ ký mới vẫn khớp vì `MessageEvent` là kiểu sự kiện SSE gửi tới.

- [ ] **Bước 7: Typecheck + lint + test web**

Run: `pnpm --filter @fcare/web typecheck && pnpm --filter @fcare/web lint && pnpm --filter @fcare/web test`
Expected: PASS

- [ ] **Bước 8: Kiểm tra token màu**

Run: `grep -n "fpt-orange-300\|fpt-blue-600" apps/web/src/components/students/discussion-tab.tsx`
Expected: không có kết quả (hai token này KHÔNG tồn tại, dùng sẽ lỗi thầm lặng).

- [ ] **Bước 9: Cổng hoàn thành toàn repo**

```bash
lsof -ti :3000 || pnpm build
pnpm typecheck && pnpm lint && pnpm test
```

Nếu `lsof` có kết quả (dev server đang chạy) thì BỎ QUA `pnpm build` và ghi rõ điều đó trong báo cáo — không tự tắt dev server của người dùng.

- [ ] **Bước 10: Commit**

```bash
git add apps/web/src/components/students/discussion-tab.tsx \
  "apps/web/src/app/(dashboard)/students/[id]/page.tsx" \
  apps/web/src/lib/use-notification-stream.ts
git commit -m "feat(web): tab trao doi noi bo trong ho so sinh vien"
```

---

## Task 7: E2E hai tài khoản — gửi ở giảng viên, nhận ở CTSV

**Files:**
- Create: `apps/web/e2e/discussion-flow.spec.ts`

**Interfaces:**
- Consumes: `loginAsLecturer`, `loginAsSaOfficer` từ `apps/web/e2e/fixtures/auth.ts` (tài khoản seed `gv.binh` và `ctsv.lan`, cùng mật khẩu `Fcare@123`); deep link `?tab=discussion` (Task 6); thông báo lỗi `PII_IN_MESSAGE` (Task 2).
- Produces: không có — đây là test đầu cuối, không ai import lại.

Vì sao chọn cặp tài khoản này: `SA_OFFICER` nằm trong `UNSCOPED_ROLES` (`apps/api/src/common/utils/dept-scope.ts`) nên thấy mọi sinh viên, còn `LECTURER` chỉ thấy sinh viên lớp mình dạy. Lấy sinh viên từ danh sách của giảng viên thì chắc chắn CẢ HAI cùng nhìn thấy — điều kiện cần để hai bên chung một luồng.

- [ ] **Bước 1: Viết test — `apps/web/e2e/discussion-flow.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';
import { loginAsLecturer, loginAsSaOfficer } from './fixtures/auth';

/**
 * Luồng trao đổi nội bộ đi qua hai tài khoản thật, hai context trình duyệt
 * riêng. Giảng viên chỉ thấy sinh viên lớp mình dạy, còn cán bộ CTSV thấy toàn
 * trường — nên sinh viên lấy từ danh sách của giảng viên chắc chắn nằm trong
 * phạm vi của cả hai.
 */

/** Mở sinh viên đầu tiên trong danh sách và trả về id của sinh viên đó. */
async function openFirstStudent(page: Page): Promise<string> {
  await page.goto('/students');
  const firstLink = page.locator('a[href^="/students/"]').first();
  await expect(firstLink).toBeVisible({ timeout: 30_000 });
  const href = await firstLink.getAttribute('href');
  expect(href).toBeTruthy();
  return (href as string).replace('/students/', '');
}

test('tin nhắn giảng viên gửi hiện ở tài khoản CTSV', async ({ browser }) => {
  // Nội dung duy nhất mỗi lần chạy: E2E chạy trên DB dev có dữ liệu tích luỹ.
  const marker = `E2E trao doi ${Date.now()}`;

  const lecturerContext = await browser.newContext();
  const lecturerPage = await lecturerContext.newPage();
  await loginAsLecturer(lecturerPage);
  const studentId = await openFirstStudent(lecturerPage);

  await lecturerPage.goto(`/students/${studentId}?tab=discussion`);
  const composer = lecturerPage.getByLabel('Nội dung trao đổi');
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await composer.fill(marker);
  await lecturerPage.getByRole('button', { name: 'Gửi' }).click();
  await expect(lecturerPage.getByText(marker)).toBeVisible({ timeout: 30_000 });

  const officerContext = await browser.newContext();
  const officerPage = await officerContext.newPage();
  await loginAsSaOfficer(officerPage);
  await officerPage.goto(`/students/${studentId}?tab=discussion`);
  await expect(officerPage.getByText(marker)).toBeVisible({ timeout: 30_000 });

  await lecturerContext.close();
  await officerContext.close();
});

test('composer từ chối số điện thoại và giữ nguyên nội dung đã gõ', async ({ page }) => {
  await loginAsLecturer(page);
  const studentId = await openFirstStudent(page);
  await page.goto(`/students/${studentId}?tab=discussion`);

  const withPii = 'Goi phu huynh 0912345678 giup em';
  const composer = page.getByLabel('Nội dung trao đổi');
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await composer.fill(withPii);
  await page.getByRole('button', { name: 'Gửi' }).click();

  await expect(page.getByText(/số điện thoại/)).toBeVisible({ timeout: 30_000 });
  // Bị chặn thì người dùng chỉ phải sửa, không phải gõ lại từ đầu.
  await expect(composer).toHaveValue(withPii);
  // Và tuyệt đối không có tin nào lọt vào luồng.
  await expect(page.getByText(withPii, { exact: true })).toHaveCount(0);
});

test('giảng viên thu hồi được tin của chính mình', async ({ page }) => {
  const marker = `E2E thu hoi ${Date.now()}`;
  await loginAsLecturer(page);
  const studentId = await openFirstStudent(page);
  await page.goto(`/students/${studentId}?tab=discussion`);

  const composer = page.getByLabel('Nội dung trao đổi');
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await composer.fill(marker);
  await page.getByRole('button', { name: 'Gửi' }).click();
  await expect(page.getByText(marker)).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Thu hồi' }).last().click();
  await expect(page.getByText(marker)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText('Tin nhắn đã thu hồi').last()).toBeVisible();
});
```

- [ ] **Bước 2: Chạy E2E trên chromium**

E2E cần cả web (:3000) lẫn API (:3001) và Postgres đã seed. Nếu hai server đang chạy sẵn thì đặt `E2E_BASE_URL` để Playwright không tự khởi động lại:

```bash
pnpm --filter @fcare/web exec playwright test discussion-flow --project=chromium
```

Expected: 3 test PASS. Nếu `openFirstStudent` không tìm được link nào, tài khoản `gv.binh` chưa được phân lớp học phần trong DB dev — chạy lại `pnpm --filter @fcare/api db:seed` rồi thử lại; đó là vấn đề dữ liệu, KHÔNG phải lý do nới điều kiện test.

- [ ] **Bước 3: Commit**

```bash
git add apps/web/e2e/discussion-flow.spec.ts
git commit -m "test(web): e2e luong trao doi hai tai khoan"
```
