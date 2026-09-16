# Admin Quản lý Sao lưu & Phục hồi Cơ sở dữ liệu (Database Backup & Restore) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng cơ chế Quản lý Sao lưu (Backup) và Phục hồi (Restore) cơ sở dữ liệu PostgreSQL của hệ thống FCare ngay trên giao diện Quản trị viên (Admin), bao gồm: tạo backup thủ công, tải về, tải lên, phục hồi với cơ chế tự động tạo snapshot an toàn trước khi khôi phục, cấu hình lịch sao lưu định kỳ tự động và chính sách lưu trữ (retention policy), có audit trail đầy đủ và xác thực an toàn nghiêm ngặt.

**Architecture:**
- **Lưu trữ & Metadata bền vững**: Backup files được lưu trữ tại thư mục `storage/backups/` dưới định dạng PostgreSQL Custom Archive (`.dump` sinh bởi `pg_dump -Fc`). Kèm theo mỗi tệp `.dump` là tệp metadata `.meta.json` lưu thông tin: ID, tên file, kích thước, mã SHA-256, thời điểm tạo, loại (`MANUAL`, `SCHEDULED`, `PRE_RESTORE`), người thực hiện, ghi chú, trạng thái. *Lý do lưu metadata trên đĩa cùng file*: Khi phục hồi database về trạng thái cũ trong quá khứ, bảng database sẽ bị ghi đè về mốc đó; việc lưu metadata trên đĩa đảm bảo lịch sử tệp backup trên giao diện không bao giờ bị mất mát hay lệch pha sau bất kỳ lần restore nào.
- **Tiến trình thực thi PgRunner**: Dịch vụ `PgRunnerService` chịu trách nhiệm phân tích `DATABASE_URL` (host, port, user, password, database) và tự động dò tìm các binary `pg_dump`, `pg_restore` theo thứ tự ưu tiên: biến môi trường `PG_DUMP_PATH`/`PG_RESTORE_PATH` → `PATH` hệ thống → đường dẫn chuẩn của macOS/Linux (`/opt/homebrew/Cellar/libpq/*/bin`, `/usr/local/bin`, `/usr/bin`) → fallback chạy qua Docker container `postgres` nếu môi trường dev thiếu client libpq. Mật khẩu kết nối được truyền qua biến môi trường `PGPASSWORD` ngầm, không bao giờ lộ ra command-line arguments (tránh lộ qua `ps aux`).
- **Cơ chế Phục hồi An toàn (Safe Restore Flow)**:
  1. *Khóa đồng thời (Locking)*: Dùng cờ khóa tiến trình trong Redis / bộ nhớ để chặn chạy đồng thời hai tác vụ backup/restore.
  2. *Kiểm tra tính toàn vẹn*: Dùng `pg_restore --list` để kiểm tra tệp dump hợp lệ trước khi chạm vào dữ liệu thật.
  3. *Chụp ảnh an toàn tự động (Pre-Restore Snapshot)*: Hệ thống TỰ ĐỘNG tạo một bản snapshot `pre-restore-<timestamp>.dump` của toàn bộ dữ liệu hiện tại trước khi khôi phục. Nếu quá trình phục hồi gặp lỗi, admin vẫn có sẵn bản snapshot này để khôi phục lại ngay lập tức.
  4. *Ngắt kết nối an toàn*: Ngắt Prisma (`prisma.$disconnect()`), ngắt các session client đang kết nối vào database (`pg_terminate_backend`), dọn dẹp và nạp dữ liệu bằng `pg_restore --clean --if-exists --no-owner --no-privileges`.
  5. *Tái kết nối & Kiểm tra sức khỏe*: Kết nối lại Prisma (`prisma.$connect()`), thực hiện truy vấn kiểm tra dữ liệu, giải phóng khóa và ghi nhật ký kiểm toán.
