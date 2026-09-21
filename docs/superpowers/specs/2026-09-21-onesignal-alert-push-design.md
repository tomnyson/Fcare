# Push thông báo cảnh báo lên trình duyệt (OneSignal) + âm thanh

Ngày: 2026-09-21 · Trạng thái: chờ duyệt spec

## Mục tiêu

Cảnh báo **cấp 3 (Cao) và cấp 4 (Khẩn cấp)** phải tới được người nhận ngay cả khi họ đã đóng tab FCare:
popup của hệ điều hành qua Web Push (OneSignal), kèm âm thanh riêng của FCare khi tab còn mở.

## Quyết định đã chốt

| Vấn đề | Chốt |
|---|---|
| Phạm vi | Web Push thật — hoạt động cả khi đóng tab |
| Loại thông báo | Chỉ thông báo gắn cảnh báo (`source.kind = 'alert'`), `alert.level >= 3`. Gồm cả cảnh báo điểm danh tự động cấp 3 |
| Nội dung popup | Đầy đủ như trong app (tiêu đề + nội dung, có tên + mã SV) |
| Dịch vụ | OneSignal (user chọn thay cho `web-push` tự host) |
| Âm thanh | Tiếng riêng (Web Audio) chỉ phát khi tab mở (giới hạn của trình duyệt); khi đóng tab dùng âm mặc định của hệ điều hành |

### Hệ quả bảo mật (đã chấp nhận)

OneSignal đọc và lưu nội dung thông báo (lịch sử gửi trên dashboard, máy chủ ở Mỹ), nên tên + mã sinh viên
sẽ nằm ở đó. Hai trường này KHÔNG thuộc danh sách PII cấm (CCCD, SĐT, email, địa chỉ) → không vi phạm rule 1.
Định danh cán bộ gửi sang OneSignal chỉ là `external_id = staff.id` (UUID) — không gửi email/tên cán bộ.
Nội dung thông báo vẫn phải đi qua đúng các chặn PII hiện có (tiêu đề/nội dung sinh từ server, không chứa PII).

## Cấu hình

| Biến | Nơi | Ghi chú |
|---|---|---|
| `ONESIGNAL_APP_ID` | `apps/api/.env`, `env.production` | Công khai |
| `ONESIGNAL_REST_API_KEY` | `apps/api/.env`, `env.production` | Bí mật, dạng `os_v2_…` → header `Authorization: Key <key>` |
| `NEXT_PUBLIC_ONESIGNAL_APP_ID` | `apps/web/.env`, build-arg web trong `docker-compose.prod.yml` | Cùng giá trị App ID |

Thiếu biến → tính năng tự tắt (API log 1 lần, web không khởi tạo SDK). Dev không cấu hình vẫn chạy bình thường.
Mỗi app OneSignal gắn với một origin: prod dùng app có Site URL = domain prod; thử trên `localhost` cần app dev riêng.

## Phần 1 — API

### Luồng

```
deliver() ─ createManyAndReturn (thông báo mới) ─ emit SSE (thêm alertLevel)
          ├─ dispatchEmail (như cũ, fire-and-forget)
          └─ pushService.sendAlertPush(...)  (fire-and-forget, không await)
```

### `PushService` (module mới `apps/api/src/modules/push/`)

`sendAlertPush({ alertId, alertLevel, recipientIds, title, body, targetUrl })`:

1. Chưa cấu hình → return.
2. `alertLevel < 3` hoặc `recipientIds` rỗng → return.
3. `recipientIds` = người nhận **vừa được tạo** thông báo (các dòng `createManyAndReturn` trả về) — queue retry
   hay chạy trùng với fallback đồng bộ không tạo push trùng.
4. `POST https://api.onesignal.com/notifications`:
   ```json
   {
     "app_id": "<ONESIGNAL_APP_ID>",
     "target_channel": "push",
     "include_aliases": { "external_id": ["<staffId>", "..."] },
     "headings": { "en": "<title>", "vi": "<title>" },
     "contents": { "en": "<body>", "vi": "<body>" },
     "web_url": "<WEB_BASE_URL | WEB_ORIGIN><targetUrl ?? /alerts>",
     "idempotency_key": "<uuid dẫn xuất>"
   }
   ```
   `idempotency_key` (trường trong body) = chuỗi dạng UUID dẫn xuất sha256 từ `alertId` + danh sách người nhận đã sắp xếp (chống trùng lớp 2).
   `external_id` tối đa 20.000/lần — vượt thì chia lô (thực tế ma trận escalation chỉ vài chục người).
5. Timeout 5s (`AbortController`). Lỗi mạng / HTTP không 2xx → `logger.warn` (không in nội dung thông báo), không ném.

### Thay đổi hiện có

