# Term Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng tính năng Quản lý Học kỳ (Term Management) có cấu hình ngày bắt đầu/kết thúc, tự động nhận diện và gán kỳ hiện tại làm mặc định cho các màn hình Thống kê, Sinh viên, Cảnh báo, và chuẩn hóa tạo Lớp học phần.

**Architecture:** Bảng `Term` độc lập trong Prisma schema lưu trữ thông tin kỳ, mùa (`SPRING`, `SUMMER`, `FALL`), năm, ngày bắt đầu/kết thúc và cờ ghi đè `isCurrentOverride`. Tầng backend cung cấp CRUD tại `/api/terms` và endpoint tính toán kỳ hiện tại `/api/terms/current` dựa trên cờ ghi đè hoặc khoảng ngày thực tế. Tầng frontend tích hợp tab Học kỳ vào Danh mục Đào tạo (`/terms`), kèm form gợi ý nhanh theo mùa và tự động điền kỳ hiện tại vào các bộ lọc.

**Tech Stack:** NestJS, Prisma ORM, PostgreSQL, CASL, React 19, Next.js 15 App Router, TanStack Query, TailwindCSS, `@fcare/ui-kit`.

## Global Constraints
- Ràng buộc ngày: `startDate < endDate`.
- Ràng buộc mã kỳ: viết hoa không dấu cách (vd: `SP25`, `SU25`, `FA25`), duy nhất (`@unique`).
- Chỉ tối đa một kỳ được bật `isCurrentOverride = true` tại một thời điểm.
- Giữ nguyên trường `term String` trên các bảng hiện tại (`class_sections`, `evaluations`, `student_term_analyses`, `import_batches`) để đảm bảo tương thích ngược 100%.
- Phân quyền: Mọi nhân sự đã đăng nhập đọc được `/api/terms` & `/api/terms/current`; chỉ `ADMIN` và `TRAINING_OFFICER` mới có quyền tạo/sửa/xóa/đặt kỳ hiện tại.

---

### Task 1: Prisma Schema, Migration & Seed Data

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Consumes: Prisma schema hiện có
- Produces: Model `Term`, Enum `TermSeason`, migration database, dữ liệu seed các kỳ 2025 và 2026

- [ ] **Step 1: Cập nhật schema.prisma**
Thêm enum `TermSeason` và model `Term` vào `apps/api/prisma/schema.prisma`:
```prisma
enum TermSeason {
  SPRING
  SUMMER
  FALL
}

model Term {
  id                String      @id @default(uuid())
  code              String      @unique // vd: "SP25", "SU25", "FA25"
  name              String      // vd: "Spring 2025"
  season            TermSeason
  year              Int         // vd: 2025
  startDate         DateTime
  endDate           DateTime
  isCurrentOverride Boolean     @default(false)
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  @@index([startDate, endDate])
  @@map("terms")
}
```

- [ ] **Step 2: Chạy Prisma Migrate**
Chạy lệnh tạo migration:
```bash
pnpm --filter @fcare/api prisma migrate dev --name add_term_model
```
Xác nhận: Migration tạo thành công và client Prisma được regenerate.

- [ ] **Step 3: Bổ sung Seed Data**
Trong `apps/api/prisma/seed.ts`, bổ sung hàm seed các kỳ:
```typescript
const defaultTerms = [
  { code: 'SP25', name: 'Spring 2025', season: TermSeason.SPRING, year: 2025, startDate: new Date('2025-01-01T00:00:00.000Z'), endDate: new Date('2025-04-30T23:59:59.999Z') },
  { code: 'SU25', name: 'Summer 2025', season: TermSeason.SUMMER, year: 2025, startDate: new Date('2025-05-01T00:00:00.000Z'), endDate: new Date('2025-08-31T23:59:59.999Z'), isCurrentOverride: true },
  { code: 'FA25', name: 'Fall 2025', season: TermSeason.FALL, year: 2025, startDate: new Date('2025-09-01T00:00:00.000Z'), endDate: new Date('2025-12-31T23:59:59.999Z') },
  { code: 'SP26', name: 'Spring 2026', season: TermSeason.SPRING, year: 2026, startDate: new Date('2026-01-01T00:00:00.000Z'), endDate: new Date('2026-04-30T23:59:59.999Z') },
  { code: 'SU26', name: 'Summer 2026', season: TermSeason.SUMMER, year: 2026, startDate: new Date('2026-05-01T00:00:00.000Z'), endDate: new Date('2026-08-31T23:59:59.999Z') },
  { code: 'FA26', name: 'Fall 2026', season: TermSeason.FALL, year: 2026, startDate: new Date('2026-09-01T00:00:00.000Z'), endDate: new Date('2026-12-31T23:59:59.999Z') },
];
for (const term of defaultTerms) {
  await prisma.term.upsert({
    where: { code: term.code },
    update: {},
    create: term,
  });
}
```