- **Lịch sao lưu tự động & Quản lý vòng đời (Retention)**: Sử dụng BullMQ repeatable jobs (kết nối Redis sẵn có) hoặc lịch cron để kích hoạt sao lưu tự động theo lịch (mặc định 02:00 hàng ngày). Khi hoàn tất, hệ thống tự động dọn dẹp (prune) các bản backup tự động cũ hơn giới hạn lưu trữ (mặc định giữ 7 bản gần nhất), KHÔNG tự ý xóa các bản backup thủ công hoặc snapshot an toàn của admin.
- **Phân quyền & Audit**: Chỉ tài khoản có vai trò `ADMIN` (CASL subject `Backup`, action `manage`) mới có quyền truy cập module này. Mọi hành động (tạo backup, tải về, upload, phục hồi, xóa, đổi lịch) đều được ghi vào bảng `audit_logs` thông qua `AuditService`.
- **Giao diện Web (`apps/web`)**: Trang `/admin/backups` nằm trong mục "Hệ thống" của Sidebar (chỉ hiển thị cho ADMIN). Giao diện gồm thẻ thống kê dung lượng & số lượng, thanh thao tác (Sao lưu ngay, Tải lên, Cấu hình tự động), bảng danh sách kèm tag phân loại, thanh trạng thái tiến trình thời gian thực, và Modal xác nhận phục hồi với cơ chế gõ từ khóa xác nhận `XAC NHAN` nhằm ngăn chặn thao tác nhầm lẫn.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL 16, BullMQ, Redis, Next.js 15 App Router, TanStack Query, Tailwind CSS 4, `@fcare/ui-kit`.

---

## Global Constraints
- **QUY ĐỊNH BẢO MẬT & CASL**: Module Backup/Restore chứa toàn bộ dữ liệu hệ thống, TUYỆT ĐỐI chỉ dành riêng cho quyền `ADMIN` (`can('manage', 'Backup')`). Các vai trò khác (HEAD_OF_DEPT, LECTURER, TRAINING_OFFICER, SA_OFFICER) không được truy cập API hay nhìn thấy menu.
- **RULE BẢO MẬT PII**: Schema FCare đã tuân thủ triệt để việc không lưu PII (CCCD, SĐT, Email, địa chỉ) sinh viên. Tệp backup phản ánh chính xác cấu trúc này.
- **AN TOÀN PHỤC HỒI**: Bắt buộc tạo bản sao lưu an toàn tự động (Pre-Restore Snapshot) TRƯỚC KHI tiến hành bất kỳ thao tác phục hồi dữ liệu nào. Modal phục hồi phía frontend bắt buộc người dùng nhập chính xác chuỗi `XAC NHAN` hoặc `RESTORE` mới mở nút thực thi.
- **DUNG LƯỢNG & FORMAT**: Sử dụng định dạng nén chuẩn PostgreSQL Custom Format (`.dump`, cờ `-Fc` của `pg_dump`), cho phép nén tối đa, kiểm tra checksum toàn vẹn và phục hồi linh hoạt.
- **CONTAINER & DEV ENVIRONMENT**: Cập nhật `infra/docker/Dockerfile.api` bổ sung `postgresql-client` để các lệnh `pg_dump`/`pg_restore` hoạt động mượt mà trong container production.
- **CHUẨN KIỂM THỬ**: Hoàn thành đầy đủ unit tests cho `pg-runner.service.spec.ts`, `backup.service.spec.ts`, `backup.controller.spec.ts`, kiểm tra kiểu `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`.

---

## Quyết định Thiết kế & Nghiệp vụ