- `NotificationDispatchService.deliver()`: với `source.kind === 'alert'`, đọc `alert.level` một lần
  (`prisma.alert.findUnique({ select: { level } })`), đưa vào SSE payload `alertLevel` và gọi `sendAlertPush`.
  Nguồn khác → `alertLevel: null`, không push.
- `NotificationEvent.payload` thêm `alertLevel: number | null`.
- `PushModule` được import vào module chứa `NotificationDispatchService`; inject `@Optional()` giống `EmailService`.

## Phần 2 — Web

### SDK + định danh

- Gói `react-onesignal` (SDK thật tải async từ CDN OneSignal — không ảnh hưởng bundle budget).
- `apps/web/public/OneSignalSDKWorker.js`: `importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");`
- `lib/push/onesignal.ts`: `initPush()` (idempotent, chỉ chạy một lần), `identifyPush(staffId)`, `resetPush()`.
- Khởi tạo trong layout `(dashboard)` khi đã có user (đã qua consent). Sau init → `OneSignal.login(user.id)`.
- Đăng xuất → `OneSignal.logout()` trước khi về `/login` (máy dùng chung không nhận nhầm cảnh báo).
- Không có `NEXT_PUBLIC_ONESIGNAL_APP_ID` → bỏ qua hết.
- Không có CSP trong `next.config.ts` hiện tại → không cần sửa header.

### Nút bật thông báo (trong dropdown chuông)

Trình duyệt chỉ cho xin quyền từ thao tác người dùng → KHÔNG tự hiện prompt khi vào trang.

| Trạng thái quyền | Hiển thị |
|---|---|
| `default` | Nút "Bật thông báo trình duyệt" → `User.PushSubscription.optIn()` (tự hiện hộp xin quyền của trình duyệt) |
| `granted` + đang opt-in | "Đang bật" + nút tắt (`User.PushSubscription.optOut()`) |
| `granted` + đã opt-out | Nút bật lại (`optIn()`) |
| `denied` | Dòng hướng dẫn mở lại quyền trong cài đặt trang của trình duyệt |
| Trình duyệt không hỗ trợ | Ẩn mục |

Công tắc **"Âm thanh cảnh báo"** cùng dropdown, lưu `localStorage` (bọc try/catch), mặc định bật.

### Âm thanh khi tab mở

- `lib/push/alert-sound.ts`:
  - `shouldPlayAlertSound(payload, enabled)` — thuần: `enabled && payload.alertLevel != null && payload.alertLevel >= 3`.
  - `readSoundPreference()` / `writeSoundPreference()`.
  - `playAlertSound()` — hai nốt ngắn (880Hz → 660Hz, ~0.4s) sinh bằng Web Audio API, không cần file âm thanh;
    `AudioContext` bị chặn autoplay → nuốt lỗi.
- `useNotificationStream`: trong handler `notification`, parse payload → nếu `shouldPlayAlertSound` thì phát.
- Tab mở vẫn có popup hệ điều hành từ OneSignal → nghe cả hai tiếng; chấp nhận vì chỉ cấp 3–4.

## Kiểm thử

API (jest):
- `PushService`: chỉ gửi khi cấp ≥ 3; body đúng `external_id`, `web_url`, `idempotency_key` ổn định; lỗi mạng/HTTP 4xx/5xx
  không ném; thiếu cấu hình → không gọi `fetch`.
- `NotificationDispatchService.deliver()`: push nhận đúng người nhận vừa tạo (bỏ người đã có thông báo);
  SSE payload có `alertLevel`; nguồn `analysis`/`discussion` không push.

Web (vitest):
- `shouldPlayAlertSound` (cấp 1–4, null, tắt âm).
- Đọc/ghi tuỳ chọn âm thanh, kể cả khi `localStorage` ném lỗi.

Trình duyệt:
- Dropdown chuông hiện đúng 4 trạng thái.
- Giả lập sự kiện SSE cấp 3 → phát tiếng; cấp 2 → im.
- Push thật: sau khi sửa tên biến env, tạo cảnh báo cấp 3 với tab đóng → popup hiện, bấm mở đúng trang.

Hoàn thành khi `pnpm typecheck && pnpm lint && pnpm test` xanh (build web chỉ chạy khi `next dev` đã dừng).

## Ngoài phạm vi

- Push cho tin trao đổi, bản phân tích AI, cảnh báo cấp 1–2.
- Trang cài đặt thông báo riêng / tuỳ chọn theo cấp cho từng người.
- Biến FCare thành PWA; hỗ trợ iOS Safari (yêu cầu cài PWA lên màn hình chính).
- Lưu cấu hình OneSignal trong DB kiểu `mail_settings` — dùng env là đủ.
