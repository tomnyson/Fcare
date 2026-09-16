# Cảnh báo điểm danh tự động & chăm sóc liên tục (FLOW 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sau mỗi lần Đào tạo nhập điểm danh hàng tuần (import `GRADE_ATTENDANCE`), hệ thống **tự rà soát**: sinh viên vắng **2 buổi** ở một lớp học phần → cảnh báo cấp **2 (Trung bình)**, vắng **≥ 3 buổi** → cấp **3 (Cao)**. Cảnh báo được đưa vào module chăm sóc: **hiện liên tục** với giảng viên đứng lớp đó cho đến khi chính giảng viên đó ghi nhật ký chăm sóc; giảng viên lớp khác vẫn chăm sóc được nhưng không bị "đeo" cảnh báo. Trưởng bộ môn thống kê được số lượt chăm sóc của từng giảng viên đối với các cảnh báo này.

**Architecture:**
- **Nguồn dữ liệu**: không có bảng điểm danh theo buổi. Số buổi vắng là **cột luỹ kế** `Enrollment.absentSessions` (cột "Số buổi nghỉ/TS" trong file LHCT) do `GradeAttendanceCommitter` ghi mỗi tuần. "Tuần 1…5" trong nghiệp vụ = mỗi lần import; rà soát chạy trên số luỹ kế nên **không cần bảng tuần**, không cần cron (`@nestjs/schedule` chưa có trong deps).
- **Trigger**: `ImportsService.commit` → sau khi `$transaction` commit thành công và `batch.kind === GRADE_ATTENDANCE` → gọi `AttendanceReviewService.reviewTerm(term, { batchId })` (chạy **ngoài** transaction import để không kéo dài tx 120s và để dùng được queue). Thêm endpoint `POST /attendance-alerts/review` cho ADMIN/TRAINING_OFFICER chạy lại tay.
- **Lưu trữ**: **tái sử dụng bảng `Alert`** (để cảnh báo tự động xuất hiện ở trang Cảnh báo, chuông thông báo, `statistics.overview`, `care-statistics`) + mở rộng: `source AlertSource (MANUAL | AUTO_ATTENDANCE)`, `classSectionId?`, `term?`, `absentSessions?`, `ownerCaredAt?`; `raisedById` chuyển **nullable** (cảnh báo do hệ thống phát, UI hiện "Hệ thống").
- **Idempotent theo tuần**: khoá nghiệp vụ `(studentId, classSectionId, term, source=AUTO_ATTENDANCE)` với `status != RESOLVED`. Import lại cùng số → không tạo mới; số tăng 2→3 → **nâng cấp** cảnh báo hiện có (level 2→3, reset `ownerCaredAt`, gửi lại thông báo cho người nhận mới); đã RESOLVED mà số buổi vắng vượt mức đã resolve → tạo cảnh báo mới.
- **Chăm sóc liên tục**: `CareLog.alertId?` liên kết nhật ký ↔ cảnh báo. Khi `careLog.staffId === alert.classSection.lecturerId` → set `alert.ownerCaredAt`, chuyển `OPEN → ACKNOWLEDGED`. Banner "đeo" của giảng viên = alert `AUTO_ATTENDANCE`, `status != RESOLVED`, `classSection.lecturerId = user.id`, `ownerCaredAt IS NULL`. Giảng viên khác (trong `studentScope`) ghi nhật ký kèm `alertId` → được ghi nhận, không đổi `ownerCaredAt`.
- **Người nhận thông báo**: dùng lại ma trận `EscalationService.computeRecipientIds` (L2: GV đang dạy + SA_OFFICER; L3: + TBM bộ môn SV) với `raisedById` bỏ trống; gửi qua queue `alert-escalation` + fallback đồng bộ như hiện có.
- **Thống kê (Bước 4)**: mở rộng `care-statistics` (đã giới hạn ADMIN/HEAD_OF_DEPT) thêm nhóm số liệu `attendanceAlerts { total, caredByOwner, caredByOthers, pending }` theo giảng viên/lớp + cột Excel tương ứng.