| # | Vấn đề | Quyết định & Đề xuất |
|---|---|---|
| 1 | Định dạng tệp sao lưu | Sử dụng chuẩn **PostgreSQL Custom Format** (`pg_dump -Fc` xuất ra tệp `.dump`). Định dạng này có sẵn nén zlib, chứa đầy đủ schema, data, triggers, sequences, ràng buộc, và hỗ trợ `pg_restore --clean --if-exists`. |
| 2 | Nơi lưu trữ metadata tệp backup | Lưu kèm tệp `.meta.json` ngay tại thư mục `storage/backups/`. Đảm bảo ngay cả khi database bị restore về quá khứ, danh sách các bản backup và lịch sử tệp vật lý trên đĩa không bị mất mát. |
| 3 | An toàn khi phục hồi | 1) Tự động chụp snapshot `pre-restore-<timestamp>.dump` trước khi restore.<br>2) Yêu cầu admin gõ chữ `XAC NHAN` trên giao diện.<br>3) Tạm ngắt kết nối client và Prisma để tránh xung đột bảng.<br>4) Kiểm tra tính toàn vẹn của tệp trước khi restore bằng `pg_restore --list`. |
| 4 | Cơ chế sao lưu tự động | Dùng BullMQ repeatable job (hoặc scheduler của NestJS) chạy ngầm qua Redis. Cấu hình mặc định: Chạy hàng ngày lúc 02:00 sáng (`0 2 * * *`), lưu giữ tối đa 7 bản tự động gần nhất (tự xoá bản tự động cũ hơn). |
| 5 | Tải lên tệp sao lưu ngoại vi | Cho phép admin tải lên tệp `.dump` (tối đa 500MB qua Multer) để lưu trữ hoặc phục hồi khi chuyển máy chủ / cứu hộ dữ liệu. Kiểm tra định dạng qua `pg_restore --list` ngay khi upload. |
| 6 | Audit trail | Ghi nhận các action: `DB_BACKUP_CREATED`, `DB_BACKUP_DOWNLOADED`, `DB_BACKUP_DELETED`, `DB_RESTORE_INITIATED`, `DB_RESTORE_COMPLETED`, `DB_RESTORE_FAILED`, `DB_BACKUP_CONFIG_UPDATED`. |

---

## Cấu trúc File Thay đổi & Tạo mới

```
apps/api/
├── src/
│   ├── casl/
│   │   └── ability.factory.ts                  # [MODIFY] Thêm subject 'Backup'
│   └── modules/
│       └── backup/                             # [NEW MODULE]
│           ├── backup.module.ts                # [NEW] Khai báo module, queue, providers
│           ├── backup.controller.ts            # [NEW] Endpoints quản lý backup & restore
│           ├── backup.controller.spec.ts       # [NEW] Unit tests cho controller
│           ├── backup.service.ts               # [NEW] Nghiệp vụ chính: tạo, xóa, liệt kê, restore, prune
│           ├── backup.service.spec.ts          # [NEW] Unit tests cho backup service
│           ├── pg-runner.service.ts            # [NEW] Dò tìm binary pg_dump/pg_restore & thực thi lệnh
│           ├── pg-runner.service.spec.ts       # [NEW] Unit tests cho pg-runner
│           ├── backup.processor.ts             # [NEW] BullMQ worker xử lý tác vụ backup ngầm
│           ├── backup-scheduler.service.ts     # [NEW] Đăng ký & quản lý lịch sao lưu định kỳ
│           ├── backup.types.ts                 # [NEW] Interface & Types dữ liệu backup/restore
│           └── dto/
│               ├── create-backup.dto.ts        # [NEW] DTO tạo backup thủ công (comment, type)
│               ├── restore-backup.dto.ts       # [NEW] DTO xác nhận phục hồi (confirmation)
│               └── update-schedule-config.dto.ts # [NEW] DTO cấu hình lịch tự động & retention
infra/docker/
└── Dockerfile.api                              # [MODIFY] Thêm postgresql-client vào runtime image
.gitignore                                      # [MODIFY] Bỏ qua thư mục storage/backups/
apps/web/
└── src/
    ├── components/
    │   └── dashboard/
    │       ├── nav-icons.tsx                   # [MODIFY] Thêm icon IconDatabase SVG
    │       └── nav-tree.ts                     # [MODIFY] Thêm route /admin/backups cho ADMIN
    └── app/
        └── (dashboard)/
            └── admin/
                └── backups/                    # [NEW PAGE]
                    ├── page.tsx                # [NEW] Giao diện quản lý sao lưu & phục hồi
                    └── components/             # [NEW]
                        ├── backup-stats.tsx    # [NEW] Thẻ thống kê dung lượng, số bản sao lưu
                        ├── backup-table.tsx    # [NEW] Bảng danh sách bản sao lưu với hành động
                        ├── create-modal.tsx    # [NEW] Modal tạo bản sao lưu thủ công
                        ├── upload-modal.tsx    # [NEW] Modal tải lên tệp sao lưu
                        ├── restore-modal.tsx   # [NEW] Modal xác nhận phục hồi nguy hiểm
                        └── schedule-modal.tsx  # [NEW] Modal cấu hình lịch tự động & retention
```

