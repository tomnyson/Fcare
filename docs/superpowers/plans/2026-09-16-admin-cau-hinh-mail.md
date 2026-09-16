# Admin cấu hình mail (SMTP) trong hệ thống — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADMIN cấu hình máy chủ gửi mail (host, port, TLS, tài khoản, mật khẩu, tên/địa chỉ người gửi, bật/tắt) ngay trong giao diện FCare, gửi mail thử để kiểm tra, và mọi mail của hệ thống (cảnh báo, nhật ký chăm sóc, trao đổi) dùng cấu hình này thay vì chỉ đọc biến môi trường.

**Architecture:**
- **Lưu trữ**: bảng singleton `mail_settings` (1 dòng, `id = 'default'`). Mật khẩu SMTP mã hoá **AES-256-GCM** bằng khoá `SETTINGS_ENCRYPTION_KEY` (env, 32 byte hex). API không bao giờ trả mật khẩu — chỉ trả `hasPassword: boolean`.
- **Thứ tự ưu tiên cấu hình**: dòng DB (nếu có) → env `SMTP_*` (fallback, giữ tương thích docker-compose/MailHog). `MailSettingsService.getEffectiveConfig()` gộp hai nguồn, cache trong bộ nhớ 60 giây và bị vô hiệu ngay khi ADMIN lưu (`version` tăng).
- **Gửi mail**: `EmailService` không tạo transporter một lần trong constructor nữa mà lấy `getEffectiveConfig()` mỗi lần gửi; transporter được cache theo `version` để không tạo lại mỗi mail. `enabled = false` → mọi `sendMail` trả `false` (log warn), queue vẫn chạy bình thường.
- **API**: module mới `mail-settings` với 3 endpoint dưới `/admin/mail-settings` (GET, PUT, POST `test`), CASL subject mới `MailSettings` (chỉ ADMIN), audit `MAIL_SETTINGS_UPDATE` / `MAIL_SETTINGS_TEST` (không ghi mật khẩu vào metadata).
- **Web**: trang `/admin/mail` (mục "Cấu hình email" trong nhóm Hệ thống, chỉ ADMIN) gồm form cấu hình + preset (MailHog/Gmail/Office 365) + panel gửi thử + thẻ trạng thái (nguồn cấu hình, lần thử gần nhất). Logic thuần (validate, preset, payload) tách ra `lib/mail-settings.ts` để test Vitest.

**Tech Stack:** NestJS 11, Prisma 6 (pin), PostgreSQL, nodemailer ^10, Node `crypto` (AES-256-GCM), class-validator, CASL, Next.js 15 App Router, TanStack Query, Vitest, Jest 30, Playwright.

**Spec tham chiếu:** yêu cầu "thiết lập hệ thống cho phép admin cấu hình mail" (chat 2026-09-16); `apps/api/src/modules/email/email.service.ts` hiện đọc `SMTP_HOST/PORT/USER/PASS/FROM` từ env; `infra/docker/docker-compose.yml` (MailHog 1025/8025).

## Global Constraints
- **RULE BẢO MẬT 1**: không thêm field PII sinh viên. Địa chỉ người gửi/người nhận mail thử là email **nhân viên/hệ thống** — key trả về đặt tên `fromEmail`, `username`, `to` (KHÔNG dùng `fromAddress` vì `PiiGuardInterceptor` xoá mọi key khớp `/address/i`; KHÔNG dùng key `email` vì bị xoá ngoài `/admin/staff`, `/auth/me`).
- **Bí mật**: mật khẩu SMTP không được log, không được trả về API, không hardcode. `SETTINGS_ENCRYPTION_KEY` chỉ ở env. Thiếu khoá mà cố lưu mật khẩu → 400 `MAIL_ENCRYPTION_KEY_MISSING`, không lưu bản rõ.
- Mail thử chỉ gửi tới email `@fpt.edu.vn` / `@fe.edu.vn` (tái dùng luật của `AdminService.bulkAssignEmails`), throttle 5 lần/phút.
- Không WebSocket, không cron, không nâng Prisma 7, không thêm thư viện mới (crypto có sẵn, nodemailer đã có).
- GitNexus chưa index module `email` (file untracked): chạy `node .gitnexus/run.cjs analyze` trước Task 7; blast radius `EmailService` xác định tay = `NotificationDispatchService`, `CareLogsService`, `EmailProcessor`.
- Hoàn thành: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` xanh; kiểm tra `lsof -i :3000` trước khi build web (đang chạy `next dev`). Không commit khi user chưa yêu cầu.

## Quyết định nghiệp vụ (giả định — user xác nhận/sửa trước khi làm)
| # | Vấn đề | Đề xuất |
|---|---|---|
| A | Phạm vi cấu hình | Host, port, TLS (`secure`), username, password, tên người gửi, email người gửi, bật/tắt gửi mail. Không cấu hình template nội dung mail. |
| B | Bao nhiêu cấu hình | Đúng 1 bộ cấu hình toàn hệ thống (singleton). Không theo bộ môn. |
| C | Chưa cấu hình trong DB | Dùng env `SMTP_*` như hiện nay (dev = MailHog). UI hiện nhãn "Đang dùng biến môi trường". |
| D | Mật khẩu | Mã hoá AES-256-GCM với `SETTINGS_ENCRYPTION_KEY`. Khi sửa: bỏ trống = giữ mật khẩu cũ; tick "Xoá mật khẩu" = xoá. |
| E | Ai được sửa | Chỉ ADMIN (CASL `manage MailSettings`). Không ai khác xem được, kể cả Trưởng CTSV. |
| F | Gửi mail thử | Nhập email nhận (mặc định gợi ý email của chính admin nếu có); phải thuộc miền FPT; dùng cấu hình **đang nhập trên form** (chưa cần lưu) để thử; lưu `lastTestedAt`, `lastTestOk` khi thử bằng cấu hình đã lưu. |
| G | Tắt gửi mail | `enabled = false` → `sendMail` trả `false`, thông báo trong app (chuông/SSE) vẫn hoạt động. |
| H | Áp dụng cấu hình mới | Ngay lập tức trong tiến trình API (cache vô hiệu khi lưu). Không cần restart. Worker BullMQ chạy cùng tiến trình nên cũng nhận. |
| I | Audit | `MAIL_SETTINGS_UPDATE` (metadata: danh sách field đổi, `passwordChanged: boolean`), `MAIL_SETTINGS_TEST` (metadata: `ok`, `usingSaved`). Không ghi giá trị host/user vào metadata. |

## Cấu trúc file

| Loại | Đường dẫn | Ghi chú |
|---|---|---|
| Migration | `apps/api/prisma/migrations/20260916120000_add_mail_settings/migration.sql` | bảng `mail_settings` singleton |
| Schema | `apps/api/prisma/schema.prisma` | model `MailSetting` + relation `Staff.mailSettingsUpdated` |
| Util mới | `apps/api/src/common/utils/secret-cipher.ts` | `encryptSecret`, `decryptSecret` (AES-256-GCM thuần hàm) |
| Test | `apps/api/src/common/utils/secret-cipher.spec.ts` | round-trip, sai khoá, sai định dạng |
| Util mới | `apps/api/src/common/utils/staff-email.ts` | `isAllowedStaffEmail` (tách từ `AdminService`) |
| Sửa | `apps/api/src/modules/admin/admin.service.ts:299-300` | dùng `isAllowedStaffEmail` |
| Module mới | `apps/api/src/modules/mail-settings/mail-settings.module.ts` | imports `ConfigModule`, `PrismaModule`; exports service |
| Service mới | `apps/api/src/modules/mail-settings/mail-settings.service.ts` | `getView`, `update`, `getEffectiveConfig`, `sendTest` |
| Test | `apps/api/src/modules/mail-settings/mail-settings.service.spec.ts` | env fallback, mã hoá, cache/version, gửi thử |
| Factory mới | `apps/api/src/modules/mail-settings/mail-transport.factory.ts` | `createMailTransport(config)` bọc `nodemailer.createTransport` |
| Types mới | `apps/api/src/modules/mail-settings/mail-settings.types.ts` | `EffectiveMailConfig`, `MailSettingsView` |
| DTO mới | `apps/api/src/modules/mail-settings/dto/mail-settings.dto.ts` | `UpdateMailSettingsDto`, `SendTestMailDto` |
| Test | `apps/api/src/modules/mail-settings/dto/mail-settings.dto.spec.ts` | class-validator |
| Controller mới | `apps/api/src/modules/mail-settings/mail-settings.controller.ts` | `GET/PUT /admin/mail-settings`, `POST /admin/mail-settings/test` |
| Sửa | `apps/api/src/casl/ability.factory.ts:20-32` | subject `'MailSettings'` |
| Sửa | `apps/api/src/app.module.ts` | đăng ký `MailSettingsModule` |
| Sửa | `apps/api/src/modules/email/email.module.ts` | import `MailSettingsModule` |
| Sửa | `apps/api/src/modules/email/email.service.ts` | transporter theo `getEffectiveConfig()` + `version` |
| Sửa | `apps/api/src/modules/email/email.service.spec.ts` | mock `MailSettingsService`, override `transportFactory` |
| Env | `.env.example`, `apps/api/.env`, `infra/docker/docker-compose.yml` | `SETTINGS_ENCRYPTION_KEY`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME` |
| Web lib mới | `apps/web/src/lib/mail-settings.ts` | types, `MAIL_PRESETS`, `validateMailSettings`, `buildUpdatePayload`, `isAllowedTestRecipient` |
| Test | `apps/web/src/lib/mail-settings.test.ts` | Vitest |
| Web page mới | `apps/web/src/app/(dashboard)/admin/mail/page.tsx` | container: query/mutation, gate ADMIN |
| Component mới | `apps/web/src/components/admin/mail-settings-form.tsx` | form + preset |
| Component mới | `apps/web/src/components/admin/mail-test-panel.tsx` | gửi thử |
| Component mới | `apps/web/src/components/admin/mail-status-card.tsx` | nguồn cấu hình, lần thử gần nhất, skeleton |
| Sửa | `apps/web/src/components/dashboard/nav-icons.tsx` | `IconMail` |
| Sửa | `apps/web/src/components/dashboard/nav-tree.ts:130-132` + `nav-tree.test.ts` | mục "Cấu hình email" |
| E2E mới | `apps/web/e2e/admin-mail-settings.spec.ts` | Playwright, API mock |
| Docs | `README.md`, `CLAUDE.md`, `docs/deploy-aapanel.md`, memory `fcare-stack-decisions` | khoá mã hoá, luồng cấu hình |

---

### Task 1: Schema + migration `mail_settings`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (sau model `Staff`, gần dòng 104-140)
- Create: `apps/api/prisma/migrations/20260916120000_add_mail_settings/migration.sql`

**Interfaces:**
- Produces: Prisma model `MailSetting { id, host, port, secure, username?, passwordEncrypted?, fromName, fromEmail, enabled, lastTestedAt?, lastTestOk?, updatedById?, updatedBy?, createdAt, updatedAt }`, client `prisma.mailSetting`.

- [ ] **Step 1: Thêm model vào schema**

```prisma
/// Cấu hình SMTP toàn hệ thống — đúng 1 dòng (`id = 'default'`).
/// `passwordEncrypted` là ciphertext AES-256-GCM (xem common/utils/secret-cipher.ts),
/// KHÔNG bao giờ trả ra API.
model MailSetting {
  id                String    @id @default("default")
  host              String
  port              Int       @default(587)
  secure            Boolean   @default(false)
  username          String?
  passwordEncrypted String?   @map("password_encrypted")
  fromName          String    @map("from_name")
  fromEmail         String    @map("from_email")
  enabled           Boolean   @default(true)
  lastTestedAt      DateTime? @map("last_tested_at")
  lastTestOk        Boolean?  @map("last_test_ok")
  updatedById       String?   @map("updated_by_id")
  updatedBy         Staff?    @relation("MailSettingUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  @@map("mail_settings")
}
```