**Tech Stack:** NestJS 11, Prisma 6 (pin), PostgreSQL, BullMQ, Next.js 15 App Router, TanStack Query, Vitest, Jest, Playwright.

**Spec tham chiếu:** ảnh yêu cầu "MODULE CHĂM SÓC SINH VIÊN — FLOW 2"; `docs/tailieu/cochedokhan.md` (bảng R_C: 2 buổi = 2 điểm, ≥3 buổi = 3 điểm — nhất quán với ngưỡng 2/3 ở đây).

## Global Constraints
- **RULE BẢO MẬT 1**: không thêm bất kỳ field PII nào. Nội dung thông báo/lý do cảnh báo chỉ chứa mã SV, họ tên, mã lớp, số buổi vắng.
- **RULE BẢO MẬT 2**: mọi query đọc cảnh báo/nhật ký phải qua `studentScope(user)`; endpoint banner lọc thêm `classSection.lecturerId = user.id`. Ghi nhật ký kèm `alertId`: kiểm tra `alert.studentId === dto.studentId` **và** `isStudentInScope`.
- **RULE 3**: LECTURER không có quyền chạy `POST /attendance-alerts/review` (chỉ ADMIN, TRAINING_OFFICER).
- Không cron, không WebSocket, không nâng Prisma 7. Không đụng `computeRiskScore()`.
- Chạy `impact()` (GitNexus, `repo: "Fcare"`) trước khi sửa `ImportsService.commit`, `AlertsService.list`, `CareLogsService.create`, `EscalationService.computeRecipientIds`, `CareStatisticsService.list/export`.
- Hoàn thành: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` xanh; kiểm tra `lsof -i :3000` trước khi build web. Không commit khi user chưa yêu cầu.

## Quyết định nghiệp vụ (user đã xác nhận "ok" ngày 2026-09-16 — đã triển khai)
| # | Vấn đề | Đề xuất |
|---|---|---|
| A | "Tuần" hiểu thế nào | Mỗi lần import điểm danh = 1 tuần; rà soát trên số luỹ kế `absentSessions`. Không lưu lịch sử tuần. |
| B | Ngưỡng | `== 2` → cấp 2; `>= 3` → cấp 3. Không tự lên cấp 4 (cấp 4 luôn do người quyết). |
| C | Cảnh báo tự động nằm ở đâu | Cùng bảng `Alert`, đánh dấu `source = AUTO_ATTENDANCE`. |
| D | Ai là người phát | `raisedById = null`, UI hiện "Hệ thống (điểm danh)". |
| E | Khi số vắng tăng 2→3 sau khi GV đã chăm sóc | **Đã triển khai khác đề xuất ban đầu**: không sửa `level` tại chỗ mà *thay thế* — cảnh báo cấp 2 cũ chuyển `RESOLVED` (`resolvedAt`), tạo cảnh báo cấp 3 mới với `ownerCaredAt = null` nên banner hiện lại; thông báo gửi lại theo ma trận cấp 3 (thêm TBM). Lịch sử chăm sóc cấp 2 giữ nguyên trên cảnh báo cũ. |
| F | Khi nào hết "liên tục" | Khi **chính GV đứng lớp** ghi `CareLog` gắn `alertId`. Resolve (TBM/ĐT/Trưởng CTSV) cũng tắt banner. |
| G | Thông báo đẩy | Có: chuông + SSE cho người nhận theo ma trận. Lecturer chủ lớp còn thấy banner cố định ở Dashboard. |
| H | Import lại cùng tuần (re-commit file) | Không tạo trùng nhờ khoá nghiệp vụ; không gửi lại thông báo nếu level không đổi. |

## Cấu trúc file

| Loại | Đường dẫn | Ghi chú |
|---|---|---|
| Migration | `apps/api/prisma/migrations/2026091610XXXX_add_attendance_auto_alerts/migration.sql` | enum, cột mới, FK, index, drop NOT NULL `raised_by_id` |
| Schema | `apps/api/prisma/schema.prisma` | `AlertSource`, mở rộng `Alert`, `CareLog.alertId`, relation `ClassSection.alerts` |
| Shared types | `packages/shared-types/src/alerts.ts` | `ALERT_SOURCE_LABELS`, `attendanceLevelFor(absent)` |
| Service mới | `apps/api/src/modules/attendance-alerts/attendance-review.service.ts` | rà soát + upsert + dispatch |
| Service mới | `apps/api/src/modules/attendance-alerts/attendance-alerts.service.ts` | `listPendingForLecturer`, `summaryForUser` |
| Controller mới | `apps/api/src/modules/attendance-alerts/attendance-alerts.controller.ts` | `GET /attendance-alerts/pending`, `POST /attendance-alerts/review` |
| Module mới | `apps/api/src/modules/attendance-alerts/attendance-alerts.module.ts` | imports `AlertsModule`, `NotificationsModule`, `BullModule.registerQueue` |
| DTO mới | `apps/api/src/modules/attendance-alerts/dto/attendance-alerts.dto.ts` | `ReviewAttendanceDto { term }` |
| Sửa | `apps/api/src/modules/imports/imports.service.ts` | gọi review sau commit GRADE_ATTENDANCE |
| Sửa | `apps/api/src/modules/imports/imports.module.ts` | import `AttendanceAlertsModule` |
| Sửa | `apps/api/src/modules/alerts/escalation.service.ts` | `raisedById?: string` |
| Sửa | `apps/api/src/modules/alerts/alerts.service.ts` + `dto/alert.dto.ts` | filter `source`, include `classSection`, `ownerCaredAt` |
| Sửa | `apps/api/src/modules/care-logs/care-logs.service.ts` + `dto` | `alertId?` + cập nhật `ownerCaredAt`/ACKNOWLEDGED |
| Sửa | `apps/api/src/modules/statistics/care-statistics.service.ts` + `.types.ts` + Excel | số liệu chăm sóc cảnh báo điểm danh |
| Sửa | `apps/api/src/casl/ability.factory.ts` | subject `AttendanceAlert` (read: mọi role có `read Alert`; `review`: ADMIN, TRAINING_OFFICER) |
| Sửa | `apps/api/src/app.module.ts` | đăng ký `AttendanceAlertsModule` |
| Web hook mới | `apps/web/src/lib/use-attendance-alerts.ts` | `usePendingAttendanceAlerts()` (queryKey `['attendance-alerts','pending']`, refetch 120s + invalidate khi SSE nhận alert) |
| Web comp mới | `apps/web/src/components/dashboard/attendance-care-panel.tsx` | banner "đeo" ở đầu Dashboard |
| Web comp tách | `apps/web/src/components/students/care-log-form-modal.tsx` | tách modal từ `care-logs-tab.tsx`, nhận `alertId?` |
| Web sửa | `apps/web/src/app/(dashboard)/dashboard/page.tsx` | gắn panel |
| Web sửa | `apps/web/src/app/(dashboard)/alerts/page.tsx` + `alert-filters.ts` | filter `source`, chip "Tự động", cột lớp/số buổi vắng, "Hệ thống" khi không có `raisedBy` |
| Web sửa | `apps/web/src/components/students/alerts-tab.tsx`, `care-logs-tab.tsx` | hiển thị nguồn/lớp; nút "Chăm sóc" gắn alert; nhật ký hiện cảnh báo liên kết |
| Web sửa | `apps/web/src/components/dashboard/nav-tree.ts`, `topbar.tsx` (badge) | badge `pendingAttendance` cạnh "Cảnh báo" |
| Web sửa | `apps/web/src/app/(dashboard)/statistics/care/...` | cột "CS cảnh báo điểm danh" |
| Web sửa | `apps/web/src/lib/types.ts`, `labels.ts` | `Alert.source/classSection/absentSessions/ownerCaredAt`, `CareLog.alertId` |
| Test API | `attendance-review.service.spec.ts`, `attendance-alerts.service.spec.ts`, `care-logs.service.spec.ts`, `escalation.service.spec.ts`, `care-statistics.service.spec.ts`, `imports.service.spec.ts` | Jest |
| Test web | `attendance-care-panel.spec.ts(x)`, `alert-filters.spec.ts` | Vitest |
| E2E | `apps/web/e2e/attendance-alerts.spec.ts` | Playwright |

---

### Task 1: Schema & migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_add_attendance_auto_alerts/migration.sql`