---

## Chi tiết các Task Thực hiện

### Task 1: Cập nhật CASL Ability & Cấu hình Docker / Storage
**Files:**
- Modify: `apps/api/src/casl/ability.factory.ts`
- Modify: `infra/docker/Dockerfile.api`
- Modify: `.gitignore`

- [x] **Step 1.1: Bổ sung Subject `'Backup'` vào CASL `ability.factory.ts`**
Thêm `'Backup'` vào type `Subjects`. Quyền `ADMIN` đã có `can('manage', 'all')` nên tự động sở hữu toàn quyền `manage Backup`.
- [x] **Step 1.2: Bổ sung `postgresql-client` vào `Dockerfile.api`**
Trong stage runtime của `Dockerfile.api`:
`RUN apk add --no-cache openssl postgresql-client`
- [x] **Step 1.3: Cập nhật `.gitignore`**
Thêm `storage/backups/*.dump` và `storage/backups/*.json` (giữ lại `.gitkeep`).
- [x] **Step 1.4: Chạy kiểm tra kiểu `pnpm --filter @fcare/api typecheck`**

---

### Task 2: Xây dựng Types & DTOs cho Module Backup
**Files:**
- Create: `apps/api/src/modules/backup/backup.types.ts`
- Create: `apps/api/src/modules/backup/dto/create-backup.dto.ts`
- Create: `apps/api/src/modules/backup/dto/restore-backup.dto.ts`
- Create: `apps/api/src/modules/backup/dto/update-schedule-config.dto.ts`

- [x] **Step 2.1: Định nghĩa types trong `backup.types.ts`**
```typescript
export type BackupType = 'MANUAL' | 'SCHEDULED' | 'PRE_RESTORE';
export type BackupStatus = 'COMPLETED' | 'FAILED' | 'IN_PROGRESS';

export interface BackupMetadata {
  id: string;
  filename: string;
  filepath: string;
  sizeBytes: number;
  checksumSha256: string;
  type: BackupType;
  status: BackupStatus;
  createdAt: string;
  createdByStaffId?: string;
  createdByName?: string;
  comment?: string;
  pgVersion?: string;
  errorMessage?: string;
}

export interface BackupScheduleConfig {
  enabled: boolean;
  cronExpression: string; // vd: '0 2 * * *' (02:00 hàng ngày)
  retentionCount: number; // vd: 7 bản
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface BackupOverviewStats {
  totalBackups: number;
  totalSizeBytes: number;
  lastBackupAt?: string;
  scheduleConfig: BackupScheduleConfig;
  isLocked: boolean;
  activeOperation?: {
    type: 'BACKUP' | 'RESTORE';
    startedAt: string;
    targetId?: string;
  };
}
```
- [x] **Step 2.2: Tạo các DTO với `class-validator`**
  - `CreateBackupDto`: `comment?: string;` (tối đa 255 ký tự).
  - `RestoreBackupDto`: `confirmation: string;` (bắt buộc đúng `'XAC NHAN'` hoặc `'RESTORE'`).
  - `UpdateScheduleConfigDto`: `enabled: boolean; cronExpression: string; retentionCount: number;` (retentionCount từ 1 đến 100).
- [x] **Step 2.3: Viết test kiểm thử validation cho DTOs**

---

### Task 3: Xây dựng `PgRunnerService` — Dò tìm Binary & Thực thi An toàn
**Files:**
- Create: `apps/api/src/modules/backup/pg-runner.service.ts`
- Create: `apps/api/src/modules/backup/pg-runner.service.spec.ts`

- [x] **Step 3.1: Viết test `pg-runner.service.spec.ts`**
  - Test tách thông số kết nối từ `DATABASE_URL` (host, port, user, password, dbname).
  - Test phát hiện đường dẫn binary `pg_dump` và `pg_restore`.
  - Test bắt lỗi kết nối hoặc tham số không hợp lệ.