Trong model `Staff` thêm relation ngược:

```prisma
  mailSettingsUpdated MailSetting[] @relation("MailSettingUpdatedBy")
```

- [ ] **Step 2: Viết migration SQL**

```sql
-- CreateTable
CREATE TABLE "mail_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "password_encrypted" TEXT,
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_tested_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "mail_settings" ADD CONSTRAINT "mail_settings_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

(Kiểm tra tên bảng staff thực tế bằng `grep -n '@@map("staff' apps/api/prisma/schema.prisma` — dùng đúng tên đó.)

- [ ] **Step 3: Áp migration + generate**

Run: `pnpm --filter @fcare/api exec prisma migrate deploy && pnpm --filter @fcare/api exec prisma generate`
Expected: migration `20260916120000_add_mail_settings` applied; `prisma.mailSetting` có trong client.

- [ ] **Step 4: Typecheck api**

Run: `pnpm --filter @fcare/api typecheck`
Expected: PASS.

---

### Task 2: Util mã hoá `secret-cipher.ts`

**Files:**
- Create: `apps/api/src/common/utils/secret-cipher.ts`
- Test: `apps/api/src/common/utils/secret-cipher.spec.ts`

**Interfaces:**
- Produces: `encryptSecret(plain: string, keyHex: string): string` (trả `v1:<ivB64>:<tagB64>:<dataB64>`), `decryptSecret(cipher: string, keyHex: string): string`, `parseEncryptionKey(keyHex: string | undefined): Buffer | null` (null nếu thiếu/sai độ dài), `SecretCipherError` (class Error với `code: 'KEY_MISSING' | 'BAD_FORMAT' | 'AUTH_FAILED'`).

- [ ] **Step 1: Viết test RED**

```ts
import { randomBytes } from 'node:crypto';
import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKey,
  SecretCipherError,
} from './secret-cipher';

const KEY = randomBytes(32).toString('hex');

describe('secret-cipher', () => {
  it('mã hoá rồi giải mã cho lại bản rõ, mỗi lần mã hoá ra ciphertext khác nhau', () => {
    const a = encryptSecret('m@t-khau-smtp', KEY);
    const b = encryptSecret('m@t-khau-smtp', KEY);
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(decryptSecret(a, KEY)).toBe('m@t-khau-smtp');
    expect(decryptSecret(b, KEY)).toBe('m@t-khau-smtp');
  });

  it('sai khoá → AUTH_FAILED', () => {
    const cipher = encryptSecret('secret', KEY);
    const other = randomBytes(32).toString('hex');
    expect(() => decryptSecret(cipher, other)).toThrow(SecretCipherError);
    try {
      decryptSecret(cipher, other);
    } catch (error) {
      expect((error as SecretCipherError).code).toBe('AUTH_FAILED');
    }
  });

  it('ciphertext sai định dạng → BAD_FORMAT', () => {
    expect(() => decryptSecret('khong-phai-ciphertext', KEY)).toThrow(SecretCipherError);
    expect(() => decryptSecret('v9:a:b:c', KEY)).toThrow(SecretCipherError);
  });

  it('parseEncryptionKey: thiếu hoặc không đủ 32 byte → null', () => {
    expect(parseEncryptionKey(undefined)).toBeNull();
    expect(parseEncryptionKey('abc')).toBeNull();
    expect(parseEncryptionKey(KEY)?.length).toBe(32);
  });

  it('thiếu khoá khi mã hoá → KEY_MISSING', () => {
    expect(() => encryptSecret('x', '')).toThrow(SecretCipherError);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `pnpm --filter @fcare/api exec jest src/common/utils/secret-cipher.spec.ts`
Expected: FAIL — cannot find module `./secret-cipher`.

- [ ] **Step 3: Implement**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Mã hoá bí mật cấu hình (mật khẩu SMTP…) bằng AES-256-GCM.
 * Định dạng lưu: `v1:<iv b64>:<authTag b64>:<ciphertext b64>`.
 * Khoá lấy từ env `SETTINGS_ENCRYPTION_KEY` (32 byte, hex 64 ký tự).
 */
export type SecretCipherErrorCode = 'KEY_MISSING' | 'BAD_FORMAT' | 'AUTH_FAILED';

export class SecretCipherError extends Error {
  constructor(
    readonly code: SecretCipherErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SecretCipherError';
  }
}

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export function parseEncryptionKey(keyHex: string | undefined): Buffer | null {
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) return null;
  return Buffer.from(keyHex, 'hex');
}

function requireKey(keyHex: string | undefined): Buffer {
  const key = parseEncryptionKey(keyHex);
  if (!key) {
    throw new SecretCipherError(
      'KEY_MISSING',
      'SETTINGS_ENCRYPTION_KEY chưa cấu hình hoặc không phải 32 byte hex.',
    );
  }
  return key;
}

export function encryptSecret(plain: string, keyHex: string): string {
  const key = requireKey(keyHex);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(cipherText: string, keyHex: string): string {
  const key = requireKey(keyHex);
  const parts = cipherText.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SecretCipherError('BAD_FORMAT', 'Ciphertext không đúng định dạng v1.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new SecretCipherError('AUTH_FAILED', 'Không giải mã được — khoá sai hoặc dữ liệu hỏng.');
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `pnpm --filter @fcare/api exec jest src/common/utils/secret-cipher.spec.ts`
Expected: 5 passed.

---

### Task 3: Tách `isAllowedStaffEmail` dùng chung

**Files:**
- Create: `apps/api/src/common/utils/staff-email.ts`
- Test: `apps/api/src/common/utils/staff-email.spec.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts:299-301`

**Interfaces:**
- Produces: `isAllowedStaffEmail(email: string): boolean`, `ALLOWED_STAFF_EMAIL_DOMAINS: readonly ['fpt.edu.vn', 'fe.edu.vn']`.

- [ ] **Step 1: Test RED**

```ts
import { isAllowedStaffEmail } from './staff-email';

describe('isAllowedStaffEmail', () => {
  it('chỉ chấp nhận miền FPT/FE, không phân biệt hoa thường', () => {
    expect(isAllowedStaffEmail('an.nv@fpt.edu.vn')).toBe(true);
    expect(isAllowedStaffEmail('An.NV@FE.EDU.VN')).toBe(true);
    expect(isAllowedStaffEmail('an@gmail.com')).toBe(false);
    expect(isAllowedStaffEmail('an@fpt.edu.vn.evil.com')).toBe(false);
    expect(isAllowedStaffEmail('')).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy → FAIL (module không tồn tại)**

Run: `pnpm --filter @fcare/api exec jest src/common/utils/staff-email.spec.ts`

- [ ] **Step 3: Implement + thay trong AdminService**

```ts
/** Miền email nhân viên được phép — dùng cho gán email GV và mail thử. */
export const ALLOWED_STAFF_EMAIL_DOMAINS = ['fpt.edu.vn', 'fe.edu.vn'] as const;

export function isAllowedStaffEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return false;
  const domain = normalized.slice(at + 1);
  return ALLOWED_STAFF_EMAIL_DOMAINS.some((allowed) => domain === allowed);
}
```

Trong `admin.service.ts`: xoá closure `isAllowedEmail` (dòng 299-300), import `isAllowedStaffEmail` từ `../../common/utils/staff-email` và đổi `emails.some((email) => !isAllowedEmail(email))` → `emails.some((email) => !isAllowedStaffEmail(email))`.

- [ ] **Step 4: Chạy test util + admin spec**

Run: `pnpm --filter @fcare/api exec jest src/common/utils/staff-email.spec.ts src/modules/admin`
Expected: PASS toàn bộ (admin.service.spec không đổi hành vi).

---

### Task 4: `MailSettingsService` — đọc/ghi cấu hình, config hiệu lực, cache

**Files:**
- Create: `apps/api/src/modules/mail-settings/mail-settings.types.ts`
- Create: `apps/api/src/modules/mail-settings/mail-settings.service.ts`
- Test: `apps/api/src/modules/mail-settings/mail-settings.service.spec.ts`

**Interfaces:**
- Consumes: `encryptSecret/decryptSecret/parseEncryptionKey` (Task 2), `prisma.mailSetting` (Task 1), `AuditService.log`.
- Produces:
  ```ts
  export interface EffectiveMailConfig {
    host: string; port: number; secure: boolean;
    auth: { user: string; pass: string } | null;
    fromName: string; fromEmail: string; enabled: boolean;
    source: 'DATABASE' | 'ENV'; version: number;
  }
  export interface MailSettingsView {
    host: string; port: number; secure: boolean; username: string | null;
    hasPassword: boolean; fromName: string; fromEmail: string; enabled: boolean;
    source: 'DATABASE' | 'ENV'; encryptionReady: boolean;
    lastTestedAt: string | null; lastTestOk: boolean | null;
    updatedAt: string | null; updatedBy: { id: string; fullName: string } | null;
  }
  export interface UpdateMailSettingsInput {
    host: string; port: number; secure: boolean; username?: string | null;
    password?: string; clearPassword?: boolean; fromName: string; fromEmail: string; enabled: boolean;
  }
  class MailSettingsService {
    getView(): Promise<MailSettingsView>;
    update(actorId: string, input: UpdateMailSettingsInput): Promise<MailSettingsView>;
    getEffectiveConfig(): Promise<EffectiveMailConfig>;
    invalidate(): void;
    formatFrom(config: EffectiveMailConfig): string; // `"Tên" <email>`
  }
  ```

- [ ] **Step 1: Types**

```ts
// mail-settings.types.ts — nội dung đúng như khối Interfaces ở trên, export cả 3 interface.
```

- [ ] **Step 2: Test RED**

```ts
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret } from '../../common/utils/secret-cipher';
import { MailSettingsService } from './mail-settings.service';

const KEY = randomBytes(32).toString('hex');

function configWith(env: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string, fallback?: unknown) => env[key] ?? fallback),
  } as unknown as ConfigService;
}

function build(env: Record<string, string | undefined>, row: Record<string, unknown> | null) {
  const prisma = {
    mailSetting: {
      findUnique: jest.fn().mockResolvedValue(row),
      upsert: jest.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
        id: 'default', createdAt: new Date(), updatedAt: new Date(), lastTestedAt: null, lastTestOk: null,
        ...(row ?? {}), ...create, ...update, updatedBy: { id: 'admin-1', fullName: 'Quản trị' },
      })),
      update: jest.fn(),
    },
  } as unknown as PrismaService;
  const audit = { log: jest.fn() } as unknown as AuditService;
  return { service: new MailSettingsService(configWith(env), prisma, audit), prisma, audit };
}

const dbRow = {
  id: 'default', host: 'smtp.office365.com', port: 587, secure: false, username: 'fcare@fpt.edu.vn',
  passwordEncrypted: null, fromName: 'FCare', fromEmail: 'fcare@fpt.edu.vn', enabled: true,
  lastTestedAt: null, lastTestOk: null, updatedById: 'admin-1', createdAt: new Date(), updatedAt: new Date(),
  updatedBy: { id: 'admin-1', fullName: 'Quản trị' },
};