**Interfaces:**
- `enum AlertSource { MANUAL AUTO_ATTENDANCE }`
- `Alert`: `+ source AlertSource @default(MANUAL)`, `+ classSectionId String?`, `+ term String?`, `+ absentSessions Int?`, `+ ownerCaredAt DateTime?`, `raisedById String?` (nullable), relation `classSection ClassSection?`, `careLogs CareLog[]`; `@@index([source, status, classSectionId])`, `@@index([studentId, classSectionId, term])`.
- `CareLog`: `+ alertId String?` relation `alert Alert? (onDelete: SetNull)`, `@@index([alertId])`.
- `ClassSection`: `+ alerts Alert[]`.

- [x] **Step 1**: Sửa schema như trên; `raisedBy Staff? @relation(...)`.
- [x] **Step 2**: `pnpm --filter @fcare/api db:migrate:dev --name add_attendance_auto_alerts`; kiểm tra SQL sinh ra có `ALTER COLUMN "raised_by_id" DROP NOT NULL`, không xoá dữ liệu.
- [x] **Step 3**: Thêm partial unique index thủ công vào migration.sql: `CREATE UNIQUE INDEX alerts_auto_attendance_open_key ON alerts (student_id, class_section_id, term) WHERE source = 'AUTO_ATTENDANCE' AND status <> 'RESOLVED';` (chặn race khi hai import commit song song).
- [x] **Step 4**: `pnpm --filter @fcare/api db:generate`; `pnpm typecheck` (sẽ đỏ ở nơi giả định `raisedById` non-null — sửa ở Task 2/3).

