# Thanh tiến trình 0–100% khi import Excel — Thiết kế

- Ngày: 2026-09-27
- Phạm vi: chỉ `apps/web` — API giữ nguyên (không đổi endpoint, không thêm kênh tiến độ)
- Trạng thái: đã duyệt, đã triển khai

## 1. Mục tiêu

Khi upload file và khi commit một lượt import, người dùng thấy một thanh tiến
trình 0–100% kèm danh sách các bước hệ thống đang xử lý, thay cho dòng chữ
"Đang đọc file…" hiện nay.

**Đã chốt với user:**

- Mức độ thật: **% theo bước** (không cần % thật theo từng dòng phía máy chủ).
- Giai đoạn: **cả Upload lẫn Commit**.

**Giới hạn phải nói rõ:** API không báo tiến độ nội bộ nên chỉ đoạn *gửi file*
là % thật; đoạn máy chủ xử lý là ước lượng theo thời gian, chỉ lên 100% khi có
phản hồi. Không bao giờ hiện 100% trước khi request xong.

**Ngoài phạm vi:** % thật theo dòng phía máy chủ (SSE/polling tiến độ) — nâng
cấp riêng sau này, thiết kế này không chặn đường đó (chỉ thay nguồn số liệu
của mô hình tiến độ).

## 2. Hiện trạng

- Upload: `POST /imports/:kind/upload` (multipart) — đồng bộ: đọc workbook →
  `stripForbiddenData` (PII) → parser → kiểm tra ánh xạ → lưu `ImportRow` →
  trả bản xem trước.
- Commit: `POST /imports/:batchId/commit` — đồng bộ: committer trong
  transaction (timeout 120s) → với `GRADE_ATTENDANCE` chạy
  `AttendanceReviewService.reviewTerm`.
- Web: `import-wizard.tsx` gọi `apiUpload` / `apiFetch` qua `useMutation`;
  `import-run-status.tsx` hiện "Đang xử lý i/n … — đang đọc file…".

## 3. Mô hình tiến độ

| Pha | Khoảng % | Nguồn |
|---|---|---|
| `uploading` — gửi file | 0 → 30 | **Thật**: `loaded / total` của XHR `upload.onprogress` |
| `parsing` — máy chủ đọc & kiểm tra | 30 → < 90 | Ước lượng theo thời gian |
| `committing` — ghi dữ liệu | 5 → < 90 | Ước lượng theo thời gian |
| `done` | 100 | Có phản hồi thành công |
| `error` | giữ mức cuối | Request lỗi |

Công thức ước lượng (tiệm cận, không bao giờ chạm trần):

```
p = start + (cap - start) * (1 - exp(-elapsedMs / tauMs))
```

- `parsing`: start 30, cap 90, tau 8 000 ms.
- `committing`: start 5, cap 90, tau 20 000 ms; file điểm danh (`GRADE_ATTENDANCE`) tau 40 000 ms.
- % hiển thị **không bao giờ giảm** (lấy max với giá trị trước) và làm tròn số nguyên.
- Nếu trình duyệt không cung cấp `total` (`lengthComputable = false`) → đoạn
  `uploading` cũng dùng ước lượng 0 → 30 (tau 3 000 ms).

Danh sách bước hiển thị dưới thanh (mô tả việc hệ thống làm, KHÔNG đánh dấu
bước nào đang chạy vì web không biết):

- Upload: Gửi file · Đọc file · Lọc dữ liệu cá nhân · Kiểm tra dữ liệu & ánh xạ · Lưu bản xem trước
- Commit: Ghi dữ liệu vào hệ thống · (điểm danh) Rà soát cảnh báo vắng

Riêng bước "Gửi file" được đánh dấu xong khi `uploadRatio = 1`.

## 4. Thành phần

### 4.1 `apps/web/src/lib/import-progress.ts` (thuần, test được)

Các hàm chuyển trạng thái thuần, bất biến (nhận `now` từ ngoài để hook không
gọi `Date.now()` trong render):

```ts
export type ImportProgressPhase = 'idle' | 'uploading' | 'parsing' | 'committing' | 'done' | 'error';

export interface ImportProgressState {
  operation: 'upload' | 'commit';
  kind: ImportKindSlug | null;   // chọn tau + danh sách bước
  phase: ImportProgressPhase;
  uploadRatio: number | null;    // 0..1, null khi không đo được
  phaseStartedAt: number;
  percent: number;               // 0..100, số nguyên, không lùi
}

export const IDLE_PROGRESS: ImportProgressState;
export function startProgress(operation, kind, now): ImportProgressState;
export function withUploadRatio(state, ratio, now): ImportProgressState; // ratio 1 → 'parsing'
export function tickProgress(state, now): ImportProgressState;
export function finishProgress(state): ImportProgressState;
export function failProgress(state): ImportProgressState;
export function clearIfDone(state): ImportProgressState;   // ẩn sau khi giữ 100%
export function progressView(state): ImportProgressView;   // { percent, tone, label, valueText, steps }
```

### 4.2 `apiUploadWithProgress` trong `apps/web/src/lib/api.ts`