- [ ] **Step 4: Chạy seed và kiểm tra**
Chạy:
```bash
pnpm --filter @fcare/api prisma db seed
```
Xác nhận: Dữ liệu seed chạy thành công không có lỗi.

- [ ] **Step 5: Commit**
```bash
git add apps/api/prisma
git commit -m "feat(api): add Term model to prisma schema and seed data"
```

---

### Task 2: Backend Terms Module (DTOs, Service, Controller, Tests)

**Files:**
- Create: `apps/api/src/modules/master-data/dto/term.dto.ts`
- Create: `apps/api/src/modules/master-data/terms.service.ts`
- Create: `apps/api/src/modules/master-data/terms.service.spec.ts`
- Create: `apps/api/src/modules/master-data/terms.controller.ts`
- Modify: `apps/api/src/modules/master-data/master-data.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, CASL `AppAbility`
- Produces: `TermsService`, `TermsController` tại `/api/terms`

- [ ] **Step 1: Viết test failing cho TermsService**
Tạo `apps/api/src/modules/master-data/terms.service.spec.ts` kiểm thử các kịch bản:
- `getCurrentTerm` trả về kỳ override nếu có `isCurrentOverride: true`.
- `getCurrentTerm` trả về kỳ theo ngày nếu không có override.
- `getCurrentTerm` fallback kỳ gần nhất khi ở thời gian nghỉ.
- `create` chặn ngày bắt đầu >= ngày kết thúc (`BadRequestException`).
- `create` chặn trùng mã kỳ (`ConflictException`).
- `setCurrent` tắt cờ các kỳ khác và bật kỳ được chọn trong transaction.
- `delete` chặn xóa nếu đã có `ClassSection` gắn mã kỳ này.

- [ ] **Step 2: Chạy test để xác nhận FAIL**
```bash
pnpm --filter @fcare/api test terms.service.spec.ts
```
Expected: FAIL vì chưa có file `terms.service.ts` và DTOs.

- [ ] **Step 3: Tạo DTOs (`dto/term.dto.ts`)**
Định nghĩa:
- `CreateTermDto`: `code`, `name`, `season`, `year`, `startDate`, `endDate`, `isCurrentOverride?`.
- `UpdateTermDto`: `PartialType(CreateTermDto)`.
- `SetCurrentTermDto`: `isCurrent: boolean`.

- [ ] **Step 4: Hiện thực `terms.service.ts`**
Thực hiện các phương thức:
- `findAll()`
- `getCurrentTerm()`
- `create(dto)`
- `update(id, dto)`
- `setCurrent(id, isCurrent)`
- `delete(id)`

- [ ] **Step 5: Hiện thực `terms.controller.ts` & đăng ký vào `master-data.module.ts`**
Controller với các route:
- `GET /api/terms` (`canRead`)
- `GET /api/terms/current` (`canRead`)
- `POST /api/terms` (`canManage`)
- `PATCH /api/terms/:id` (`canManage`)
- `POST /api/terms/:id/set-current` (`canManage`)
- `DELETE /api/terms/:id` (`canManage`)

- [ ] **Step 6: Chạy lại test để xác nhận PASS**
```bash
pnpm --filter @fcare/api test terms.service.spec.ts
```
Expected: All tests pass.

- [ ] **Step 7: Commit**
```bash
git add apps/api/src/modules/master-data
git commit -m "feat(api): implement terms service and controller with CASL checks"
```

---

### Task 3: Shared Types & Master Data Navigation

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/master-data-tabs.ts`
- Create: `apps/web/src/app/(dashboard)/terms/page.tsx`

**Interfaces:**
- Consumes: Cấu hình `MASTER_DATA_TABS`
- Produces: Type `Term`, route `/terms`

- [ ] **Step 1: Cập nhật type `Term` trong `apps/web/src/lib/types.ts`**
```typescript
export type TermSeason = 'SPRING' | 'SUMMER' | 'FALL';

export interface Term {
  id: string;
  code: string;
  name: string;
  season: TermSeason;
  year: number;
  startDate: string;
  endDate: string;
  isCurrentOverride: boolean;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Thêm tab Học kỳ vào `MASTER_DATA_TABS`**
Trong `apps/web/src/lib/master-data-tabs.ts`:
Thêm `{ key: 'terms', label: 'Học kỳ', singular: 'học kỳ', path: '/terms' }`.

- [ ] **Step 3: Tạo trang `apps/web/src/app/(dashboard)/terms/page.tsx`**
Render `MasterDataView tab="terms"`.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/lib/types.ts apps/web/src/lib/master-data-tabs.ts apps/web/src/app/\(dashboard\)/terms/page.tsx
git commit -m "feat(web): add terms tab and route to master data navigation"
```