### Task 2: Shared types + EscalationService

**Files:**
- Modify: `packages/shared-types/src/alerts.ts`, `packages/shared-types/src/index.ts`
- Modify: `apps/api/src/modules/alerts/escalation.service.ts` (+ spec)

- [x] **Step 1 (RED)**: test `attendanceLevelFor(0|1) → null`, `(2) → 2`, `(3|7) → 3`.
- [x] **Step 2 (GREEN)**: `export const ATTENDANCE_ALERT_THRESHOLDS = { MEDIUM: 2, HIGH: 3 }`, `attendanceLevelFor(absent: number | null): 2 | 3 | null`, `ALERT_SOURCE_LABELS = { MANUAL: 'Thủ công', AUTO_ATTENDANCE: 'Tự động (điểm danh)' }`.
- [x] **Step 3**: `impact({target:"computeRecipientIds", direction:"upstream", repo:"Fcare"})`; đổi chữ ký `raisedById?: string`; thêm test "không truyền raisedById → không loại ai".

### Task 3: AttendanceReviewService (lõi rà soát)

**Files:**
- Create: `apps/api/src/modules/attendance-alerts/attendance-review.service.ts`, `.spec.ts`
- Create: `apps/api/src/modules/attendance-alerts/attendance-alerts.module.ts`

**Interfaces:**
- `reviewTerm(term: string, opts?: { batchId?: string; actorId?: string }): Promise<{ created: number; upgraded: number; unchanged: number; notified: number }>`