- [x] **Step 3.2: Cài đặt `PgRunnerService`**
  - Phương thức `parseDatabaseUrl(url: string)`: phân tích an toàn URL PostgreSQL, trích xuất hostname, port, username, password, database.
  - Phương thức `resolveBinaries()`: kiểm tra tuần tự các đường dẫn khả dụng (`process.env.PG_DUMP_PATH`, PATH hệ thống, Homebrew libpq `/opt/homebrew/Cellar/libpq/*/bin`, `/usr/local/bin`, `/usr/bin`).
  - Phương thức `dumpToFile(targetPath: string)`: chạy `pg_dump -Fc` với môi trường `PGPASSWORD`, ghi trực tiếp vào `targetPath`.
  - Phương thức `validateDumpFile(filePath: string)`: chạy `pg_restore --list <filePath>` để xác minh tệp dump không bị hỏng.
  - Phương thức `restoreFromFile(sourcePath: string)`: ngắt kết nối khác, chạy `pg_restore --clean --if-exists --no-owner --no-privileges -d <dbname> <sourcePath>`.
- [x] **Step 3.3: Chạy test `pnpm --filter @fcare/api test pg-runner.service.spec.ts`**

---

### Task 4: Xây dựng `BackupService` — Quản lý Bản sao lưu, Khôi phục & Retention
**Files:**
- Create: `apps/api/src/modules/backup/backup.service.ts`
- Create: `apps/api/src/modules/backup/backup.service.spec.ts`

- [x] **Step 4.1: Viết test `backup.service.spec.ts`**
  - Test khởi tạo thư mục lưu trữ `storage/backups/`.
  - Test `listBackups()` sắp xếp theo ngày mới nhất, đọc từ `.meta.json`.
  - Test `createBackup()` tính checksum SHA-256, sinh metadata, lưu đĩa, ghi audit log `DB_BACKUP_CREATED`.
  - Test `restoreBackup()`:
    - Bắt lỗi nếu sai confirmation token.
    - Bắt lỗi nếu file không tồn tại hoặc không hợp lệ.
    - Tự động tạo bản pre-restore snapshot trước khi restore thật.
    - Ngắt và kết nối lại PrismaClient.
    - Ghi audit log `DB_RESTORE_COMPLETED`.
  - Test `deleteBackup()`: xóa cả file `.dump` và `.meta.json`, ghi audit log `DB_BACKUP_DELETED`.
  - Test `pruneOldBackups()`: chỉ xóa các bản sao lưu tự động (`SCHEDULED`) vượt quá `retentionCount`, giữ nguyên bản `MANUAL` và `PRE_RESTORE`.
- [x] **Step 4.2: Cài đặt `BackupService` hoàn chỉnh**
  - Tích hợp `PrismaService`, `AuditService`, `ConfigService`, `PgRunnerService`.
  - Triển khai đầy đủ các phương thức nghiệp vụ nêu trên.
  - Xử lý lock chống race-condition (đảm bảo tại một thời điểm chỉ có 1 tác vụ backup hoặc restore được thực hiện).
- [x] **Step 4.3: Chạy test `pnpm --filter @fcare/api test backup.service.spec.ts`**

---

### Task 5: Xây dựng BullMQ Worker & Scheduler Định kỳ
**Files:**
- Create: `apps/api/src/modules/backup/backup.processor.ts`
- Create: `apps/api/src/modules/backup/backup-scheduler.service.ts`

- [x] **Step 5.1: Cài đặt `backup.processor.ts`**
  - Lắng nghe hàng đợi `BACKUP_QUEUE` với BullMQ processor.
  - Xử lý job `'scheduled-backup'`: gọi `backupService.createBackup({ type: 'SCHEDULED', comment: 'Sao lưu định kỳ tự động' })`, sau đó kích hoạt `pruneOldBackups()`.
- [x] **Step 5.2: Cài đặt `backup-scheduler.service.ts`**
  - Quản lý repeatable job trong BullMQ theo cấu hình (`cronExpression`).
  - Cho phép admin cập nhật lịch (bật/tắt, đổi biểu thức cron, đổi số lượng lưu trữ) ngay lập tức mà không cần restart server.
  - Lưu cấu hình vào `storage/backups/schedule-config.json` để duy trì qua các lần khởi động.