describe('MailSettingsService', () => {
  it('chưa có dòng DB → config hiệu lực lấy từ env, source ENV', async () => {
    const { service } = build({ SMTP_HOST: 'mailhog', SMTP_PORT: '1025', SMTP_FROM: 'noreply@fpt.edu.vn' }, null);
    const config = await service.getEffectiveConfig();
    expect(config).toMatchObject({ host: 'mailhog', port: 1025, secure: false, auth: null, source: 'ENV', enabled: true });
    expect(config.fromEmail).toBe('noreply@fpt.edu.vn');
  });

  it('getView không bao giờ chứa mật khẩu, chỉ hasPassword + encryptionReady', async () => {
    const { service } = build({ SETTINGS_ENCRYPTION_KEY: KEY }, { ...dbRow, passwordEncrypted: 'v1:a:b:c' });
    const view = await service.getView();
    expect(view).not.toHaveProperty('password');
    expect(view).not.toHaveProperty('passwordEncrypted');
    expect(view.hasPassword).toBe(true);
    expect(view.encryptionReady).toBe(true);
    expect(view.source).toBe('DATABASE');
  });

  it('update mã hoá mật khẩu trước khi lưu và ghi audit không kèm giá trị', async () => {
    const { service, prisma, audit } = build({ SETTINGS_ENCRYPTION_KEY: KEY }, null);
    await service.update('admin-1', {
      host: 'smtp.gmail.com', port: 465, secure: true, username: 'a@fpt.edu.vn', password: 'app-pass',
      fromName: 'FCare', fromEmail: 'a@fpt.edu.vn', enabled: true,
    });
    const upsertArgs = (prisma.mailSetting.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertArgs.create.passwordEncrypted).not.toContain('app-pass');
    expect(decryptSecret(upsertArgs.create.passwordEncrypted, KEY)).toBe('app-pass');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MAIL_SETTINGS_UPDATE', entity: 'MailSetting', entityId: 'default' }),
    );
    const metadata = (audit.log as jest.Mock).mock.calls[0][0].metadata;
    expect(JSON.stringify(metadata)).not.toContain('app-pass');
    expect(metadata.passwordChanged).toBe(true);
  });

  it('update bỏ trống password → giữ ciphertext cũ; clearPassword → null', async () => {
    const existing = { ...dbRow, passwordEncrypted: 'v1:old:old:old' };
    const { service, prisma } = build({ SETTINGS_ENCRYPTION_KEY: KEY }, existing);
    const base = { host: 'h', port: 587, secure: false, username: 'u', fromName: 'F', fromEmail: 'f@fpt.edu.vn', enabled: true };
    await service.update('admin-1', base);
    expect((prisma.mailSetting.upsert as jest.Mock).mock.calls[0][0].update).not.toHaveProperty('passwordEncrypted');
    await service.update('admin-1', { ...base, clearPassword: true });
    expect((prisma.mailSetting.upsert as jest.Mock).mock.calls[1][0].update.passwordEncrypted).toBeNull();
  });

  it('có password nhưng thiếu khoá mã hoá → 400 MAIL_ENCRYPTION_KEY_MISSING', async () => {
    const { service } = build({}, null);
    await expect(
      service.update('admin-1', { host: 'h', port: 587, secure: false, password: 'x', fromName: 'F', fromEmail: 'f@fpt.edu.vn', enabled: true }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'MAIL_ENCRYPTION_KEY_MISSING' }) });
  });

  it('config hiệu lực được cache và version tăng sau khi update', async () => {
    const { service, prisma } = build({ SETTINGS_ENCRYPTION_KEY: KEY }, dbRow);
    const first = await service.getEffectiveConfig();
    await service.getEffectiveConfig();
    expect(prisma.mailSetting.findUnique).toHaveBeenCalledTimes(1);
    await service.update('admin-1', { host: 'h2', port: 25, secure: false, fromName: 'F', fromEmail: 'f@fpt.edu.vn', enabled: false });
    const second = await service.getEffectiveConfig();
    expect(second.version).toBe(first.version + 1);
    expect(second.host).toBe('h2');
    expect(second.enabled).toBe(false);
  });

  it('formatFrom ghép "Tên" <email>', () => {
    const { service } = build({}, null);
    expect(service.formatFrom({ fromName: 'FCare — Học vụ', fromEmail: 'a@fpt.edu.vn' } as never)).toBe('"FCare — Học vụ" <a@fpt.edu.vn>');
  });
});
```

- [ ] **Step 3: Chạy → FAIL (module không tồn tại)**

Run: `pnpm --filter @fcare/api exec jest src/modules/mail-settings/mail-settings.service.spec.ts`

- [ ] **Step 4: Implement service (chưa có `sendTest`, thêm ở Task 5)**

```ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKey,
} from '../../common/utils/secret-cipher';
import type {
  EffectiveMailConfig,
  MailSettingsView,
  UpdateMailSettingsInput,
} from './mail-settings.types';

const SETTINGS_ID = 'default';
const CACHE_TTL_MS = 60_000;
const DEFAULT_FROM_NAME = 'FCare — Chăm sóc & Giám sát Học vụ';
const DEFAULT_FROM_EMAIL = 'fcare-noreply@fpt.edu.vn';

type MailSettingRow = NonNullable<
  Awaited<ReturnType<PrismaService['mailSetting']['findUnique']>>
> & { updatedBy: { id: string; fullName: string } | null };

@Injectable()
export class MailSettingsService {
  private readonly logger = new Logger(MailSettingsService.name);
  private cache: { config: EffectiveMailConfig; expiresAt: number } | null = null;
  private version = 1;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get encryptionKey(): string {
    return this.config.get<string>('SETTINGS_ENCRYPTION_KEY', '');
  }

  private findRow(): Promise<MailSettingRow | null> {
    return this.prisma.mailSetting.findUnique({
      where: { id: SETTINGS_ID },
      include: { updatedBy: { select: { id: true, fullName: true } } },
    }) as Promise<MailSettingRow | null>;
  }

  /** Cấu hình từ biến môi trường — fallback khi DB chưa có dòng nào. */
  private envConfig(): Omit<EffectiveMailConfig, 'version'> {
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const port = Number(this.config.get<string>('SMTP_PORT', '1025'));
    return {
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : null,
      fromName: this.config.get<string>('SMTP_FROM_NAME', DEFAULT_FROM_NAME),
      fromEmail: this.config.get<string>('SMTP_FROM', DEFAULT_FROM_EMAIL),
      enabled: true,
      source: 'ENV',
    };
  }

  async getView(): Promise<MailSettingsView> {
    const row = await this.findRow();
    const encryptionReady = parseEncryptionKey(this.encryptionKey) !== null;
    if (!row) {
      const env = this.envConfig();
      return {
        host: env.host, port: env.port, secure: env.secure, username: env.auth?.user ?? null,
        hasPassword: Boolean(env.auth), fromName: env.fromName, fromEmail: env.fromEmail,
        enabled: true, source: 'ENV', encryptionReady, lastTestedAt: null, lastTestOk: null,
        updatedAt: null, updatedBy: null,
      };
    }
    return this.toView(row, encryptionReady);
  }

  private toView(row: MailSettingRow, encryptionReady: boolean): MailSettingsView {
    return {
      host: row.host, port: row.port, secure: row.secure, username: row.username,
      hasPassword: Boolean(row.passwordEncrypted), fromName: row.fromName, fromEmail: row.fromEmail,
      enabled: row.enabled, source: 'DATABASE', encryptionReady,
      lastTestedAt: row.lastTestedAt?.toISOString() ?? null, lastTestOk: row.lastTestOk,
      updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy,
    };
  }

  async update(actorId: string, input: UpdateMailSettingsInput): Promise<MailSettingsView> {
    const existing = await this.findRow();
    const passwordPatch = this.buildPasswordPatch(input);
    const data = {
      host: input.host.trim(), port: input.port, secure: input.secure,
      username: input.username?.trim() || null,
      fromName: input.fromName.trim(), fromEmail: input.fromEmail.trim().toLowerCase(),
      enabled: input.enabled, updatedById: actorId,
    };
    const row = (await this.prisma.mailSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data, ...passwordPatch },
      update: { ...data, ...passwordPatch },
      include: { updatedBy: { select: { id: true, fullName: true } } },
    })) as MailSettingRow;
    this.invalidate();
    await this.audit.log({
      staffId: actorId, action: 'MAIL_SETTINGS_UPDATE', entity: 'MailSetting', entityId: SETTINGS_ID,
      metadata: {
        changedFields: this.changedFields(existing, data),
        passwordChanged: 'passwordEncrypted' in passwordPatch,
      },
    });
    return this.toView(row, parseEncryptionKey(this.encryptionKey) !== null);
  }

  /** `{}` = giữ nguyên; `{ passwordEncrypted: null }` = xoá; `{ passwordEncrypted: 'v1:…' }` = đổi. */
  private buildPasswordPatch(input: UpdateMailSettingsInput): { passwordEncrypted?: string | null } {
    if (input.clearPassword) return { passwordEncrypted: null };
    if (!input.password) return {};
    if (!parseEncryptionKey(this.encryptionKey)) {
      throw new BadRequestException({
        code: 'MAIL_ENCRYPTION_KEY_MISSING',
        message: 'Máy chủ chưa cấu hình SETTINGS_ENCRYPTION_KEY nên không thể lưu mật khẩu SMTP.',
      });
    }
    return { passwordEncrypted: encryptSecret(input.password, this.encryptionKey) };
  }

  private changedFields(existing: MailSettingRow | null, data: Record<string, unknown>): string[] {
    if (!existing) return Object.keys(data);
    return Object.keys(data).filter(
      (key) => key !== 'updatedById' && (existing as Record<string, unknown>)[key] !== data[key],
    );
  }

  invalidate(): void {
    this.cache = null;
    this.version += 1;
  }

  async getEffectiveConfig(): Promise<EffectiveMailConfig> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.config;
    const row = await this.findRow();
    const config: EffectiveMailConfig = row
      ? { ...this.fromRow(row), version: this.version }
      : { ...this.envConfig(), version: this.version };
    this.cache = { config, expiresAt: Date.now() + CACHE_TTL_MS };
    return config;
  }

  private fromRow(row: MailSettingRow): Omit<EffectiveMailConfig, 'version'> {
    return {
      host: row.host, port: row.port, secure: row.secure,
      auth: row.username && row.passwordEncrypted
        ? { user: row.username, pass: this.decryptOrWarn(row.passwordEncrypted) }
        : null,
      fromName: row.fromName, fromEmail: row.fromEmail, enabled: row.enabled, source: 'DATABASE',
    };
  }

  private decryptOrWarn(cipher: string): string {
    try {
      return decryptSecret(cipher, this.encryptionKey);
    } catch (error) {
      this.logger.warn(`Không giải mã được mật khẩu SMTP: ${(error as Error).message}`);
      return '';
    }
  }

  formatFrom(config: Pick<EffectiveMailConfig, 'fromName' | 'fromEmail'>): string {
    const name = config.fromName.replace(/"/g, '');
    return name ? `"${name}" <${config.fromEmail}>` : config.fromEmail;
  }
}
```

- [ ] **Step 5: Chạy test → PASS (7 passed)**

Run: `pnpm --filter @fcare/api exec jest src/modules/mail-settings/mail-settings.service.spec.ts`

---

### Task 5: Gửi mail thử (`sendTest`) + `mail-transport.factory.ts`

**Files:**
- Create: `apps/api/src/modules/mail-settings/mail-transport.factory.ts`
- Modify: `apps/api/src/modules/mail-settings/mail-settings.service.ts` (thêm `sendTest`, field `transportFactory`)
- Test: `apps/api/src/modules/mail-settings/mail-settings.service.spec.ts` (thêm describe)

**Interfaces:**
- Consumes: `isAllowedStaffEmail` (Task 3), `EffectiveMailConfig` (Task 4).
- Produces:
  ```ts
  export type MailTransport = { verify(): Promise<true>; sendMail(options: nodemailer.SendMailOptions): Promise<unknown> };
  export type MailTransportFactory = (config: EffectiveMailConfig) => MailTransport;
  export const createMailTransport: MailTransportFactory;
  export interface SendTestMailInput { to: string; draft?: UpdateMailSettingsInput } // draft = cấu hình đang nhập
  export interface SendTestMailResult { ok: true; sentAt: string; usingSaved: boolean }
  MailSettingsService.sendTest(actorId: string, input: SendTestMailInput): Promise<SendTestMailResult>
  ```
  Lỗi: `BadRequestException({ code: 'MAIL_TEST_RECIPIENT_NOT_ALLOWED' })`, `BadRequestException({ code: 'MAIL_TEST_FAILED', message })` (message = thông điệp nodemailer đã cắt còn 200 ký tự, không chứa mật khẩu).

- [ ] **Step 1: Factory**

```ts
import * as nodemailer from 'nodemailer';
import type { EffectiveMailConfig } from './mail-settings.types';