---

### Task 4: Frontend Master Data UI for Terms (CRUD & Seasonal Preset)

**Files:**
- Modify: `apps/web/src/components/master-data/master-data-view.tsx`
- Create: `apps/web/src/components/master-data/term-preset-helpers.ts`
- Create: `apps/web/src/components/master-data/term-preset-helpers.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, TanStack Query
- Produces: Quản lý học kỳ hoàn chỉnh tại `/terms`, modal thông minh tự sinh mã và ngày theo mùa, thay thế input term của ClassSection thành Dropdown.

- [ ] **Step 1: Viết test cho `term-preset-helpers.ts`**
Viết helper tính toán:
- `generateTermPreset(year: number, season: TermSeason)` $\rightarrow$ trả về `{ code: 'SP25', name: 'Spring 2025', startDate: '2025-01-01', endDate: '2025-04-30' }`.

- [ ] **Step 2: Chạy test helper xác nhận PASS**
```bash
pnpm --filter @fcare/web test term-preset-helpers.test.ts
```

- [ ] **Step 3: Tích hợp bảng danh sách & Modal tạo/sửa Học kỳ vào `master-data-view.tsx`**
- Hiển thị bảng các kỳ (Mã, Tên, Mùa & Năm, Ngày bắt đầu - kết thúc, Badge Kỳ hiện tại).
- Thêm nút hành động "Đặt làm kỳ hiện tại" gọi endpoint `/api/terms/:id/set-current`.
- Modal tạo kỳ mới: Có selector Năm và 3 nút Mùa (Xuân / Hè / Thu), khi bấm tự động fill mã và ngày vào form.
- Form Lớp học phần (`class-sections`): Đổi ô nhập text `Học kỳ` thành `<Select>` lấy danh sách kỳ đã có.

- [ ] **Step 4: Test giao diện và commit**
```bash
git add apps/web/src/components/master-data
git commit -m "feat(web): add term management UI with seasonal presets and class-section dropdown"
```

---

### Task 5: React Hook `useCurrentTerm` & Tự động gán kỳ mặc định trên các màn hình

**Files:**
- Create: `apps/web/src/lib/use-current-term.ts`
- Modify: `apps/web/src/components/statistics/statistics-view.tsx`
- Modify: `apps/web/src/components/students/student-list-view.tsx`
- Modify: `apps/web/src/components/alerts/alert-list-view.tsx`
- Modify: `apps/web/src/components/students/evaluations-tab.tsx`

**Interfaces:**
- Consumes: `/api/terms/current`
- Produces: Hook `useCurrentTerm()`, auto-selection of active term on initial load.

- [ ] **Step 1: Viết hook `useCurrentTerm`**
Trong `apps/web/src/lib/use-current-term.ts`:
Fetch `/api/terms/current` và `/api/terms`, trả về `{ currentTerm, terms, isLoading }`.

- [ ] **Step 2: Tích hợp vào Thống kê (`statistics-view.tsx`)**
Khi URL chưa có tham số `?term=`, tự động dùng `currentTerm?.code` để build query và hiển thị.

- [ ] **Step 3: Tích hợp vào Danh sách sinh viên (`student-list-view.tsx`)**
Khi URL chưa có tham số `?term=`, tự động set kỳ mặc định là `currentTerm?.code` trong bộ lọc.

- [ ] **Step 4: Tích hợp vào Cảnh báo (`alert-list-view.tsx`)**
Khi URL chưa có tham số `?term=`, tự động set kỳ mặc định là `currentTerm?.code`.

- [ ] **Step 5: Tích hợp vào Tab đánh giá (`evaluations-tab.tsx`)**
Ưu tiên chọn `currentTerm?.code` nếu sinh viên có học môn trong kỳ đó.

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/lib/use-current-term.ts apps/web/src/components
git commit -m "feat(web): integrate useCurrentTerm hook into statistics, students, alerts and evaluations"
```

---

### Task 6: Kiểm thử toàn diện & Verification

- [ ] **Step 1: Chạy toàn bộ backend unit tests**
```bash
pnpm --filter @fcare/api test
```
- [ ] **Step 2: Chạy toàn bộ frontend unit tests & typecheck**
```bash
pnpm --filter @fcare/web test
pnpm --filter @fcare/web typecheck
```
- [ ] **Step 3: Kiểm thử luồng E2E trên trình duyệt**
Xác minh Admin tạo kỳ mới, đặt kỳ hiện tại và kiểm tra các trang tự động áp dụng.