**Thuật toán:**
1. `enrollment.findMany({ where: { classSection: { term, lecturerId: not null }, absentSessions: { gte: 2 } }, select: studentId, classSectionId, absentSessions, student{fullName, studentCode, status}, classSection{code, lecturerId} })` — bỏ SV không `ACTIVE`/đã nghỉ (`StudentStatus` ≠ ACTIVE/WARNED tuỳ enum hiện có).
2. Load một lần tất cả alert `AUTO_ATTENDANCE` của `term` với `status != RESOLVED` → map theo `${studentId}:${classSectionId}`; load thêm alert RESOLVED gần nhất để lấy `level` đã resolve.
3. Mỗi enrollment: `target = attendanceLevelFor(absent)`. Không có alert mở: nếu có alert RESOLVED với `level >= target` → bỏ qua; ngược lại **tạo** (`raisedById: null`, `reason` = "Vắng N buổi tại lớp CODE (học kỳ TERM) — rà soát tự động sau import điểm danh", `absentSessions`, `classSectionId`, `term`). Có alert mở: `level < target` → **nâng cấp** (`level`, `absentSessions`, `reason`, `ownerCaredAt: null`, `status: OPEN`); `level == target` → chỉ cập nhật `absentSessions` nếu khác.
4. Với alert tạo/nâng cấp: `computeRecipientIds(studentId, level)` → dispatch qua `NotificationDispatchService` (queue + fallback, tái sử dụng logic `AlertsService.dispatchNotifications` — **tách** hàm này thành helper dùng chung `enqueueOrDeliver` trong `notification-dispatch.service.ts`). `targetUrl = /students/:id?tab=care-logs&alertId=:alertId`. Idempotent `(alertId, recipientId)` — khi nâng cấp chỉ người mới (TBM) nhận thêm.
5. Audit `ATTENDANCE_REVIEW` với `{ term, batchId, created, upgraded }`; lỗi từng SV không làm hỏng cả đợt (log + tiếp tục, trả `failed`).

- [x] **Step 1 (RED)**: spec với prisma mock: (a) 2 buổi → tạo L2; (b) 3 buổi → L3; (c) đã có L2 mở + 3 buổi → upgrade, reset `ownerCaredAt`; (d) cùng số → không tạo, không dispatch; (e) đã RESOLVED L3 + 3 buổi → bỏ qua; (f) đã RESOLVED L2 + 3 buổi → tạo mới L3; (g) lớp không có `lecturerId` → bỏ qua; (h) 1 buổi → không gì.
- [x] **Step 2 (GREEN)**: viết service, hàm < 50 dòng, tách `decideAction()` thuần (dễ test) khỏi phần I/O.
- [x] **Step 3**: Module: providers `AttendanceReviewService`, `AttendanceAlertsService`; imports `AlertsModule`, `NotificationsModule`, `BullModule.registerQueue({ name: ALERT_ESCALATION_QUEUE })`; exports `AttendanceReviewService`.

### Task 4: Hook vào import + endpoint review tay

**Files:**
- Modify: `apps/api/src/modules/imports/imports.service.ts`, `imports.module.ts`, `imports.service.spec.ts`
- Create: `attendance-alerts.controller.ts`, `dto/attendance-alerts.dto.ts`
- Modify: `apps/api/src/casl/ability.factory.ts`, `apps/api/src/app.module.ts`

- [x] **Step 1**: `impact({target:"ImportsService.commit"})` — báo blast radius.
- [x] **Step 2 (RED)**: spec `commit` với kind GRADE_ATTENDANCE gọi `reviewTerm(batch.term, { batchId, actorId })` **sau** transaction; kind khác không gọi; review ném lỗi → commit vẫn trả kết quả, lỗi được log + audit `ATTENDANCE_REVIEW_FAILED` (import đã ghi xong, không rollback).
- [x] **Step 3 (GREEN)**: inject `AttendanceReviewService`; bọc try/catch; trả thêm `attendanceReview` trong `result` để UI import hiện "Đã tạo N cảnh báo điểm danh".
- [x] **Step 4**: CASL: subject `AttendanceAlert`; action `review` cho ADMIN, TRAINING_OFFICER; `read` cho mọi role có `read Alert`. Controller `POST /attendance-alerts/review { term }` → `@CheckPolicies(can('review','AttendanceAlert'))`, term mặc định = kỳ hiện tại (`TermsService.current()`).