export type MailTransport = Pick<nodemailer.Transporter, 'verify' | 'sendMail'>;
export type MailTransportFactory = (config: EffectiveMailConfig) => MailTransport;

/** Điểm duy nhất tạo transporter — test thay bằng jest.fn() qua `transportFactory`. */
export const createMailTransport: MailTransportFactory = (config) =>
  nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth ?? undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
```

- [ ] **Step 2: Test RED (thêm vào spec Task 4)**

```ts
describe('MailSettingsService.sendTest', () => {
  function withTransport(row: Record<string, unknown> | null, transport: { verify: jest.Mock; sendMail: jest.Mock }) {
    const built = build({ SETTINGS_ENCRYPTION_KEY: KEY }, row);
    (built.service as unknown as { transportFactory: unknown }).transportFactory = jest.fn(() => transport);
    return { ...built, factory: (built.service as unknown as { transportFactory: jest.Mock }).transportFactory };
  }

  it('từ chối email nhận ngoài miền FPT', async () => {
    const { service } = withTransport(dbRow, { verify: jest.fn(), sendMail: jest.fn() });
    await expect(service.sendTest('admin-1', { to: 'ai@gmail.com' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MAIL_TEST_RECIPIENT_NOT_ALLOWED' }),
    });
  });

  it('gửi bằng cấu hình đã lưu → verify + sendMail, cập nhật lastTestOk, audit', async () => {
    const transport = { verify: jest.fn().mockResolvedValue(true), sendMail: jest.fn().mockResolvedValue({}) };
    const { service, prisma, audit } = withTransport(dbRow, transport);
    const result = await service.sendTest('admin-1', { to: 'admin@fpt.edu.vn' });
    expect(result.ok).toBe(true);
    expect(result.usingSaved).toBe(true);
    expect(transport.verify).toHaveBeenCalled();
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@fpt.edu.vn', from: '"FCare" <fcare@fpt.edu.vn>' }),
    );
    expect(prisma.mailSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastTestOk: true }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MAIL_SETTINGS_TEST', metadata: { ok: true, usingSaved: true } }),
    );
  });

  it('gửi bằng bản nháp trên form → dùng draft, KHÔNG ghi lastTest', async () => {
    const transport = { verify: jest.fn().mockResolvedValue(true), sendMail: jest.fn().mockResolvedValue({}) };
    const { service, prisma, factory } = withTransport(dbRow, transport);
    const result = await service.sendTest('admin-1', {
      to: 'admin@fpt.edu.vn',
      draft: { host: 'smtp.draft.vn', port: 2525, secure: false, username: 'u', password: 'p', fromName: 'Nháp', fromEmail: 'nhap@fpt.edu.vn', enabled: true },
    });
    expect(result.usingSaved).toBe(false);
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.draft.vn', port: 2525, auth: { user: 'u', pass: 'p' } }));
    expect(prisma.mailSetting.update).not.toHaveBeenCalled();
  });

  it('draft bỏ trống password nhưng đã có mật khẩu lưu → dùng mật khẩu đã lưu', async () => {
    const saved = { ...dbRow, passwordEncrypted: encryptSecretForTest('saved-pass') };
    const transport = { verify: jest.fn().mockResolvedValue(true), sendMail: jest.fn().mockResolvedValue({}) };
    const { service, factory } = withTransport(saved, transport);
    await service.sendTest('admin-1', {
      to: 'admin@fpt.edu.vn',
      draft: { host: 'h', port: 587, secure: false, username: 'fcare@fpt.edu.vn', fromName: 'F', fromEmail: 'f@fpt.edu.vn', enabled: true },
    });
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ auth: { user: 'fcare@fpt.edu.vn', pass: 'saved-pass' } }));
  });

  it('SMTP lỗi → 400 MAIL_TEST_FAILED, message không chứa mật khẩu, lastTestOk=false', async () => {
    const transport = { verify: jest.fn().mockRejectedValue(new Error('535 Authentication failed for p@ss')), sendMail: jest.fn() };
    const { service, prisma } = withTransport({ ...dbRow, passwordEncrypted: encryptSecretForTest('p@ss') }, transport);
    await expect(service.sendTest('admin-1', { to: 'admin@fpt.edu.vn' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MAIL_TEST_FAILED' }),
    });
    const call = (prisma.mailSetting.update as jest.Mock).mock.calls[0][0];
    expect(call.data.lastTestOk).toBe(false);
  });
});
```

Thêm helper đầu file spec: `import { encryptSecret } from '../../common/utils/secret-cipher'; const encryptSecretForTest = (plain: string) => encryptSecret(plain, KEY);`

- [ ] **Step 3: Chạy → FAIL (`sendTest` không tồn tại)**

Run: `pnpm --filter @fcare/api exec jest src/modules/mail-settings/mail-settings.service.spec.ts`

- [ ] **Step 4: Implement `sendTest`**

Thêm vào `MailSettingsService`:

```ts
import { isAllowedStaffEmail } from '../../common/utils/staff-email';
import { createMailTransport, type MailTransportFactory } from './mail-transport.factory';

// field:
private transportFactory: MailTransportFactory = createMailTransport;

async sendTest(actorId: string, input: SendTestMailInput): Promise<SendTestMailResult> {
  const to = input.to.trim().toLowerCase();
  if (!isAllowedStaffEmail(to)) {
    throw new BadRequestException({
      code: 'MAIL_TEST_RECIPIENT_NOT_ALLOWED',
      message: 'Email nhận thử phải thuộc miền @fpt.edu.vn hoặc @fe.edu.vn.',
    });
  }
  const usingSaved = !input.draft;
  const config = input.draft ? await this.draftConfig(input.draft) : await this.getEffectiveConfig();
  const transport = this.transportFactory(config);
  const sentAt = new Date();
  try {
    await transport.verify();
    await transport.sendMail({
      from: this.formatFrom(config),
      to,
      subject: '[FCare] Mail thử cấu hình SMTP',
      text: `Hệ thống FCare đã gửi mail thử thành công lúc ${sentAt.toLocaleString('vi-VN')}. Máy chủ: ${config.host}:${config.port}.`,
    });
  } catch (error) {
    await this.recordTest(usingSaved, sentAt, false);
    await this.audit.log({ staffId: actorId, action: 'MAIL_SETTINGS_TEST', entity: 'MailSetting', entityId: SETTINGS_ID, metadata: { ok: false, usingSaved } });
    throw new BadRequestException({
      code: 'MAIL_TEST_FAILED',
      message: this.sanitizeSmtpError(error, config),
    });
  }
  await this.recordTest(usingSaved, sentAt, true);
  await this.audit.log({ staffId: actorId, action: 'MAIL_SETTINGS_TEST', entity: 'MailSetting', entityId: SETTINGS_ID, metadata: { ok: true, usingSaved } });
  return { ok: true, sentAt: sentAt.toISOString(), usingSaved };
}

/** Cấu hình từ form chưa lưu; password trống → mượn mật khẩu đã lưu (nếu có). */
private async draftConfig(draft: UpdateMailSettingsInput): Promise<EffectiveMailConfig> {
  const saved = await this.findRow();
  const pass = draft.password
    ?? (draft.clearPassword ? undefined : saved?.passwordEncrypted ? this.decryptOrWarn(saved.passwordEncrypted) : undefined);
  const user = draft.username?.trim();
  return {
    host: draft.host.trim(), port: draft.port, secure: draft.secure,
    auth: user && pass ? { user, pass } : null,
    fromName: draft.fromName.trim(), fromEmail: draft.fromEmail.trim().toLowerCase(),
    enabled: draft.enabled, source: 'DATABASE', version: this.version,
  };
}

private async recordTest(usingSaved: boolean, at: Date, ok: boolean): Promise<void> {
  if (!usingSaved) return;
  const row = await this.findRow();
  if (!row) return; // đang dùng env: không có dòng để ghi
  await this.prisma.mailSetting.update({ where: { id: SETTINGS_ID }, data: { lastTestedAt: at, lastTestOk: ok } });
}

private sanitizeSmtpError(error: unknown, config: EffectiveMailConfig): string {
  const raw = error instanceof Error ? error.message : 'Lỗi không xác định';
  const hidden = config.auth?.pass ? raw.split(config.auth.pass).join('***') : raw;
  return `Không gửi được mail thử: ${hidden.slice(0, 200)}`;
}
```

Thêm `SendTestMailInput`, `SendTestMailResult` vào `mail-settings.types.ts`.

- [ ] **Step 5: Chạy → PASS (12 passed)**

Run: `pnpm --filter @fcare/api exec jest src/modules/mail-settings`

---

### Task 6: DTO, controller, module, CASL, đăng ký app

**Files:**
- Create: `apps/api/src/modules/mail-settings/dto/mail-settings.dto.ts`
- Test: `apps/api/src/modules/mail-settings/dto/mail-settings.dto.spec.ts`
- Create: `apps/api/src/modules/mail-settings/mail-settings.controller.ts`
- Create: `apps/api/src/modules/mail-settings/mail-settings.module.ts`
- Modify: `apps/api/src/casl/ability.factory.ts:20-32`
- Modify: `apps/api/src/app.module.ts` (mảng imports, cạnh `AdminModule`)

**Interfaces:**
- Consumes: `MailSettingsService` (Task 4-5).
- Produces: route `GET /admin/mail-settings` → `MailSettingsView`; `PUT /admin/mail-settings` body `UpdateMailSettingsDto` → `MailSettingsView`; `POST /admin/mail-settings/test` body `SendTestMailDto { to; draft? }` → `SendTestMailResult`. CASL subject `'MailSettings'`.

- [ ] **Step 1: Test DTO RED**

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendTestMailDto, UpdateMailSettingsDto } from './mail-settings.dto';

async function errorsOf(cls: new () => object, body: unknown) {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((e) => e.property);
}

const valid = { host: ' smtp.office365.com ', port: 587, secure: false, username: 'a@fpt.edu.vn', password: 'x', fromName: 'FCare', fromEmail: 'a@fpt.edu.vn', enabled: true };

describe('UpdateMailSettingsDto', () => {
  it('hợp lệ và trim host', async () => {
    const dto = plainToInstance(UpdateMailSettingsDto, valid);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.host).toBe('smtp.office365.com');
  });
  it('port ngoài 1..65535, host rỗng, fromEmail sai → lỗi', async () => {
    expect(await errorsOf(UpdateMailSettingsDto, { ...valid, port: 70000 })).toContain('port');
    expect(await errorsOf(UpdateMailSettingsDto, { ...valid, host: '' })).toContain('host');
    expect(await errorsOf(UpdateMailSettingsDto, { ...valid, fromEmail: 'khong-phai-email' })).toContain('fromEmail');
  });
  it('username/password/clearPassword là tuỳ chọn', async () => {
    const { username, password, ...rest } = valid;
    expect(await errorsOf(UpdateMailSettingsDto, rest)).toHaveLength(0);
    expect(await errorsOf(UpdateMailSettingsDto, { ...rest, clearPassword: true })).toHaveLength(0);
  });
});

describe('SendTestMailDto', () => {
  it('bắt buộc to là email; draft nested được validate', async () => {
    expect(await errorsOf(SendTestMailDto, { to: 'not-email' })).toContain('to');
    expect(await errorsOf(SendTestMailDto, { to: 'a@fpt.edu.vn' })).toHaveLength(0);
    expect(await errorsOf(SendTestMailDto, { to: 'a@fpt.edu.vn', draft: { ...valid, port: 0 } })).toContain('draft');
  });
});
```