---

### Task 6: Xây dựng `BackupController` & Đăng ký Module trong `AppModule`
**Files:**
- Create: `apps/api/src/modules/backup/backup.controller.ts`
- Create: `apps/api/src/modules/backup/backup.controller.spec.ts`
- Create: `apps/api/src/modules/backup/backup.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [x] **Step 6.1: Viết test `backup.controller.spec.ts`**
  - Kiểm tra các endpoint:
    - `GET /admin/backup`
    - `GET /admin/backup/stats`
    - `POST /admin/backup`
    - `GET /admin/backup/:id/download`
    - `POST /admin/backup/:id/restore`
    - `DELETE /admin/backup/:id`
    - `POST /admin/backup/upload`
    - `GET /admin/backup/config`
    - `PUT /admin/backup/config`
- [x] **Step 6.2: Cài đặt `BackupController`**
  - Áp dụng `@ApiTags('admin')`, `@Controller('admin/backup')`.
  - Áp dụng `@CheckPolicies((ability: AppAbility) => ability.can('manage', 'Backup'))`.
  - Hỗ trợ `StreamableFile` cho download.
  - Hỗ trợ `FileInterceptor('file')` cho upload tệp `.dump`.
  - Rate limiting / Throttle các tác vụ nặng (`@Throttle`).
- [x] **Step 6.3: Cài đặt `BackupModule` và import vào `app.module.ts`**
- [x] **Step 6.4: Chạy test `pnpm --filter @fcare/api test backup.controller.spec.ts`**

---

### Task 7: Cập nhật Điều hướng Web — Icon & Menu Sidebar
**Files:**
- Modify: `apps/web/src/components/dashboard/nav-icons.tsx`
- Modify: `apps/web/src/components/dashboard/nav-tree.ts`
- Modify: `apps/web/src/components/dashboard/nav-tree.test.ts`

- [x] **Step 7.1: Thêm `IconDatabase` SVG vào `nav-icons.tsx`**
Vẽ icon dạng nét SVG (hình trụ cơ sở dữ liệu xếp tầng) với stroke `1.75`, `viewBox="0 0 24 24"`, tô theo `currentColor`.
- [x] **Step 7.2: Thêm mục menu "Sao lưu & Phục hồi" vào `nav-tree.ts`**
Trong hàm `buildNavSections(user)`:
Khi `user.roles.includes('ADMIN')`:
Thêm `{ kind: 'leaf', href: '/admin/backups', label: 'Sao lưu & Phục hồi', icon: IconDatabase }` vào nhóm `Hệ thống`.
- [x] **Step 7.3: Cập nhật unit test `nav-tree.test.ts` và chạy test**
`pnpm --filter @fcare/web test nav-tree.test.ts`

---

### Task 8: Xây dựng Giao diện Admin Sao lưu & Phục hồi (`apps/web`)
**Files:**
- Create: `apps/web/src/app/(dashboard)/admin/backups/page.tsx`
- Create: `apps/web/src/app/(dashboard)/admin/backups/components/backup-stats.tsx`
- Create: `apps/web/src/app/(dashboard)/admin/backups/components/backup-table.tsx`
- Create: `apps/web/src/app/(dashboard)/admin/backups/components/create-modal.tsx`
- Create: `apps/web/src/app/(dashboard)/admin/backups/components/upload-modal.tsx`
- Create: `apps/web/src/app/(dashboard)/admin/backups/components/restore-modal.tsx`
- Create: `apps/web/src/app/(dashboard)/admin/backups/components/schedule-modal.tsx`

- [x] **Step 8.1: Xây dựng `backup-stats.tsx`**
Hiển thị 4 thẻ thông số: Tổng số bản backup, Tổng dung lượng đĩa sử dụng, Lần backup gần nhất, và Trạng thái sao lưu tự động kèm nút cấu hình nhanh.
- [x] **Step 8.2: Xây dựng `backup-table.tsx`**
Bảng dữ liệu hiển thị danh sách bản sao lưu:
- Tên tệp & Ghi chú (Badge loại: Thủ công, Tự động định kỳ, Snapshot trước phục hồi).
- Kích thước tệp (format MB/KB dễ đọc).
- Mã băm SHA-256 (rút gọn kèm nút bấm copy clipboard tiện lợi).
- Thời gian tạo (định dạng ngày giờ Việt Nam kèm thời gian tương đối).
- Người thực hiện (Tên Admin hoặc Hệ thống).
- Hành động: Nút Tải về (gọi `apiDownload`), Nút Phục hồi (mở Modal cảnh báo nguy hiểm), Nút Xóa.
- [x] **Step 8.3: Xây dựng `create-modal.tsx`**
Modal tạo bản sao lưu ngay lập tức: cho phép nhập ghi chú mô tả mục đích sao lưu (vd: "Trước khi import đợt điểm danh FA26").
- [x] **Step 8.4: Xây dựng `upload-modal.tsx`**
Modal tải lên tệp `.dump`: kéo thả hoặc chọn tệp từ máy tính, kiểm tra dung lượng và đuôi tệp.
- [x] **Step 8.5: Xây dựng `restore-modal.tsx` (Safeguard Modal)**
- Cảnh báo màu đỏ nổi bật: thông báo dữ liệu hiện tại sẽ bị thay thế.
- Nêu rõ hệ thống sẽ TỰ ĐỘNG tạo một bản snapshot an toàn trước khi phục hồi.
- Bắt buộc nhập chuỗi xác nhận `XAC NHAN` vào ô input mới cho phép bấm nút "Tiến hành phục hồi".
- Khóa đóng modal và hiển thị trạng thái đang xử lý trong suốt quá trình phục hồi.
- [x] **Step 8.6: Xây dựng `schedule-modal.tsx`**
Modal cấu hình sao lưu định kỳ:
- Công tắc Bật/Tắt sao lưu tự động.
- Lựa chọn tần suất (Hàng ngày lúc 02:00, Mỗi 12 giờ, Hàng tuần vào Chủ nhật, hoặc Tùy chỉnh biểu thức Cron).
- Giới hạn lưu trữ (Retention policy: số lượng bản sao lưu tự động tối đa, mặc định 7 bản).
- [x] **Step 8.7: Lắp ráp trang chính `page.tsx`**
Tích hợp TanStack Query (`useQuery`, `useMutation`), polling trạng thái khi có tiến trình đang chạy (`refetchInterval`), quản lý state và hiển thị thông báo thành công/lỗi.

---

### Task 9: Kiểm thử Tích hợp & Kiểm chứng Toàn diện
**Files:**
- Modify: `docs/superpowers/plans/2026-09-16-admin-backup-restore-database.md` (cập nhật tiến độ)

- [x] **Step 9.1: Chạy toàn bộ kiểm thử và kiểm tra chất lượng mã nguồn**
```bash
pnpm --filter @fcare/api typecheck
pnpm --filter @fcare/api lint
pnpm --filter @fcare/api test
pnpm --filter @fcare/web typecheck
pnpm --filter @fcare/web lint
pnpm --filter @fcare/web test
```
- [x] **Step 9.2: Kiểm chứng thực tế luồng sao lưu & phục hồi trên môi trường dev**
1. Đăng nhập với tài khoản ADMIN, truy cập menu `/admin/backups`.
2. Tạo 1 bản sao lưu thủ công với ghi chú `Test Backup Trước Khi Thử Nghiệm`.
3. Tải về tệp `.dump` và kiểm tra dung lượng hợp lệ.
4. Thử thay đổi 1 bản ghi trong DB (hoặc thêm 1 dòng dữ liệu thử nghiệm).
5. Bấm phục hồi từ bản sao lưu vừa tạo, xác nhận chuỗi `XAC NHAN`.
6. Kiểm tra bản snapshot an toàn `pre-restore-...` đã được tự động sinh ra trong danh sách.
7. Kiểm tra dữ liệu hệ thống đã được hoàn nguyên về đúng trạng thái ban đầu.
8. Kiểm tra bảng `audit_logs` có đầy đủ các bản ghi hành động tương ứng.