### Task 5: CareLog gắn cảnh báo & tắt "liên tục"

**Files:**
- Modify: `apps/api/src/modules/care-logs/care-logs.service.ts`, `dto/care-log.dto.ts`, `care-logs.service.spec.ts`
- Modify: `apps/api/src/modules/alerts/alerts.service.ts`, `dto/alert.dto.ts`, `alerts.service.spec.ts`

- [x] **Step 1**: `impact({target:"CareLogsService.create"})`, `impact({target:"AlertsService.list"})`.
- [x] **Step 2 (RED)** care-logs: (a) `alertId` của SV khác → 400; (b) alert ngoài scope → 403 (`isStudentInScope`); (c) staff = `classSection.lecturerId` → set `ownerCaredAt`, status OPEN→ACKNOWLEDGED, audit `ALERT_OWNER_CARED`; (d) staff khác → không đổi `ownerCaredAt`; (e) alert đã RESOLVED → vẫn cho ghi nhật ký, không đổi status.
- [x] **Step 3 (GREEN)**: `CreateCareLogDto.alertId?: uuid`; `create` chạy trong `$transaction` (careLog.create + alert.update có điều kiện). `list` include `alert { id, level, source, classSection{code} }` (không PII).
- [x] **Step 4**: `ListAlertsQuery.source?: AlertSource`, `AlertsService.list` include `classSection { id, code, subject{name} }`, trả `ownerCaredAt`, `absentSessions`; `raisedBy` null-safe.

### Task 6: Endpoint banner "đeo" cho giảng viên

**Files:**
- Create: `attendance-alerts.service.ts`, `.spec.ts`; bổ sung route vào `attendance-alerts.controller.ts`

**Interfaces:**
- `GET /attendance-alerts/pending?term=` → `{ items: PendingAttendanceAlert[], total, ownedTotal }` với `PendingAttendanceAlert { alertId, level, absentSessions, createdAt, student{id, studentCode, fullName, classCode}, classSection{id, code, subjectName}, isOwner: boolean }`.
- Quy tắc: `where: { source: AUTO_ATTENDANCE, status: { not: RESOLVED }, term, student: studentScope(user) }`; **`isOwner = classSection.lecturerId === user.id && ownerCaredAt == null`**; mặc định trả `isOwner = true` (banner). `?scope=all` trả cả cảnh báo lớp khác trong scope (để GV khác chăm sóc). Sắp xếp: level desc, createdAt asc. Giới hạn 100.

- [x] **Step 1 (RED)**: LECTURER chỉ thấy lớp mình; HEAD_OF_DEPT `scope=all` thấy cả bộ môn nhưng `isOwner` chỉ true với lớp mình dạy; alert đã `ownerCaredAt` không xuất hiện ở mặc định.
- [x] **Step 2 (GREEN)**: viết service; dùng `select` tường minh, không trả trường PII.
- [x] **Step 3**: bổ sung `attendancePending` vào `GET /statistics/overview` (đếm cho user hiện tại) để nav badge không cần thêm request.

### Task 7: Thống kê cho Trưởng bộ môn (Bước 4)

**Files:**
- Modify: `care-statistics.service.ts`, `care-statistics.types.ts`, spec, Excel builder tương ứng