- [ ] **Step 2: Chạy → FAIL**

Run: `pnpm --filter @fcare/api exec jest src/modules/mail-settings/dto`

- [ ] **Step 3: DTO**

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class UpdateMailSettingsDto {
  @ApiProperty({ example: 'smtp.office365.com' })
  @trim() @IsString() @IsNotEmpty() @MaxLength(255)
  host!: string;

  @ApiProperty({ example: 587 })
  @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  port!: number;

  @ApiProperty({ description: 'true = TLS ngầm (cổng 465); false = STARTTLS/không mã hoá' })
  @IsBoolean()
  secure!: boolean;

  @ApiPropertyOptional()
  @IsOptional() @trim() @IsString() @MaxLength(255)
  username?: string | null;

  @ApiPropertyOptional({ description: 'Bỏ trống = giữ mật khẩu cũ' })
  @IsOptional() @IsString() @MaxLength(512)
  password?: string;

  @ApiPropertyOptional({ description: 'true = xoá mật khẩu đã lưu' })
  @IsOptional() @IsBoolean()
  clearPassword?: boolean;

  @ApiProperty({ example: 'FCare — Chăm sóc & Giám sát Học vụ' })
  @trim() @IsString() @IsNotEmpty() @MaxLength(120)
  fromName!: string;

  @ApiProperty({ example: 'fcare-noreply@fpt.edu.vn' })
  @trim() @IsEmail()
  fromEmail!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class SendTestMailDto {
  @ApiProperty({ example: 'admin@fpt.edu.vn' })
  @trim() @IsEmail()
  to!: string;

  @ApiPropertyOptional({ type: UpdateMailSettingsDto, description: 'Cấu hình đang nhập trên form (chưa lưu)' })
  @IsOptional() @ValidateNested() @Type(() => UpdateMailSettingsDto)
  draft?: UpdateMailSettingsDto;
}
```

- [ ] **Step 4: Controller + module**

```ts
// mail-settings.controller.ts
import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { SendTestMailDto, UpdateMailSettingsDto } from './dto/mail-settings.dto';
import { MailSettingsService } from './mail-settings.service';

/** Chỉ ADMIN (`manage all`) — CASL subject riêng để sau này tách quyền nếu cần. */
@ApiTags('admin')
@Controller('admin/mail-settings')
@CheckPolicies((ability: AppAbility) => ability.can('manage', 'MailSettings'))
export class MailSettingsController {
  constructor(private readonly mailSettings: MailSettingsService) {}

  @Get()
  get() {
    return this.mailSettings.getView();
  }

  @Put()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMailSettingsDto) {
    return this.mailSettings.update(user.id, dto);
  }

  @Post('test')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  sendTest(@CurrentUser() user: AuthUser, @Body() dto: SendTestMailDto) {
    return this.mailSettings.sendTest(user.id, dto);
  }
}
```

```ts
// mail-settings.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailSettingsController } from './mail-settings.controller';
import { MailSettingsService } from './mail-settings.service';

/** Cấu hình SMTP do ADMIN quản trị; `EmailModule` import module này để lấy config hiệu lực. */
@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [MailSettingsController],
  providers: [MailSettingsService],
  exports: [MailSettingsService],
})
export class MailSettingsModule {}
```

(`AuditService` đến từ `AuditModule` toàn cục — giống `AdminModule`; kiểm tra `grep -n "@Global" apps/api/src/audit/audit.module.ts`; nếu không global thì thêm `AuditModule` vào imports.)

- [ ] **Step 5: CASL + app.module**

`ability.factory.ts`: thêm `| 'MailSettings'` vào union `Subjects` (sau `'Staff'`). ADMIN đã `can('manage','all')` nên không cần thêm rule; các role khác không có → 403.

`app.module.ts`: import `MailSettingsModule` từ `./modules/mail-settings/mail-settings.module` và thêm vào mảng `imports` ngay sau `AdminModule`.

- [ ] **Step 6: Chạy test DTO + typecheck + lint api**

Run: `pnpm --filter @fcare/api exec jest src/modules/mail-settings && pnpm --filter @fcare/api typecheck && pnpm --filter @fcare/api lint`
Expected: PASS.

- [ ] **Step 7: Smoke thủ công qua Swagger (API dev đang chạy :3001)**

Đăng nhập admin (`admin` / `Fcare@123`), gọi `GET /api/admin/mail-settings` → `source: "ENV"`, `host: "localhost"`, không có key `password`. Đăng nhập LECTURER → 403.

---

### Task 7: `EmailService` dùng cấu hình hiệu lực

**Files:**
- Modify: `apps/api/src/modules/email/email.module.ts`
- Modify: `apps/api/src/modules/email/email.service.ts` (constructor, `sendMail`)
- Modify: `apps/api/src/modules/email/email.service.spec.ts`

**Interfaces:**
- Consumes: `MailSettingsService.getEffectiveConfig()`, `formatFrom()`, `createMailTransport`, `MailTransportFactory`.
- Produces: `EmailService` giữ nguyên chữ ký public (`sendMail`, `sendAlertEmail`, `sendCareLogEmail`, `sendDiscussionEmail`) — consumer không đổi.

- [ ] **Step 0: Reindex GitNexus + impact**

Run: `node .gitnexus/run.cjs analyze` rồi `impact({ repo: "Fcare", target: "EmailService", direction: "upstream" })`. Kỳ vọng callers: `NotificationDispatchService`, `CareLogsService`, `EmailProcessor`. Nếu có caller khác → dừng, báo user.

- [ ] **Step 1: Sửa spec RED**

Trong `email.service.spec.ts`: thay provider `ConfigService` mock bằng thêm provider `MailSettingsService` mock:

```ts
import { MailSettingsService } from '../mail-settings/mail-settings.service';

const effective = {
  host: 'mailhog', port: 1025, secure: false, auth: null,
  fromName: 'FCare', fromEmail: 'fcare-noreply@fpt.edu.vn', enabled: true, source: 'ENV' as const, version: 1,
};
const mailSettings = {
  getEffectiveConfig: jest.fn().mockResolvedValue(effective),
  formatFrom: jest.fn(() => '"FCare" <fcare-noreply@fpt.edu.vn>'),
};
// providers: [..., { provide: MailSettingsService, useValue: mailSettings }]
// thay dòng `(service as any).transporter = { sendMail: sendMailMock }` bằng:
(service as unknown as { transportFactory: unknown }).transportFactory = jest.fn(() => ({ sendMail: sendMailMock, verify: jest.fn() }));
```

Thêm 2 test:

```ts
it('enabled=false → không gửi, trả false', async () => {
  mailSettings.getEffectiveConfig.mockResolvedValueOnce({ ...effective, enabled: false });
  await expect(service.sendMail({ to: 'a@fpt.edu.vn', subject: 's', html: '<p/>' })).resolves.toBe(false);
  expect(sendMailMock).not.toHaveBeenCalled();
});