```ts
export function apiUploadWithProgress<T>(
  path: string,
  file: File,
  fields: Record<string, string> | undefined,
  onUploadProgress: (ratio: number | null) => void,
): Promise<T>;
```

Dùng `XMLHttpRequest` (fetch không có upload progress) nhưng giữ đúng hợp đồng
của `apiFetch`:

- `withCredentials = true`, header `X-Requested-With: XMLHttpRequest` (CSRF).
- Đọc envelope `{ success, data, error, code }` từ `responseText`; không phải
  JSON → câu "Máy chủ đang bận…" như `readEnvelope`.
- `status 0` / `onerror` → `ApiError(NETWORK_ERROR_MESSAGE, 0)`.
- 401 → `refreshSession()`; `ok` → gửi lại MỘT lần (progress chạy lại từ 0);
  `unauthorized` → `redirectToLogin()`; `error` → lỗi mạng.
- Lỗi có `code` `CONSENT_REQUIRED` / `PASSWORD_CHANGE_REQUIRED` → `redirectForCode`.
- `apiUpload` hiện có giữ nguyên (backups, add-students-modal vẫn dùng).

### 4.3 `apps/web/src/lib/use-import-progress.ts`

Hook quản lý pha + thời điểm bắt đầu pha, tick bằng `setInterval` 200 ms
chỉ khi pha là `uploading`/`parsing`/`committing`; dừng tick khi
`done`/`error`/`idle` và khi unmount. API: `start(operation, kind)`,
`setUploadRatio(r)`, `finish()`, `fail()`, `reset()`, `view`.

### 4.4 `apps/web/src/components/imports/import-progress.tsx` (trình bày)

- `role="progressbar"`, `aria-valuemin=0`, `aria-valuemax=100`,
  `aria-valuenow`, `aria-valuetext` (vd. "Đang kiểm tra dữ liệu — 64%").
- Thanh lấp bằng `transform: scaleX(p/100)` (origin trái), transition
  `var(--duration-normal)`; `prefers-reduced-motion` → tắt transition.
- Màu từ `tokens.css` (xanh FPT khi chạy, `success` khi xong, màu lỗi khi `error`).
- Hiện số % bên phải, danh sách bước (✓ cho bước đã xong).

### 4.5 Gắn vào `import-wizard.tsx` / `import-run-status.tsx`

- `upload.mutationFn` dùng `apiUploadWithProgress`; `onMutate` → `start('upload', kind)`;
  ratio = 1 tự chuyển sang `parsing`; `onSuccess` → `finish()`; `onError` → `fail()`.
- `commit.mutationFn` giữ `apiFetch`; `onMutate` → `start('commit', kind)`.
- Chuỗi nhiều loại: dòng "Đang xử lý i/n: <loại>" giữ nguyên, thanh tiến trình
  reset cho từng loại. Huỷ lô / chuỗi dừng → `reset()`.
- Sau `done` thanh giữ 100% ~800 ms rồi ẩn (bản xem trước / kết quả thay chỗ).

## 5. Xử lý lỗi

- Lỗi request: thanh dừng ở % cuối, đổi màu lỗi; thông báo lỗi hiện như cũ
  (`FormError`). Người dùng chọn lại file / thử lại → `reset()`.
- Rời trang giữa chừng: hook dọn interval; request XHR không huỷ (máy chủ vẫn xử
  lý, lô PENDING có thể "Nối lại" như hiện tại).

## 6. Kiểm thử (TDD — test trước)

- `import-progress.test.ts`: biên 0/30/90/100; `parsing` không bao giờ ≥ 90;
  không lùi khi `previousPercent` lớn hơn; `uploadRatio = null` dùng ước lượng;
  điểm danh có bước "Rà soát cảnh báo vắng", loại khác không có; `error` giữ %.
- `api.test.ts` (XHR giả): gọi `onUploadProgress`; gửi header + credentials;
  401 → refresh → gửi lại 1 lần; refresh `unauthorized` → redirect login;
  envelope lỗi → `ApiError` đúng `code`; `onerror` → lỗi mạng.
- `import-progress.tsx`: render `aria-valuenow` đúng, trạng thái lỗi.
- Thủ công: upload + commit file điểm danh thật (~3000 dòng) trên trình duyệt,
  throttle mạng "Fast 3G" để thấy đoạn gửi file; kiểm tra 320/768/1440 px.
- Cổng hoàn thành: `pnpm typecheck && pnpm lint && pnpm test` + build API
  (không `next build` khi `next dev` :3000 đang chạy).

## 7. Tệp dự kiến chạm tới

| Tệp | Loại |
|---|---|
| `apps/web/src/lib/import-progress.ts` (+ test) | mới |
| `apps/web/src/lib/use-import-progress.ts` | mới |
| `apps/web/src/components/imports/import-progress.tsx` | mới |
| `apps/web/src/lib/api.ts` (+ test) | thêm `apiUploadWithProgress` |
| `apps/web/src/components/imports/import-wizard.tsx` | gắn tiến trình |
| `apps/web/src/components/imports/import-run-status.tsx` | bỏ chữ "đang đọc file…" |