- [x] **Step 1**: `impact({target:"CareStatisticsService.list"})`.
- [x] **Step 2 (RED)**: theo lecturer/section: `attendanceAlerts { total, caredByOwner, caredByOthers, pending }`; theo student: `attendanceAlert { level, absentSessions, ownerCaredAt, careLogCount } | null`. `caredByOthers` = alert có ≥1 `CareLog.alertId` từ staff ≠ owner và `ownerCaredAt == null`.
- [x] **Step 3 (GREEN)**: một query `alert.findMany` cho cả term gom theo `classSectionId`, không N+1; Excel thêm 4 cột ở chế độ summary, 3 cột ở detailed.

### Task 8: Web — types, labels, hook, tách modal CareLog

**Files:**
- Modify: `apps/web/src/lib/types.ts`, `labels.ts`
- Create: `apps/web/src/lib/use-attendance-alerts.ts`
- Create: `apps/web/src/components/students/care-log-form-modal.tsx`; refactor `care-logs-tab.tsx` dùng modal này

- [x] **Step 1**: types/labels (`ALERT_SOURCE_LABELS` import từ shared-types).
- [x] **Step 2**: hook `usePendingAttendanceAlerts(term, scope)` — `refetchInterval` 120s, `staleTime` 30s; `use-notification-stream.ts` khi nhận event alert → `invalidateQueries(['attendance-alerts'])`.
- [x] **Step 3**: modal nhận `studentId`, `alertId?`, `defaultContent?`; sau submit invalidate `['care-logs', studentId]`, `['attendance-alerts']`, `['alerts']`, `['statistics','overview']`.

### Task 9: Web — Attendance Care Panel (banner liên tục) + nav badge

**Files:**
- Create: `apps/web/src/components/dashboard/attendance-care-panel.tsx` (+ `.spec.tsx` cho phần logic thuần)
- Modify: `apps/web/src/app/(dashboard)/dashboard/page.tsx`, `nav-tree.ts`, sidebar badge, `topbar.tsx`

**Design (theo `design-taste`, token trong `tokens.css`):** panel nằm **trên** StatCards, viền trái đậm màu `--warning`/`--danger` theo cấp cao nhất, tiêu đề "N sinh viên cần chăm sóc sau điểm danh", mỗi hàng: chip cấp (tone theo `ALERT_LEVEL_TONES`), mã SV · tên · lớp học phần · "vắng N buổi", nút chính **"Chăm sóc ngay"** (mở modal gắn `alertId`), nút phụ "Xem hồ sơ". Không có nút đóng/ẩn — đây là cảnh báo liên tục theo yêu cầu. Trạng thái rỗng không render gì. Người không phải GV chủ lớp (TBM xem `scope=all`) thấy panel thứ hai gập được "Cảnh báo điểm danh trong bộ môn".

- [x] **Step 1**: viết panel + test render (Vitest thuần cho `groupByLevel`, `panelTone`).
- [x] **Step 2**: badge `pendingAttendance` ở leaf "Cảnh báo" (lấy từ `statistics/overview.attendancePending`).
- [x] **Step 3**: Kiểm tra bundle trang Dashboard < 300kB gzip.

### Task 10: Web — trang Cảnh báo, tab Cảnh báo/Nhật ký, thống kê chăm sóc

**Files:**
- Modify: `alerts/page.tsx`, `alert-filters.ts` (+spec), `students/alerts-tab.tsx`, `students/care-logs-tab.tsx`, trang thống kê chăm sóc

- [x] **Step 1**: filter `source` (Tất cả/Thủ công/Tự động) qua URL; cột "Lớp học phần", "Số buổi vắng"; người phát = "Hệ thống" khi `raisedBy` null; chip "GV đã chăm sóc" khi `ownerCaredAt`.
- [x] **Step 2**: `alerts-tab.tsx`: với alert AUTO mở → nút "Ghi nhật ký chăm sóc" mở modal gắn `alertId`; đọc `?alertId=` từ URL (deep-link từ thông báo) để mở modal sẵn.
- [x] **Step 3**: `care-logs-tab.tsx`: hiện tag "Gắn cảnh báo cấp N — lớp CODE".
- [x] **Step 4**: bảng thống kê chăm sóc: 4 cột mới + tooltip giải thích "GV chủ lớp đã chăm sóc / GV khác chăm sóc / chưa ai".