it('version đổi → tạo transporter mới; cùng version → dùng lại', async () => {
  const factory = (service as unknown as { transportFactory: jest.Mock }).transportFactory;
  await service.sendMail({ to: 'a@fpt.edu.vn', subject: 's', html: '<p/>' });
  await service.sendMail({ to: 'a@fpt.edu.vn', subject: 's', html: '<p/>' });
  expect(factory).toHaveBeenCalledTimes(1);
  mailSettings.getEffectiveConfig.mockResolvedValue({ ...effective, version: 2 });
  await service.sendMail({ to: 'a@fpt.edu.vn', subject: 's', html: '<p/>' });
  expect(factory).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Chạy → FAIL**

Run: `pnpm --filter @fcare/api exec jest src/modules/email`

- [ ] **Step 3: Implement**

`email.module.ts`: thêm `MailSettingsModule` vào `imports`.

`email.service.ts`:

```ts
import { MailSettingsService } from '../mail-settings/mail-settings.service';
import { createMailTransport, type MailTransport, type MailTransportFactory } from '../mail-settings/mail-transport.factory';

// Xoá: đọc SMTP_* trong constructor, field `transporter`, `defaultFrom`.
// Giữ: `webBaseUrl` từ ConfigService.
private transportFactory: MailTransportFactory = createMailTransport;
private cached: { version: number; transport: MailTransport } | null = null;

constructor(
  private readonly config: ConfigService,
  private readonly prisma: PrismaService,
  private readonly mailSettings: MailSettingsService,
) {
  this.webBaseUrl = this.config.get<string>('WEB_BASE_URL')
    ?? this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
}

private transportFor(config: EffectiveMailConfig): MailTransport {
  if (this.cached?.version === config.version) return this.cached.transport;
  const transport = this.transportFactory(config);
  this.cached = { version: config.version, transport };
  return transport;
}

async sendMail(options: SendMailOptions): Promise<boolean> {
  const recipients = (Array.isArray(options.to) ? options.to : [options.to]).filter((e) => e.includes('@'));
  if (recipients.length === 0) return false;
  const config = await this.mailSettings.getEffectiveConfig();
  if (!config.enabled) {
    this.logger.warn('Gửi mail đang TẮT trong cấu hình hệ thống — bỏ qua.');
    return false;
  }
  try {
    await this.transportFor(config).sendMail({
      from: this.mailSettings.formatFrom(config),
      to: recipients,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    this.logger.log(`Đã gửi mail "${options.subject}" tới ${recipients.length} người nhận`);
    return true;
  } catch (error) {
    this.logger.warn(`Gửi mail thất bại: ${(error as Error).message}`);
    return false;
  }
}
```

(Giữ nguyên phần còn lại: `sendAlertEmail`, `sendCareLogEmail`, `sendDiscussionEmail`, `resolveStaffEmails`.)

- [ ] **Step 4: Chạy test email + toàn bộ api**

Run: `pnpm --filter @fcare/api test`
Expected: PASS. Đặc biệt `notification-dispatch.service.spec`, `care-logs.service.spec` không đổi.

- [ ] **Step 5: Kiểm thử thật với MailHog**

`docker compose -f infra/docker/docker-compose.yml up -d mailhog`; qua Swagger `POST /api/admin/mail-settings/test` với `to: admin@fpt.edu.vn` (cấu hình env host `localhost:1025`) → mở http://localhost:8025 thấy mail "[FCare] Mail thử cấu hình SMTP".

---

### Task 8: Biến môi trường, docker-compose, tài liệu deploy

**Files:**
- Modify: `.env.example:29-32`
- Modify: `apps/api/.env` (thêm `SETTINGS_ENCRYPTION_KEY` dev)
- Modify: `infra/docker/docker-compose.yml` (service `api` → env)
- Modify: `docs/deploy-aapanel.md`

- [ ] **Step 1: `.env.example`**

```dotenv
# --- SMTP (dev: mailhog) — chỉ là fallback; ADMIN cấu hình thật tại /admin/mail ---
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM_NAME=FCare — Chăm sóc & Giám sát Học vụ
SMTP_FROM=fcare-noreply@fpt.edu.vn
# Khoá mã hoá bí mật cấu hình (mật khẩu SMTP lưu DB). 32 byte hex: `openssl rand -hex 32`
# Đổi khoá = mọi mật khẩu đã lưu không giải mã được → phải nhập lại ở /admin/mail.
SETTINGS_ENCRYPTION_KEY=
```

- [ ] **Step 2: `apps/api/.env` dev**

Run: `printf 'SETTINGS_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" >> apps/api/.env` (file này đã gitignored — kiểm tra `git check-ignore apps/api/.env`).

- [ ] **Step 3: docker-compose**

Service `api` → `environment`: thêm `SETTINGS_ENCRYPTION_KEY: ${SETTINGS_ENCRYPTION_KEY}` (đọc từ `.env` cạnh compose). Giữ `SMTP_HOST: mailhog`, `SMTP_PORT: 1025`.

- [ ] **Step 4: `docs/deploy-aapanel.md`**

Thêm mục "Cấu hình email": (1) sinh `SETTINGS_ENCRYPTION_KEY` bằng `openssl rand -hex 32`, đặt vào env của API, **không** đưa vào git; (2) sau khi deploy, ADMIN vào Hệ thống → Cấu hình email, nhập SMTP của trường, bấm "Gửi mail thử"; (3) cảnh báo đổi khoá phải nhập lại mật khẩu.

- [ ] **Step 5: Khởi động lại api dev**

Run: restart tiến trình `pnpm --filter @fcare/api dev` (Nest không reload `.env`), `GET /api/admin/mail-settings` → `encryptionReady: true`.

---

### Task 9: Web lib `mail-settings.ts` (logic thuần + Vitest)

**Files:**
- Create: `apps/web/src/lib/mail-settings.ts`
- Test: `apps/web/src/lib/mail-settings.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface MailSettingsView { host; port; secure; username: string | null; hasPassword; fromName; fromEmail; enabled; source: 'DATABASE'|'ENV'; encryptionReady; lastTestedAt: string|null; lastTestOk: boolean|null; updatedAt: string|null; updatedBy: {id; fullName}|null }
  export interface MailSettingsFormValues { host: string; port: string; secure: boolean; username: string; password: string; clearPassword: boolean; fromName: string; fromEmail: string; enabled: boolean }
  export interface MailPreset { key: 'mailhog'|'gmail'|'office365'; label: string; host: string; port: number; secure: boolean; hint: string }
  export const MAIL_PRESETS: readonly MailPreset[];
  export function toFormValues(view: MailSettingsView): MailSettingsFormValues;
  export function validateMailSettings(values: MailSettingsFormValues, view: Pick<MailSettingsView,'hasPassword'|'encryptionReady'>): Partial<Record<keyof MailSettingsFormValues, string>>;
  export function buildUpdatePayload(values: MailSettingsFormValues): UpdateMailSettingsPayload; // port → number, password rỗng → bỏ key
  export function isAllowedTestRecipient(email: string): boolean;
  export function describeTestState(view: MailSettingsView): { tone: 'muted'|'success'|'danger'; text: string };
  ```

- [ ] **Step 1: Test RED**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildUpdatePayload, describeTestState, isAllowedTestRecipient, MAIL_PRESETS,
  toFormValues, validateMailSettings, type MailSettingsView,
} from './mail-settings';

const view: MailSettingsView = {
  host: 'localhost', port: 1025, secure: false, username: null, hasPassword: false,
  fromName: 'FCare', fromEmail: 'fcare-noreply@fpt.edu.vn', enabled: true, source: 'ENV',
  encryptionReady: true, lastTestedAt: null, lastTestOk: null, updatedAt: null, updatedBy: null,
};

describe('toFormValues', () => {
  it('đổi số → chuỗi, null → rỗng, không mang mật khẩu', () => {
    expect(toFormValues(view)).toEqual({
      host: 'localhost', port: '1025', secure: false, username: '', password: '', clearPassword: false,
      fromName: 'FCare', fromEmail: 'fcare-noreply@fpt.edu.vn', enabled: true,
    });
  });
});

describe('validateMailSettings', () => {
  const ok = toFormValues(view);
  it('form từ view hợp lệ → không lỗi', () => {
    expect(validateMailSettings(ok, view)).toEqual({});
  });
  it('host rỗng, port không phải số 1..65535, fromEmail sai', () => {
    const errors = validateMailSettings({ ...ok, host: ' ', port: '99999', fromEmail: 'x' }, view);
    expect(Object.keys(errors).sort()).toEqual(['fromEmail', 'host', 'port']);
  });
  it('có username mà không có mật khẩu (mới lẫn đã lưu) → lỗi password', () => {
    expect(validateMailSettings({ ...ok, username: 'u' }, view)).toHaveProperty('password');
    expect(validateMailSettings({ ...ok, username: 'u' }, { ...view, hasPassword: true })).toEqual({});
    expect(validateMailSettings({ ...ok, username: 'u', clearPassword: true }, { ...view, hasPassword: true })).toHaveProperty('password');
  });
  it('nhập mật khẩu khi máy chủ chưa có khoá mã hoá → lỗi password', () => {
    expect(validateMailSettings({ ...ok, username: 'u', password: 'p' }, { ...view, encryptionReady: false })).toHaveProperty('password');
  });
});

describe('buildUpdatePayload', () => {
  it('port thành số, password rỗng bị bỏ, username rỗng → null', () => {
    const payload = buildUpdatePayload(toFormValues(view));
    expect(payload.port).toBe(1025);
    expect(payload).not.toHaveProperty('password');
    expect(payload.username).toBeNull();
    expect(payload.clearPassword).toBeUndefined();
  });
  it('clearPassword=true được gửi, password bị bỏ', () => {
    const payload = buildUpdatePayload({ ...toFormValues(view), password: 'abc', clearPassword: true });
    expect(payload.clearPassword).toBe(true);
    expect(payload).not.toHaveProperty('password');
  });
});

describe('MAIL_PRESETS', () => {
  it('có MailHog/Gmail/Office 365 với cổng chuẩn', () => {
    expect(MAIL_PRESETS.map((p) => [p.key, p.port, p.secure])).toEqual([
      ['mailhog', 1025, false], ['gmail', 465, true], ['office365', 587, false],
    ]);
  });
});

describe('isAllowedTestRecipient', () => {
  it('chỉ miền FPT/FE', () => {
    expect(isAllowedTestRecipient('a@fpt.edu.vn')).toBe(true);
    expect(isAllowedTestRecipient('A@FE.EDU.VN')).toBe(true);
    expect(isAllowedTestRecipient('a@gmail.com')).toBe(false);
  });
});

describe('describeTestState', () => {
  it('chưa thử / thành công / thất bại', () => {
    expect(describeTestState(view).tone).toBe('muted');
    expect(describeTestState({ ...view, lastTestedAt: '2026-09-16T01:00:00Z', lastTestOk: true }).tone).toBe('success');
    expect(describeTestState({ ...view, lastTestedAt: '2026-09-16T01:00:00Z', lastTestOk: false }).tone).toBe('danger');
  });
});
```

- [ ] **Step 2: Chạy → FAIL**

Run: `pnpm --filter @fcare/web exec vitest run src/lib/mail-settings.test.ts`

- [ ] **Step 3: Implement**

```ts
/**
 * Logic thuần cho trang /admin/mail: chuyển đổi view ↔ form, validate phía client
 * (API vẫn validate lại), preset SMTP phổ biến. Không gọi mạng để test được bằng Vitest.
 */
export interface MailSettingsView { /* như Interfaces */ }
export interface MailSettingsFormValues { /* như Interfaces */ }
export interface UpdateMailSettingsPayload {
  host: string; port: number; secure: boolean; username: string | null;
  password?: string; clearPassword?: boolean; fromName: string; fromEmail: string; enabled: boolean;
}
export interface MailPreset { key: 'mailhog' | 'gmail' | 'office365'; label: string; host: string; port: number; secure: boolean; hint: string }

export const MAIL_PRESETS: readonly MailPreset[] = [
  { key: 'mailhog', label: 'MailHog (dev)', host: 'localhost', port: 1025, secure: false, hint: 'Hộp thư giả lập, xem tại http://localhost:8025' },
  { key: 'gmail', label: 'Gmail / Google Workspace', host: 'smtp.gmail.com', port: 465, secure: true, hint: 'Dùng "Mật khẩu ứng dụng", không dùng mật khẩu tài khoản' },
  { key: 'office365', label: 'Microsoft 365', host: 'smtp.office365.com', port: 587, secure: false, hint: 'STARTTLS cổng 587; tài khoản phải bật SMTP AUTH' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_DOMAINS = ['fpt.edu.vn', 'fe.edu.vn'];

export function toFormValues(view: MailSettingsView): MailSettingsFormValues {
  return {
    host: view.host, port: String(view.port), secure: view.secure, username: view.username ?? '',
    password: '', clearPassword: false, fromName: view.fromName, fromEmail: view.fromEmail, enabled: view.enabled,
  };
}

export function validateMailSettings(
  values: MailSettingsFormValues,
  view: Pick<MailSettingsView, 'hasPassword' | 'encryptionReady'>,
): Partial<Record<keyof MailSettingsFormValues, string>> {
  const errors: Partial<Record<keyof MailSettingsFormValues, string>> = {};
  if (!values.host.trim()) errors.host = 'Nhập địa chỉ máy chủ SMTP.';
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.port = 'Cổng phải là số từ 1 đến 65535.';
  if (!values.fromName.trim()) errors.fromName = 'Nhập tên người gửi.';
  if (!EMAIL_RE.test(values.fromEmail.trim())) errors.fromEmail = 'Email người gửi không hợp lệ.';
  const hasUser = values.username.trim().length > 0;
  const willHavePassword = values.password.length > 0 || (view.hasPassword && !values.clearPassword);
  if (hasUser && !willHavePassword) errors.password = 'Tài khoản SMTP cần mật khẩu.';
  if (values.password.length > 0 && !view.encryptionReady) {
    errors.password = 'Máy chủ chưa có SETTINGS_ENCRYPTION_KEY — liên hệ kỹ thuật trước khi lưu mật khẩu.';
  }
  return errors;
}

export function buildUpdatePayload(values: MailSettingsFormValues): UpdateMailSettingsPayload {
  const base: UpdateMailSettingsPayload = {
    host: values.host.trim(), port: Number(values.port), secure: values.secure,
    username: values.username.trim() || null, fromName: values.fromName.trim(),
    fromEmail: values.fromEmail.trim(), enabled: values.enabled,
  };
  if (values.clearPassword) return { ...base, clearPassword: true };
  return values.password ? { ...base, password: values.password } : base;
}

export function isAllowedTestRecipient(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return ALLOWED_DOMAINS.includes(domain);
}

export function describeTestState(view: MailSettingsView): { tone: 'muted' | 'success' | 'danger'; text: string } {
  if (!view.lastTestedAt) return { tone: 'muted', text: 'Chưa gửi mail thử với cấu hình đã lưu.' };
  const when = new Date(view.lastTestedAt).toLocaleString('vi-VN');
  return view.lastTestOk
    ? { tone: 'success', text: `Gửi thử thành công lúc ${when}.` }
    : { tone: 'danger', text: `Gửi thử thất bại lúc ${when} — kiểm tra lại máy chủ/tài khoản.` };
}
```

- [ ] **Step 4: Chạy → PASS (10 passed)**

Run: `pnpm --filter @fcare/web exec vitest run src/lib/mail-settings.test.ts`

---

### Task 10: Trang `/admin/mail` + component + nav

**Files:**
- Create: `apps/web/src/app/(dashboard)/admin/mail/page.tsx`
- Create: `apps/web/src/components/admin/mail-status-card.tsx`
- Create: `apps/web/src/components/admin/mail-settings-form.tsx`
- Create: `apps/web/src/components/admin/mail-test-panel.tsx`
- Modify: `apps/web/src/components/dashboard/nav-icons.tsx` (thêm `IconMail` sau `IconSettings`)
- Modify: `apps/web/src/components/dashboard/nav-tree.ts:4-17,130-132`
- Modify: `apps/web/src/components/dashboard/nav-tree.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `useMe`, `PageHeader`, `Button`/`SurfaceCard`/`Badge` (ui-kit), `Input`/`Label`/`Select`/`FormError`/`FormSuccess`, lib Task 9.
- Produces: route `/admin/mail`; `MailSettingsForm({ view, onSaved })`, `MailTestPanel({ currentValues, view })`, `MailStatusCard({ view })`.

- [ ] **Step 1: Test nav RED (thêm vào `nav-tree.test.ts`)**

```ts
it('ADMIN thấy "Cấu hình email" trong nhóm Hệ thống, role khác không thấy', () => {
  const admin = buildNavSections(user(['ADMIN']));
  const system = admin.find((section) => section.id === 'system');
  expect(hrefs(system?.items ?? [])).toContain('/admin/mail');
  const lecturer = buildNavSections(user(['LECTURER']));
  expect(lecturer.flatMap((section) => hrefs(section.items))).not.toContain('/admin/mail');
});
```

Run: `pnpm --filter @fcare/web exec vitest run src/components/dashboard/nav-tree.test.ts` → FAIL.

- [ ] **Step 2: Icon + nav**

`nav-icons.tsx`:

```tsx
/** Phong bì — cấu hình email hệ thống. */
export const IconMail: NavIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2.2" />
    <path d="m3.8 7 7.3 5.4a1.5 1.5 0 0 0 1.8 0L20.2 7" />
  </Icon>
);
```

`nav-tree.ts`: import `IconMail`; sau dòng push `/admin/users` thêm:

```ts
    system.push({ kind: 'leaf', href: '/admin/mail', label: 'Cấu hình email', icon: IconMail });
```

Run test nav → PASS.

- [ ] **Step 3: `mail-status-card.tsx`**

```tsx
'use client';

import { Badge, SurfaceCard } from '@fcare/ui-kit';
import { describeTestState, type MailSettingsView } from '../../lib/mail-settings';

/** Thẻ tóm tắt: nguồn cấu hình, trạng thái gửi, lần thử gần nhất, người sửa. */
export function MailStatusCard({ view }: { view: MailSettingsView }) {
  const test = describeTestState(view);
  return (
    <SurfaceCard className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={view.enabled ? 'success' : 'warning'}>{view.enabled ? 'Đang gửi mail' : 'Đã tắt gửi mail'}</Badge>
        <Badge tone={view.source === 'DATABASE' ? 'info' : 'neutral'}>
          {view.source === 'DATABASE' ? 'Cấu hình trong hệ thống' : 'Đang dùng biến môi trường'}
        </Badge>
        {!view.encryptionReady ? <Badge tone="danger">Thiếu khoá mã hoá</Badge> : null}
      </div>
      <p className={`text-sm ${test.tone === 'danger' ? 'text-danger' : test.tone === 'success' ? 'text-success' : 'text-muted'}`}>{test.text}</p>
      <p className="text-xs text-muted">
        {view.updatedBy ? `Cập nhật bởi ${view.updatedBy.fullName} · ${new Date(view.updatedAt ?? '').toLocaleString('vi-VN')}` : 'Chưa ai lưu cấu hình trong hệ thống.'}
      </p>
    </SurfaceCard>
  );
}
```

(`Badge` ui-kit nhận `tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral'` — đã khớp.)

Skeleton khi loading (đặt trong page): 1 thẻ cao 96px + 1 form 6 hàng `animate-pulse bg-border/60 rounded-[var(--radius-card)]`.

- [ ] **Step 4: `mail-settings-form.tsx`**

```tsx
'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import {
  buildUpdatePayload, MAIL_PRESETS, toFormValues, validateMailSettings,
  type MailSettingsFormValues, type MailSettingsView,
} from '../../lib/mail-settings';
import { FormError, FormSuccess, Input, Label } from '../ui/form';

interface MailSettingsFormProps {
  view: MailSettingsView;
  onValuesChange: (values: MailSettingsFormValues) => void;
}

export function MailSettingsForm({ view, onValuesChange }: MailSettingsFormProps) {
  const queryClient = useQueryClient();
  const [values, setValuesState] = useState<MailSettingsFormValues>(() => toFormValues(view));
  const [errors, setErrors] = useState<Partial<Record<keyof MailSettingsFormValues, string>>>({});
  const [serverError, setServerError] = useState('');
  const [saved, setSaved] = useState(false);

  function setValues(patch: Partial<MailSettingsFormValues>) {
    const next = { ...values, ...patch };
    setValuesState(next);
    onValuesChange(next);
    setSaved(false);
  }

  const saveMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof buildUpdatePayload>) =>
      apiFetch<MailSettingsView>('/admin/mail-settings', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: async (next) => {
      setServerError('');
      setSaved(true);
      setValuesState(toFormValues(next));
      onValuesChange(toFormValues(next));
      await queryClient.invalidateQueries({ queryKey: ['admin', 'mail-settings'] });
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra.'),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateMailSettings(values, view);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    saveMutation.mutate(buildUpdatePayload(values));
  }

  function applyPreset(key: string) {
    const preset = MAIL_PRESETS.find((p) => p.key === key);
    if (preset) setValues({ host: preset.host, port: String(preset.port), secure: preset.secure });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-labelledby="mail-form-heading">
      <h2 id="mail-form-heading" className="font-display text-lg font-semibold text-fpt-blue-900">Máy chủ gửi mail</h2>
      <FormError>{serverError}</FormError>
      {saved ? <FormSuccess>Đã lưu cấu hình. Mail mới sẽ dùng cấu hình này ngay.</FormSuccess> : null}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Mẫu cấu hình nhanh">
        {MAIL_PRESETS.map((preset) => (
          <Button key={preset.key} type="button" variant="ghost" onClick={() => applyPreset(preset.key)} title={preset.hint}>
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Label htmlFor="host">Máy chủ SMTP</Label>
          <Input id="host" value={values.host} onChange={(e) => setValues({ host: e.target.value })} aria-invalid={Boolean(errors.host)} />
          {errors.host ? <p className="mt-1 text-xs text-danger">{errors.host}</p> : null}
        </div>
        <div>
          <Label htmlFor="port">Cổng</Label>
          <Input id="port" inputMode="numeric" value={values.port} onChange={(e) => setValues({ port: e.target.value })} aria-invalid={Boolean(errors.port)} />
          {errors.port ? <p className="mt-1 text-xs text-danger">{errors.port}</p> : null}
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={values.secure} onChange={(e) => setValues({ secure: e.target.checked })} />
          TLS ngầm (465)
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="username">Tài khoản SMTP</Label>
          <Input id="username" autoComplete="off" value={values.username} onChange={(e) => setValues({ username: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="password">Mật khẩu SMTP</Label>
          <Input id="password" type="password" autoComplete="new-password"
            placeholder={view.hasPassword ? '•••••••• (đã lưu — bỏ trống để giữ)' : 'Chưa có mật khẩu'}
            value={values.password} onChange={(e) => setValues({ password: e.target.value })} aria-invalid={Boolean(errors.password)} />
          {errors.password ? <p className="mt-1 text-xs text-danger">{errors.password}</p> : null}
          {view.hasPassword ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={values.clearPassword} onChange={(e) => setValues({ clearPassword: e.target.checked })} />
              Xoá mật khẩu đã lưu
            </label>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="fromName">Tên người gửi</Label>
          <Input id="fromName" value={values.fromName} onChange={(e) => setValues({ fromName: e.target.value })} aria-invalid={Boolean(errors.fromName)} />
          {errors.fromName ? <p className="mt-1 text-xs text-danger">{errors.fromName}</p> : null}
        </div>
        <div>
          <Label htmlFor="fromEmail">Email người gửi</Label>
          <Input id="fromEmail" value={values.fromEmail} onChange={(e) => setValues({ fromEmail: e.target.value })} aria-invalid={Boolean(errors.fromEmail)} />
          {errors.fromEmail ? <p className="mt-1 text-xs text-danger">{errors.fromEmail}</p> : null}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={values.enabled} onChange={(e) => setValues({ enabled: e.target.checked })} />
        Bật gửi email từ hệ thống (tắt = chỉ thông báo trong ứng dụng)
      </label>

      <div className="flex justify-end">
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Đang lưu…' : 'Lưu cấu hình'}
        </Button>
      </div>
    </form>
  );
}
```

(`Button` ui-kit chỉ có `variant: primary | secondary | ghost | danger`, không có `size`. Checkbox dùng class focus ring token: thêm `className="accent-fpt-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange"`.)

- [ ] **Step 5: `mail-test-panel.tsx`**

```tsx
'use client';

import { Button, SurfaceCard } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { buildUpdatePayload, isAllowedTestRecipient, type MailSettingsFormValues } from '../../lib/mail-settings';
import { FormError, FormSuccess, Input, Label } from '../ui/form';

interface MailTestPanelProps {
  /** Giá trị đang nhập trên form — gửi thử bằng bản nháp, không cần lưu trước. */
  currentValues: MailSettingsFormValues;
  dirty: boolean;
}

export function MailTestPanel({ currentValues, dirty }: MailTestPanelProps) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const testMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true; sentAt: string; usingSaved: boolean }>('/admin/mail-settings/test', {
        method: 'POST',
        body: JSON.stringify(dirty ? { to, draft: buildUpdatePayload(currentValues) } : { to }),
      }),
    onSuccess: async (result) => {
      setError('');
      setSuccess(`Đã gửi mail thử tới ${to} lúc ${new Date(result.sentAt).toLocaleTimeString('vi-VN')}${result.usingSaved ? '' : ' (bằng cấu hình chưa lưu)'}.`);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'mail-settings'] });
    },
    onError: (err) => { setSuccess(''); setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra.'); },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAllowedTestRecipient(to)) {
      setError('Email nhận thử phải thuộc miền @fpt.edu.vn hoặc @fe.edu.vn.');
      return;
    }
    testMutation.mutate();
  }

  return (
    <SurfaceCard className="space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-fpt-blue-900">Gửi mail thử</h2>
        <p className="mt-1 text-sm text-muted">
          {dirty ? 'Sẽ thử bằng cấu hình đang nhập (chưa lưu).' : 'Sẽ thử bằng cấu hình đã lưu.'} Tối đa 5 lần/phút.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <FormError>{error}</FormError>
        {success ? <FormSuccess>{success}</FormSuccess> : null}
        <div>
          <Label htmlFor="test-to">Gửi tới</Label>
          <Input id="test-to" type="email" placeholder="ten@fpt.edu.vn" value={to} onChange={(e) => setTo(e.target.value)} required />
        </div>
        <Button type="submit" variant="secondary" disabled={testMutation.isPending || !to}>
          {testMutation.isPending ? 'Đang gửi…' : 'Gửi mail thử'}
        </Button>
      </form>
    </SurfaceCard>
  );
}
```

- [ ] **Step 6: `page.tsx`**

```tsx
'use client';

import { SurfaceCard } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { MailSettingsForm } from '../../../../components/admin/mail-settings-form';
import { MailStatusCard } from '../../../../components/admin/mail-status-card';
import { MailTestPanel } from '../../../../components/admin/mail-test-panel';
import { PageHeader } from '../../../../components/ui/page-header';
import { apiFetch } from '../../../../lib/api';
import { useMe } from '../../../../lib/hooks';
import { toFormValues, type MailSettingsFormValues, type MailSettingsView } from '../../../../lib/mail-settings';

function isDirty(a: MailSettingsFormValues, b: MailSettingsFormValues): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export default function AdminMailPage() {
  const { data: me } = useMe();
  const isAdmin = me?.roles.includes('ADMIN') ?? false;
  const { data: view, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'mail-settings'],
    queryFn: () => apiFetch<MailSettingsView>('/admin/mail-settings'),
    enabled: isAdmin,
  });
  const [draft, setDraft] = useState<MailSettingsFormValues | null>(null);

  if (me && !isAdmin) {
    return (
      <SurfaceCard className="p-8 text-center">
        <p className="text-3xl">🔒</p>
        <p className="mt-2 font-medium text-ink">Chỉ quản trị viên mới cấu hình được email hệ thống.</p>
      </SurfaceCard>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cấu hình email"
        description="Máy chủ SMTP dùng để gửi cảnh báo, nhật ký chăm sóc và trao đổi cho giảng viên."
      />
      {isLoading || !view ? (
        isError ? (
          <SurfaceCard className="p-8 text-center">
            <p className="text-3xl">⚠️</p>
            <p className="mt-2 text-sm text-muted">Không tải được cấu hình. <button className="text-fpt-blue underline" onClick={() => refetch()}>Thử tải lại</button></p>
          </SurfaceCard>
        ) : (
          <div className="space-y-6" aria-busy="true">
            <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-border/60" />
            <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-border/60" />
          </div>
        )
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <SurfaceCard className="p-6">
            <MailSettingsForm key={view.updatedAt ?? 'env'} view={view} onValuesChange={setDraft} />
          </SurfaceCard>
          <div className="space-y-6">
            <MailStatusCard view={view} />
            <MailTestPanel currentValues={draft ?? toFormValues(view)} dirty={draft ? isDirty(draft, toFormValues(view)) : false} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Typecheck + lint web, xem tay**

Run: `pnpm --filter @fcare/web typecheck && pnpm --filter @fcare/web lint`
Mở http://localhost:3000/admin/mail bằng admin: thấy badge "Đang dùng biến môi trường", chọn preset MailHog, lưu → badge đổi "Cấu hình trong hệ thống"; gửi thử tới `admin@fpt.edu.vn` → thấy ở MailHog :8025. Đăng nhập GV → thẻ khoá, sidebar không có mục.

Checklist design-taste: 1 CTA cam (Lưu cấu hình), nút thử là `secondary`; empty/loading/error đủ; focus ring token; chụp 320/768/1440 không tràn.

---

### Task 11: Playwright e2e (API mock)

**Files:**
- Create: `apps/web/e2e/admin-mail-settings.spec.ts`

- [ ] **Step 1: Viết test**

```ts
import { expect, test, type Page } from '@playwright/test';

/** /admin/mail — toàn bộ API mock qua page.route: xem, lưu, gửi thử, chặn role thường. */
const me = (role: string) => ({
  user: { id: 'u1', staffCode: 'admin', fullName: 'Quản trị', roles: [role], departmentId: null, consented: true, mustChangePassword: false },
  requiresConsent: false, mustChangePassword: false,
});
const envView = {
  host: 'localhost', port: 1025, secure: false, username: null, hasPassword: false,
  fromName: 'FCare', fromEmail: 'fcare-noreply@fpt.edu.vn', enabled: true, source: 'ENV',
  encryptionReady: true, lastTestedAt: null, lastTestOk: null, updatedAt: null, updatedBy: null,
};

async function mockSession(page: Page, role: string, calls: { put: unknown[]; test: unknown[] }) {
  await page.context().addCookies([{ name: 'fcare_refresh', value: 'e2e-mock', url: 'http://localhost:3000' }]);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let data: unknown = [];
    if (path.endsWith('/auth/me')) data = me(role);
    else if (path.endsWith('/unread-count')) data = { count: 0 };
    else if (path.endsWith('/admin/mail-settings') && method === 'GET') data = envView;
    else if (path.endsWith('/admin/mail-settings') && method === 'PUT') {
      calls.put.push(route.request().postDataJSON());
      data = { ...envView, host: 'smtp.office365.com', port: 587, source: 'DATABASE', updatedAt: '2026-09-16T01:00:00Z', updatedBy: { id: 'u1', fullName: 'Quản trị' } };
    } else if (path.endsWith('/admin/mail-settings/test')) {
      calls.test.push(route.request().postDataJSON());
      data = { ok: true, sentAt: '2026-09-16T01:00:00Z', usingSaved: true };
    }
    await route.fulfill({ json: { success: true, data, error: null } });
  });
}

test('admin lưu cấu hình SMTP và gửi mail thử', async ({ page }) => {
  const calls = { put: [] as unknown[], test: [] as unknown[] };
  await mockSession(page, 'ADMIN', calls);
  await page.goto('/admin/mail');
  await expect(page.getByRole('heading', { name: 'Cấu hình email' })).toBeVisible();
  await expect(page.getByText('Đang dùng biến môi trường')).toBeVisible();

  await page.getByRole('button', { name: 'Microsoft 365' }).click();
  await expect(page.getByLabel('Máy chủ SMTP')).toHaveValue('smtp.office365.com');
  await page.getByLabel('Tài khoản SMTP').fill('fcare@fpt.edu.vn');
  await page.getByLabel('Mật khẩu SMTP').fill('app-secret');
  await page.getByRole('button', { name: 'Lưu cấu hình' }).click();
  await expect(page.getByText('Đã lưu cấu hình.')).toBeVisible();
  expect(calls.put[0]).toMatchObject({ host: 'smtp.office365.com', port: 587, username: 'fcare@fpt.edu.vn', password: 'app-secret' });
  await expect(page.getByText('Cấu hình trong hệ thống')).toBeVisible();

  await page.getByLabel('Gửi tới').fill('ai@gmail.com');
  await page.getByRole('button', { name: 'Gửi mail thử' }).click();
  await expect(page.getByText('phải thuộc miền @fpt.edu.vn')).toBeVisible();
  expect(calls.test).toHaveLength(0);

  await page.getByLabel('Gửi tới').fill('admin@fpt.edu.vn');
  await page.getByRole('button', { name: 'Gửi mail thử' }).click();
  await expect(page.getByText(/Đã gửi mail thử tới admin@fpt.edu.vn/)).toBeVisible();
  expect(calls.test[0]).toMatchObject({ to: 'admin@fpt.edu.vn' });
});

test('giảng viên không thấy menu và bị chặn ở /admin/mail', async ({ page }) => {
  await mockSession(page, 'LECTURER', { put: [], test: [] });
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Cấu hình email' })).toHaveCount(0);
  await page.goto('/admin/mail');
  await expect(page.getByText('Chỉ quản trị viên mới cấu hình được email hệ thống.')).toBeVisible();
});
```

- [ ] **Step 2: Chạy**

Run: `E2E_BASE_URL=http://localhost:3000 pnpm --filter @fcare/web exec playwright test e2e/admin-mail-settings.spec.ts --project=chromium`
Expected: 2 passed. (Dev server :3000 đang chạy nên dùng `E2E_BASE_URL` để Playwright không tự khởi động server.)

---

### Task 12: Tài liệu, memory, verify toàn repo

**Files:**
- Modify: `README.md:75-76`
- Modify: `CLAUDE.md` (mục "Quy ước kiến trúc")
- Modify: memory `fcare-stack-decisions.md` + `MEMORY.md`

- [ ] **Step 1: README** — thay câu "admin không có luồng email" bằng: "Email: ADMIN cấu hình SMTP tại Hệ thống → Cấu hình email (`/admin/mail`); chưa cấu hình thì dùng `SMTP_*` trong env (dev: MailHog :8025). Cần `SETTINGS_ENCRYPTION_KEY` (32 byte hex) để lưu mật khẩu SMTP."

- [ ] **Step 2: CLAUDE.md** — thêm bullet vào "Quy ước kiến trúc":

```md
- **Cấu hình mail**: `MailSettingsService.getEffectiveConfig()` (DB `mail_settings` singleton → fallback env `SMTP_*`) là nguồn duy nhất; `EmailService` KHÔNG tự đọc `SMTP_*`. Mật khẩu SMTP mã hoá AES-256-GCM bằng `SETTINGS_ENCRYPTION_KEY`, API chỉ trả `hasPassword`. Key trả về đặt `fromEmail`/`username` — KHÔNG đặt `fromAddress`/`email` vì `PiiGuardInterceptor` xoá. Chỉ ADMIN (`manage MailSettings`).
```

- [ ] **Step 3: Memory** — cập nhật `fcare-stack-decisions.md`: thêm dòng "Mail: cấu hình trong DB (singleton) + env fallback; AES-256-GCM với SETTINGS_ENCRYPTION_KEY; đổi khoá phải nhập lại mật khẩu; tên key tránh PiiGuard (`fromEmail`)".

- [ ] **Step 4: Verify toàn repo**

Run: `lsof -i :3000` (nếu `next dev` đang chạy → dừng trước khi build web hoặc bỏ qua bước build web và báo rõ), rồi `pnpm typecheck && pnpm lint && pnpm build && pnpm test`.
Expected: tất cả xanh. Chạy `detect_changes()` (GitNexus) — phạm vi mong đợi: module `mail-settings`, `email`, `admin.service` (1 dòng), `ability.factory`, `app.module`, web `admin/mail`, `nav-*`, `lib/mail-settings`.

- [ ] **Step 5: Báo cáo** — không commit; liệt kê file thay đổi + kết quả test + hướng dẫn user sinh `SETTINGS_ENCRYPTION_KEY` cho prod.

---

## Rủi ro

| Mức | Rủi ro | Giảm thiểu |
|---|---|---|
| CAO | Mất/đổi `SETTINGS_ENCRYPTION_KEY` → mật khẩu SMTP đã lưu không giải mã được, mail lặng lẽ thất bại | `decryptOrWarn` log warn + `sendTest` báo lỗi; UI badge "Thiếu khoá mã hoá"; docs deploy nhấn mạnh sao lưu khoá |
| CAO | `PiiGuardInterceptor` xoá field trả về nếu đặt tên sai (`fromAddress`, `email`) | Global Constraint + test service không dùng key cấm; smoke Swagger ở Task 6 |
| TRUNG BÌNH | Endpoint test là vector spam/thăm dò SMTP nội bộ | Chỉ ADMIN, throttle 5/phút, người nhận chỉ miền FPT, audit mọi lần thử |
| TRUNG BÌNH | Lỗi SMTP trả về có thể chứa mật khẩu (một số server echo) | `sanitizeSmtpError` thay mật khẩu bằng `***`, cắt 200 ký tự |
| TRUNG BÌNH | `email.service.spec` và consumer đang inject `transporter` trực tiếp | Task 7 đổi sang `transportFactory`; chạy full `pnpm --filter @fcare/api test` |
| THẤP | Cache 60s khiến nhiều instance API (nếu scale ngang) lệch cấu hình tối đa 60s | Chấp nhận; ghi chú trong CLAUDE.md |
| THẤP | Prisma `@default("default")` cho id string | Đã dùng ở migration SQL `DEFAULT 'default'`; service luôn truyền id tường minh |

## Ước lượng độ phức tạp: **TRUNG BÌNH**
- API (Task 1–8): ~5–6 giờ
- Web (Task 9–11): ~3–4 giờ
- Docs + verify (Task 12): ~0.5 giờ
- Tổng: ~9–10 giờ

## Self-review
- **Spec coverage**: cấu hình SMTP (T1,4,6,10) ✓; mật khẩu an toàn (T2,4) ✓; gửi thử (T5,10) ✓; hệ thống dùng cấu hình mới (T7) ✓; chỉ ADMIN (T6 CASL, T10 gate, T11 e2e) ✓; env/deploy (T8) ✓; docs (T12) ✓.
- **Placeholder scan**: mọi bước có code; chỗ "kiểm tra prop thật của Badge/Button" là hướng dẫn xác minh, không phải TBD.
- **Type consistency**: `MailSettingsView` (T4 api ↔ T9 web) cùng field; `UpdateMailSettingsInput` (T4) = `UpdateMailSettingsDto` (T6) = `UpdateMailSettingsPayload` (T9); `SendTestMailInput { to, draft? }` khớp body `{ to, draft }` ở T10; `transportFactory` tên field dùng ở T5 và T7; `EffectiveMailConfig.version` dùng ở T4 và T7; `formatFrom` T4 → T5, T7.