### Task 11: E2E + verification

**Files:**
- Create: `apps/web/e2e/attendance-alerts.spec.ts`
- Seed: bổ sung `apps/api/prisma/seed` dữ liệu enrollment `absentSessions: 2` và `3` cho lớp của GV demo (nếu seed chưa có).

- [x] **Step 1** *(triển khai dưới dạng E2E mock API — `apps/web/e2e/attendance-alerts.spec.ts`, 3 test: banner GV chủ lớp + gửi nhật ký gắn `alertId`, TBM xem phạm vi bộ môn, deep-link `?alertId=` ở hồ sơ SV; chưa có E2E import file thật vì cần DB seed riêng)*: E2E: TRAINING_OFFICER import file điểm danh mẫu (fixture có SV vắng 2 và 3) → commit → GV chủ lớp đăng nhập → thấy panel với 2 dòng → "Chăm sóc ngay" → gửi nhật ký → dòng biến mất; GV lớp khác thấy dòng ở "trong bộ môn" nhưng không ở banner; TBM mở thống kê chăm sóc thấy `caredByOwner = 1`.
- [x] **Step 2**: `security-review` skill cho 3 endpoint mới + thay đổi care-logs.
- [x] **Step 3** *(typecheck 5/5 + test web 171/api 996 xanh; `pnpm build` web bỏ qua vì `next dev :3000` đang chạy; lint còn lỗi ở file ngoài tính năng — xem báo cáo)*: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` xanh; `detect_changes()` trước khi (nếu được yêu cầu) commit.
- [x] **Step 4**: Cập nhật `CLAUDE.md` mục "Quy ước kiến trúc" thêm 1 dòng về cảnh báo điểm danh tự động; cập nhật memory `fcare-drs-urgency-decisions` với quyết định A–H.

## Dependencies
- Task 1 → 2 → 3 → 4 (backend lõi, tuần tự).
- Task 5, 6, 7 phụ thuộc Task 1; độc lập nhau → chạy song song (3 subagent).
- Task 8 phụ thuộc 5/6 (contract API); Task 9, 10 phụ thuộc 8; Task 11 sau cùng.

## Risks
| Mức | Rủi ro | Giảm thiểu |
|---|---|---|
| HIGH | `raisedById` nullable chạm nhiều nơi (`alerts.service`, `student-analyses.service` L684, web hiển thị `raisedBy`) | `impact()` trước; TypeScript bắt lỗi; test regression `alerts.service.spec` |
| HIGH | Import tuần 300+ dòng → hàng chục alert × N người nhận → burst notification | dispatch qua queue, gộp 1 job/alert; nếu queue timeout → fallback đồng bộ đã có |
| MEDIUM | Review chạy ngoài transaction: import thành công nhưng review lỗi | try/catch + audit `ATTENDANCE_REVIEW_FAILED` + endpoint chạy lại tay |
| MEDIUM | Race 2 import cùng term commit gần nhau → double alert | partial unique index + bắt P2002 và coi như "unchanged" |
| MEDIUM | Scope: GV lớp khác chăm sóc — phải vẫn trong `studentScope` (dạy SV ở lớp khác) | dùng `isStudentInScope`, không tự nới scope |
| LOW | Lớp không có `lecturerId` (chưa import LECTURER) | bỏ qua, ghi số `skippedNoLecturer` vào audit |
| LOW | Thay đổi ngưỡng sau này | hằng số ở shared-types, một chỗ |

## Estimated Complexity: MEDIUM-HIGH
- Backend (Task 1–7): ~10–12h
- Frontend (Task 8–10): ~6–8h
- E2E + review + verify (Task 11): ~3h
- Tổng: ~19–23h
