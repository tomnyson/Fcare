# Import Excel nghiệp vụ & Quản trị CRUD — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quản trị viên nạp dữ liệu học vụ thật từ hai file Excel nguồn vào FCare qua luồng staging → xem trước → commit, rồi CRUD toàn bộ dữ liệu đó trong ứng dụng.

**Architecture:** Một module NestJS mới `imports` tách đôi trách nhiệm: **parser** (thuần, không chạm DB, nhận `ExcelJS.Workbook` → mảng row đã chuẩn hoá) và **committer** (nhận row + Prisma transaction → ghi DB). Giữa hai bước là bảng staging `ImportBatch`/`ImportRow` để admin xem trước rồi mới xác nhận. Chốt chặn PII quét **giá trị ô mọi sheet** chạy trước tất cả, từ chối cả file nếu dính.

**Tech Stack:** NestJS 11 · Prisma 6 (PIN, không nâng 7) · PostgreSQL · ExcelJS 4.4 · Jest 30 + ts-jest · Next.js 15 App Router · TanStack Query · Tailwind 4 · Playwright (thêm mới ở P4)

**Spec:** `docs/superpowers/specs/2026-08-22-excel-import-admin-crud-design.md`

## Global Constraints

Áp dụng cho **mọi task**, không có ngoại lệ:

- **RULE 1 — PII**: CẤM lưu/hiển thị CCCD/CMND, số điện thoại, email, địa chỉ của sinh viên và nhân viên. KHÔNG thêm cột/field này vào schema, DTO, UI hay file Excel xuất ra.
- **RULE 2 — Scope bộ môn**: mọi query chạm sinh viên PHẢI đi qua `deptFilter(user)` (`apps/api/src/common/utils/dept-scope.ts`). LECTURER/HEAD_OF_DEPT chỉ thấy sinh viên bộ môn mình.
- **RULE 3 — Excel I/O**: chỉ HEAD_OF_DEPT, TRAINING_OFFICER, SA_OFFICER, SA_HEAD, ADMIN. LECTURER **không bao giờ** có `import`/`export` (CASL).
- **RULE 4 — Consent gate**: giữ nguyên `ConsentGuard`. Không có email trong DB → không xây luồng nào cần email.
- **Prisma pin v6** — không nâng lên 7.
- **Response envelope** `{ success, data, error }` cho mọi endpoint. Chỉ `StreamableFile` và SSE dùng `@SkipEnvelope`. Module `imports` không có cái nào → **không dùng `@SkipEnvelope`**.
- **Guard chain** giữ nguyên thứ tự: Throttler → Csrf → JwtAuth → Consent → Policies.
- **Kích thước file**: 200–400 dòng là mức thường, 800 là trần cứng.
- **Ngôn ngữ**: mọi chuỗi hiển thị cho người dùng và comment viết bằng tiếng Việt, khớp giọng văn code hiện có.
- **Không commit lên remote, không tạo PR** trừ khi user yêu cầu. `git commit` cục bộ theo từng task thì được.
- **Điều kiện xanh**: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` phải pass trước khi báo hoàn thành bất kỳ task nào.

## Sai lệch so với spec (đã quyết định khi lập kế hoạch)

**Spec §4.2 viết "strip email" cho `lecturer-importer`. Kế hoạch này TỪ CHỐI CẢ FILE thay vì strip.** Lý do: RULE 1 nói "Excel import **từ chối** cột cấm", `assertNoForbiddenColumns` hiện tại cũng từ chối cả file, và UI đã ghi "File chứa cột CCCD/SĐT/email/địa chỉ sẽ bị **từ chối toàn bộ**". Strip sẽ tạo ra ngoại lệ duy nhất phá vỡ tính tuyệt đối của chốt chặn. Hệ quả vận hành: admin phải xoá cột I của sheet `T.Kê` rồi upload lại; thông báo lỗi chỉ đích danh sheet + ô đầu tiên để thao tác đó mất ~30 giây.

**Spec §7 yêu cầu "thao tác gán hàng loạt" ở `/students` nhưng bảng API §6 không liệt kê endpoint tương ứng.** Kế hoạch bổ sung `PATCH /students/bulk-assign-major` (`{ studentIds: string[]; majorId: string }` → `{ updated: number }`), dept-scope bằng `deptFilter(user)` ngay trong `where` của `updateMany` và ghi `AuditLog` với action `STUDENT_BULK_ASSIGN_MAJOR`. Không có endpoint này thì yêu cầu giao diện của §7 không thực hiện được.

**Spec §7 yêu cầu "trạng thái lọc đẩy lên URL search params"; trang `/students` hiện giữ bộ lọc trong `useState`.** Task 13 viết lại trang này để `useSearchParams` là nguồn sự thật, kèm bọc `<Suspense>` — Next 15 bắt buộc khi prerender component dùng `useSearchParams`.

## Cấu trúc file

**Tạo mới — API**

| File | Trách nhiệm |
|---|---|
| `apps/api/src/modules/imports/imports.module.ts` | Đăng ký controller + service + 4 committer |
| `apps/api/src/modules/imports/imports.controller.ts` | 5 endpoint `/imports/*`, CASL, upload guard |
| `apps/api/src/modules/imports/imports.service.ts` | Staging → preview → commit, audit, điều phối parser/committer |
| `apps/api/src/modules/imports/dto/import.dto.ts` | `UploadImportDto` (term), `ImportKindParam` |
| `apps/api/src/modules/imports/types.ts` | `ParsedRow`, `ParseResult` và 4 payload type |
| `apps/api/src/modules/imports/parsers/header-locator.ts` | Định vị cột theo **tên header**, chuẩn hoá tên |
| `apps/api/src/modules/imports/parsers/class-code.ts` | Phân loại mã lớp, suy khoá, sinh `ClassSection.code` |
| `apps/api/src/modules/imports/parsers/catalog-parser.ts` | Sheet `3.1.Môn-BM` → `CatalogPayload[]` |
| `apps/api/src/modules/imports/parsers/lecturer-parser.ts` | Sheet `T.Kê` → `LecturerPayload[]` |
| `apps/api/src/modules/imports/parsers/schedule-parser.ts` | `BL1+BL2` ⊕ `Lịch tool` → `SchedulePayload[]` |
| `apps/api/src/modules/imports/parsers/gradebook-parser.ts` | 21 sheet → `GradebookPayload[]` |
| `apps/api/src/modules/imports/committers/catalog-committer.ts` | Ghi `Department` + `Subject` |
| `apps/api/src/modules/imports/committers/lecturer-committer.ts` | Ghi `Staff` |
| `apps/api/src/modules/imports/committers/schedule-committer.ts` | Ghi `ClassSection` |
| `apps/api/src/modules/imports/committers/gradebook-committer.ts` | Ghi `Student` + `Enrollment` |
| `apps/api/src/modules/master-data/mappings.service.ts` | CRUD `DepartmentAlias` + `ClassMajorRule` |
| `apps/api/src/modules/master-data/dto/mapping.dto.ts` | DTO cho hai bảng ánh xạ |

**Sửa — API**

| File | Sửa gì |
|---|---|
| `apps/api/prisma/schema.prisma` | 4 bảng mới, 2 enum, nới `ClassSection`/`Staff`/`Subject`/`Student` |
| `apps/api/prisma/seed.ts` | Thay 3 bộ môn giả bằng 12 bộ môn thật + 10 rule + 8 alias |
| `apps/api/src/modules/excel/excel-utils.ts` | `loadWorkbook()`, `assertNoForbiddenValues()`, `FORBIDDEN_VALUE_PATTERNS` |
| `apps/api/src/modules/excel/students-excel.service.ts` | Gọi chốt PII mới; xử lý `major` nullable |
| `apps/api/src/modules/excel/grades-excel.service.ts` | Gọi chốt PII mới; xử lý `lecturer` nullable; thêm nhãn `Không đạt` |
| `apps/api/src/modules/enrollments/enrollments.service.ts` | `lecturerId` có thể null |
| `apps/api/src/modules/master-data/class-sections.service.ts` | `lecturerId` optional + lọc `unassigned` |
| `apps/api/src/modules/master-data/dto/class-section.dto.ts` | `lecturerId` optional + query `unassigned` |
| `apps/api/src/modules/master-data/master-data.controller.ts` | 2 controller mới cho bảng ánh xạ |
| `apps/api/src/modules/master-data/master-data.module.ts` | Đăng ký service/controller mới |
| `apps/api/src/modules/students/students.service.ts` | `majorId` nullable, lọc `missingMajor`, gán ngành hàng loạt |
| `apps/api/src/modules/students/dto/student.dto.ts` | `majorId`/`cohort` optional, query `missingMajor`, DTO gán hàng loạt |
| `apps/api/src/modules/students/students.controller.ts` | Endpoint gán ngành hàng loạt |
| `apps/api/src/app.module.ts` | Import `ImportsModule` |

**Tạo mới / sửa — Web**

| File | Trách nhiệm |
|---|---|
| `apps/web/src/components/imports/import-wizard.tsx` *(mới)* | 4 bước: chọn loại → upload+term → xem trước → xác nhận |
| `apps/web/src/components/imports/import-preview.tsx` *(mới)* | Bảng tóm tắt + danh sách lỗi + alias chưa ánh xạ |
| `apps/web/src/components/imports/import-history.tsx` *(mới)* | Lịch sử `ImportBatch` |
| `apps/web/src/components/master-data/mapping-view.tsx` *(mới)* | CRUD gọn cho 2 bảng ánh xạ (không nhồi vào `master-data-view.tsx` đã 453 dòng) |
| `apps/web/src/app/(dashboard)/class-sections/[id]/grades/page.tsx` *(mới)* | Bảng điểm tổng kết, sửa tại chỗ |
| `apps/web/src/app/(dashboard)/import-export/page.tsx` | Thay bằng wizard + lịch sử |
| `apps/web/src/lib/master-data-tabs.ts` | Thêm 2 tab, thêm cờ `view` |
| `apps/web/src/app/(dashboard)/master-data/[tab]/page.tsx` | Route sang `MappingView` khi tab là bảng ánh xạ |
| `apps/web/src/lib/types.ts` | Type cho batch/preview/mapping; `majorId`/`lecturerId` nullable |
| `apps/web/src/app/(dashboard)/students/page.tsx` | Bộ lọc "Chưa gán ngành" + gán hàng loạt |
| `apps/web/src/app/(dashboard)/admin/users/page.tsx` | Cột `Loại GV` |
| `apps/web/playwright.config.ts` *(mới)* | Cấu hình E2E |
| `apps/web/e2e/admin-import.spec.ts` *(mới)* | Luồng E2E admin |

---

## P0 — Chốt chặn PII (chặn toàn bộ task sau)

### Task 1: Quét giá trị ô để bắt PII không có header

**Bối cảnh:** Sheet `T.Kê` của file phân công GV có **32 email ở cột I nhưng không có header**. `assertNoForbiddenColumns()` chỉ dò dòng header nên toàn bộ email này lọt qua. Đã kiểm chứng bằng script: regex dưới đây bắt đúng 32/32 email và **0 báo nhầm** trên cả hai file thật.

**Files:**
- Modify: `apps/api/src/modules/excel/excel-utils.ts`
- Modify: `apps/api/src/modules/excel/students-excel.service.ts:70-71`
- Modify: `apps/api/src/modules/excel/grades-excel.service.ts` (chỗ gọi `loadFirstWorksheet` + `assertNoForbiddenColumns`)
- Test: `apps/api/src/modules/excel/excel-utils.spec.ts` (tạo mới)

**Interfaces:**
- Consumes: `ExcelJS` 4.4, `BadRequestException` từ `@nestjs/common`
- Produces:
  - `loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook>`
  - `assertNoForbiddenValues(workbook: ExcelJS.Workbook): void` — ném `BadRequestException` nếu bất kỳ ô nào ở bất kỳ sheet nào khớp mẫu PII
  - `getWorksheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined`
  - `FORBIDDEN_VALUE_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }>`
  - Giữ nguyên các export cũ: `FORBIDDEN_HEADER_PATTERN`, `loadFirstWorksheet`, `readHeaderRow`, `assertNoForbiddenColumns`, `cellText`, `cellNumber`, `workbookToFile`, `RowError`

- [ ] **Step 1: Viết test đỏ**

Tạo `apps/api/src/modules/excel/excel-utils.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  assertNoForbiddenValues,
  getWorksheet,
  loadWorkbook,
} from './excel-utils';

async function workbookWith(
  sheets: Array<{ name: string; rows: unknown[][] }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) {
      worksheet.addRow(row);
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('assertNoForbiddenValues', () => {
  it('bắt email ở cột KHÔNG có header — lỗ hổng của assertNoForbiddenColumns', async () => {
    const buffer = await workbookWith([
      {
        name: 'T.Kê',
        rows: [
          ['Username', 'Loại GV', 'Họ tên', ''],
          ['vandtb2', 'Full', 'Đinh Thị Bích Vân', 'VanDTB2@fe.edu.vn'],
        ],
      },
    ]);
    const workbook = await loadWorkbook(buffer);
    expect(() => assertNoForbiddenValues(workbook)).toThrow(
      BadRequestException,
    );
  });

  it('thông báo lỗi chỉ đích danh sheet, dòng, cột để admin sửa được ngay', async () => {
    const buffer = await workbookWith([
      { name: 'Sheet1', rows: [['a']] },
      { name: 'T.Kê', rows: [['x'], ['y', 'z', 'w', 'hieunt249@fe.edu.vn']] },
    ]);
    const workbook = await loadWorkbook(buffer);
    let message = '';
    try {
      assertNoForbiddenValues(workbook);
    } catch (error) {
      message = (error as BadRequestException).message;
    }
    expect(message).toContain('T.Kê');
    expect(message).toContain('dòng 2');
    expect(message).toContain('cột 4');
    expect(message).toContain('email');
    // Không được lặp lại chính giá trị PII trong thông báo lỗi.
    expect(message).not.toContain('hieunt249');
  });

  it('quét MỌI sheet, không chỉ sheet đầu tiên', async () => {
    const buffer = await workbookWith([
      { name: 'Sạch', rows: [['MSSV', 'Họ tên'], ['PK00001', 'Nguyễn Văn A']] },
      { name: 'Bẩn', rows: [['0912345678']] },
    ]);
    const workbook = await loadWorkbook(buffer);
    expect(() => assertNoForbiddenValues(workbook)).toThrow(/số điện thoại/);
  });

  it('bắt số CCCD 12 chữ số', async () => {
    const buffer = await workbookWith([{ name: 'S', rows: [['001203004005']] }]);
    const workbook = await loadWorkbook(buffer);
    expect(() => assertNoForbiddenValues(workbook)).toThrow(/CCCD/);
  });

  it('KHÔNG báo nhầm trên dữ liệu học vụ hợp lệ', async () => {
    const buffer = await workbookWith([
      {
        name: 'WEB2064',
        rows: [
          ['#', 'Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết', 'Trạng thái'],
          [1, 'PK00123', 'Trần Thị B', 'WEB2064.01', 8.5, 'Đạt'],
          [2, 'PS01988', 'Lê Văn C', 'SD20301', 4.2, 'Không đạt'],
        ],
      },
      {
        name: '3.1.Môn-BM',
        rows: [
          ['Mã môn', 'Tên môn', 'Bộ môn', '% đi học', 'Số TC'],
          ['WEB2064', 'Web Design', 'CNTT', 0.8, 3],
        ],
      },
    ]);
    const workbook = await loadWorkbook(buffer);
    expect(() => assertNoForbiddenValues(workbook)).not.toThrow();
  });
});

describe('getWorksheet', () => {
  it('lấy sheet theo tên, bỏ qua khoảng trắng thừa', async () => {
    const buffer = await workbookWith([{ name: 'BL1+BL2', rows: [['a']] }]);
    const workbook = await loadWorkbook(buffer);
    expect(getWorksheet(workbook, ' BL1+BL2 ')?.name).toBe('BL1+BL2');
  });

  it('trả undefined khi không có sheet', async () => {
    const buffer = await workbookWith([{ name: 'A', rows: [['a']] }]);
    const workbook = await loadWorkbook(buffer);
    expect(getWorksheet(workbook, 'Không có')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- excel-utils`
Expected: FAIL — `loadWorkbook`, `assertNoForbiddenValues`, `getWorksheet` chưa tồn tại.

- [ ] **Step 3: Cài đặt trong `excel-utils.ts`**

Thêm vào `apps/api/src/modules/excel/excel-utils.ts`, ngay sau `FORBIDDEN_HEADER_PATTERN`:

```ts
/**
 * Mẫu PII dò trên GIÁ TRỊ Ô, không chỉ header. Lý do tồn tại: file phân công GV
 * có cột email không hề có header nên chốt chặn theo header không bắt được.
 * Đã kiểm chứng trên cả hai file nguồn thật: bắt đúng 32/32 email, 0 báo nhầm.
 */
export const FORBIDDEN_VALUE_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
}> = [
  { label: 'email', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  {
    label: 'số điện thoại',
    pattern: /(^|\D)(?:\+?84|0)(?:3|5|7|8|9)\d{8}(\D|$)/,
  },
  { label: 'số CCCD/CMND', pattern: /(^|\D)\d{12}(\D|$)/ },
];

export async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  if (workbook.worksheets.length === 0) {
    throw new BadRequestException('File Excel không có sheet dữ liệu.');
  }
  return workbook;
}

export function getWorksheet(
  workbook: ExcelJS.Workbook,
  name: string,
): ExcelJS.Worksheet | undefined {
  const target = name.trim().toLowerCase();
  return workbook.worksheets.find(
    (sheet) => sheet.name.trim().toLowerCase() === target,
  );
}

/**
 * Quét toàn bộ ô của mọi sheet. Từ chối CẢ FILE nếu dính — không lọc bỏ cột,
 * vì tài liệu nghiệp vụ quy định "Excel import từ chối cột cấm".
 * Thông báo lỗi chỉ vị trí nhưng KHÔNG lặp lại giá trị PII.
 */
export function assertNoForbiddenValues(workbook: ExcelJS.Workbook): void {
  for (const worksheet of workbook.worksheets) {
    let hit: { label: string; row: number; column: number } | undefined;
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (hit) {
        return;
      }
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        if (hit) {
          return;
        }
        const text = cell.text.trim();
        if (text === '') {
          return;
        }
        const matched = FORBIDDEN_VALUE_PATTERNS.find((candidate) =>
          candidate.pattern.test(text),
        );
        if (matched) {
          hit = {
            label: matched.label,
            row: rowNumber,
            column: columnNumber,
          };
        }
      });
    });
    if (hit) {
      throw new BadRequestException(
        `File bị từ chối: sheet "${worksheet.name}" dòng ${hit.row} cột ${hit.column} chứa ${hit.label} — ` +
          'dữ liệu này bị cấm lưu trữ. Hãy xoá cột đó khỏi file rồi tải lên lại.',
      );
    }
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- excel-utils`
Expected: PASS — 7 test.

- [ ] **Step 5: Nối chốt chặn mới vào hai importer cũ**

Trong `apps/api/src/modules/excel/students-excel.service.ts`, thay hai dòng 70–71:

```ts
    const worksheet = await loadFirstWorksheet(buffer);
    assertNoForbiddenColumns(readHeaderRow(worksheet));
```

bằng:

```ts
    const workbook = await loadWorkbook(buffer);
    assertNoForbiddenValues(workbook);
    const worksheet = workbook.worksheets[0]!;
    assertNoForbiddenColumns(readHeaderRow(worksheet));
```

Cập nhật import ở đầu file: bỏ `loadFirstWorksheet`, thêm `assertNoForbiddenValues` và `loadWorkbook`.

Làm y hệt trong `apps/api/src/modules/excel/grades-excel.service.ts`.

- [ ] **Step 6: Test hồi quy — hai importer cũ vẫn chặn đúng**

Thêm vào cuối `apps/api/src/modules/excel/excel-utils.spec.ts`:

```ts
describe('phối hợp hai lớp chặn', () => {
  it('header có chữ "email" vẫn bị assertNoForbiddenColumns chặn', async () => {
    const { assertNoForbiddenColumns } = await import('./excel-utils');
    expect(() => assertNoForbiddenColumns(['MSSV', 'Email'])).toThrow(
      BadRequestException,
    );
  });
});
```

Run: `pnpm --filter @fcare/api test`
Expected: PASS toàn bộ.

- [ ] **Step 7: Kiểm chứng trên file thật**

Chạy script kiểm chứng:

```bash
cat > /tmp/verify-pii.js <<'EOF'
const path = '/Applications/work/Fcare/apps/api/node_modules/exceljs';
const ExcelJS = require(path);
const P = [
  { label: 'email', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { label: 'sđt', pattern: /(^|\D)(?:\+?84|0)(?:3|5|7|8|9)\d{8}(\D|$)/ },
  { label: 'cccd', pattern: /(^|\D)\d{12}(\D|$)/ },
];
(async () => {
  for (const f of process.argv.slice(2)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f);
    let n = 0;
    wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell({ includeEmpty: false }, (c) => {
      if (P.some((p) => p.pattern.test(String(c.text || '').trim()))) n += 1;
    })));
    console.log(`${n} ô dính — ${f.split('/').pop()}`);
  }
})();
EOF
node /tmp/verify-pii.js \
  "docs/gradebook_20260504174543_hoactm_64_119_all_ (1).xlsx" \
  "docs/FPLTN-KH Phân công GV HK Summer 2026.xlsx"
```

Expected: `0 ô dính — gradebook_…xlsx` và `32 ô dính — FPLTN-KH…xlsx`.
Nếu gradebook ra khác 0 → regex báo nhầm, phải siết lại trước khi đi tiếp.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/excel/
git commit -m "fix: quét giá trị ô để bắt PII không có header khi import Excel"
```

---

## P1 — Schema và dữ liệu danh mục

### Task 2: Ba migration Prisma + sửa mọi lỗi kiểu phát sinh

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/modules/excel/students-excel.service.ts:191,220-221`
- Modify: `apps/api/src/modules/enrollments/enrollments.service.ts:83,114`
- Modify: `apps/api/src/modules/master-data/dto/class-section.dto.ts:26`
- Modify: `apps/api/src/modules/students/dto/student.dto.ts`
- Modify: `apps/web/src/lib/types.ts:72,74,112,166`
- Test: chạy lại toàn bộ suite hiện có (không thêm test mới — đây là thay đổi kiểu)

**Interfaces:**
- Produces (Prisma Client sinh ra, các task sau dùng trực tiếp):
  - `DepartmentAlias { id, alias, departmentId }`
  - `ClassMajorRule { id, classPrefix, majorId }`
  - `ImportBatch { id, kind, status, fileName, term, uploadedById, summary, createdAt, committedAt }`
  - `ImportRow { id, batchId, sheet, rowIndex, payload, error }`
  - `enum ImportKind { CATALOG LECTURER SCHEDULE GRADEBOOK }`
  - `enum ImportStatus { PENDING COMMITTED FAILED CANCELLED }`
  - `ClassSection.lecturerId: string | null` + `block, slot, weekdays, room, capacity, trainingTime, startDate, totalHours`
  - `Staff.lecturerType: string | null`, `Staff.username: string | null`
  - `Subject.subjectGroup, hoursTotal, learningMethod, maxStudents, examForm, attendanceRateRequired`
  - `Student.majorId: string | null`, `Student.cohort: string | null` — `Student.departmentId` **vẫn NOT NULL**

- [ ] **Step 1: Thêm bảng mới vào `schema.prisma`**

Chèn vào cuối `apps/api/prisma/schema.prisma`:

```prisma
// ===== Ánh xạ danh mục từ file nguồn =====

// Hai file nguồn dùng hai hệ mã bộ môn khác nhau ("CONG-NGHE-THONG-TIN" vs "CNTT").
// Bảng này để admin tự sửa ánh xạ mà không phải đụng code.
model DepartmentAlias {
  id           String   @id @default(uuid())
  alias        String   @unique
  departmentId String
  createdAt    DateTime @default(now())

  department Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  @@map("department_aliases")
}

// Suy ngành từ tiền tố mã lớp hành chính: "AI21301" → ngành LTAI.
model ClassMajorRule {
  id          String   @id @default(uuid())
  classPrefix String   @unique
  majorId     String
  createdAt   DateTime @default(now())

  major Major @relation(fields: [majorId], references: [id], onDelete: Cascade)

  @@map("class_major_rules")
}

// ===== Staging import Excel =====

enum ImportKind {
  CATALOG
  LECTURER
  SCHEDULE
  GRADEBOOK
}

enum ImportStatus {
  PENDING
  COMMITTED
  FAILED
  CANCELLED
}

model ImportBatch {
  id           String       @id @default(uuid())
  kind         ImportKind
  status       ImportStatus @default(PENDING)
  fileName     String
  term         String
  uploadedById String
  summary      Json // { toCreate, toUpdate, errorCount, warnings, unmappedAliases }
  createdAt    DateTime     @default(now())
  committedAt  DateTime?

  uploadedBy Staff       @relation(fields: [uploadedById], references: [id])
  rows       ImportRow[]

  @@index([kind, status])
  @@map("import_batches")
}

model ImportRow {
  id       String  @id @default(uuid())
  batchId  String
  sheet    String
  rowIndex Int
  payload  Json // dữ liệu đã parse + chuẩn hoá — KHÔNG BAO GIỜ chứa PII
  error    String?

  batch ImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@index([batchId])
  @@map("import_rows")
}
```

- [ ] **Step 2: Thêm back-relation vào các model có sẵn**

Prisma bắt buộc quan hệ hai chiều. Trong `schema.prisma`:

- `model Department` — thêm vào khối quan hệ: `aliases DepartmentAlias[]`
- `model Major` — thêm: `classMajorRules ClassMajorRule[]`
- `model Staff` — thêm: `importBatches ImportBatch[]`

- [ ] **Step 3: Nới các model có sẵn**

`model ClassSection` — thay `lecturerId String` thành `lecturerId String?`, thay `lecturer Staff @relation(...)` thành `lecturer Staff? @relation(...)`, xoá `@unique` khỏi `code`, thêm các cột lịch và `@@unique([code, term])`:

```prisma
model ClassSection {
  id           String    @id @default(uuid())
  code         String
  subjectId    String
  lecturerId   String? // nullable: 76/94 lớp trong file nguồn chưa phân công GV
  term         String
  block        Int? // 1 | 2
  slot         String? // ca học, vd "S1".."S6"
  weekdays     String? // mã thứ, vd "246" | "357"
  room         String?
  capacity     Int?
  trainingTime String? // AM | PM | EV
  startDate    DateTime?
  totalHours   Int?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  subject     Subject      @relation(fields: [subjectId], references: [id])
  lecturer    Staff?       @relation(fields: [lecturerId], references: [id])
  enrollments Enrollment[]

  @@unique([code, term])
  @@map("class_sections")
}
```

`model Staff` — thêm hai trường (giữ nguyên phần còn lại):

```prisma
  username     String? @unique // username nội bộ từ file phân công, KHÔNG phải email
  lecturerType String? // FULL | PART
```

`model Subject` — thêm:

```prisma
  subjectGroup           String?
  hoursTotal             Int?
  learningMethod         String? // TRA | BLE | ONL
  maxStudents            Int?
  examForm               String?
  attendanceRateRequired Float? // file lưu dạng tỉ lệ 0.8, KHÔNG phải 80
```

`model Student` — nới hai trường, **giữ `departmentId` NOT NULL** vì đó là trục của `deptFilter` (RULE 2):

```prisma
  majorId String? // nullable: SV chờ admin gán ngành
  cohort  String? // nullable: không suy được từ mã lớp học phần
  // các trường còn lại của model giữ nguyên, không đụng tới
  major Major? @relation(fields: [majorId], references: [id])
```

- [ ] **Step 4: Sinh ba migration**

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
pnpm --filter @fcare/api exec prisma migrate dev --name add_import_staging_and_mappings --create-only
```

Kiểm tra file SQL sinh ra: phải có `CREATE TABLE department_aliases`, `class_major_rules`, `import_batches`, `import_rows` và hai `CREATE TYPE`. Nếu Prisma gộp cả phần nới cột vào một migration, tách tay thành ba file theo đúng thứ tự:

1. `..._add_import_staging_and_mappings` — 4 bảng + 2 enum
2. `..._extend_class_section_schedule` — cột lịch, `lecturerId` nullable, đổi `@unique` sang `@@unique([code, term])`
3. `..._extend_staff_subject_relax_student` — cột `Staff`/`Subject`, nới `Student`

Trước khi chạy migration 2, thêm câu kiểm tra trùng vào đầu file SQL của nó:

```sql
-- Chặn migration nếu đã tồn tại (code, term) trùng — @@unique sẽ fail giữa chừng.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM class_sections GROUP BY code, term HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Có lớp học phần trùng (code, term) — xử lý dữ liệu trước khi migrate.';
  END IF;
END $$;
```

Áp dụng:

```bash
pnpm --filter @fcare/api exec prisma migrate dev
```

- [ ] **Step 5: Sửa lỗi kiểu ở `students-excel.service.ts`**

Dòng 220–221 hiện là `student.major.code` / `student.major.name`. Sau khi `major` nullable, đổi thành:

```ts
        student.major?.code ?? '',
        student.major?.name ?? '',
```

Ở phần `export`, cột `Khóa` cũng nullable — đổi `student.cohort` thành `student.cohort ?? ''`.

- [ ] **Step 6: Sửa lỗi kiểu ở `enrollments.service.ts`**

Dòng 114, đổi chữ ký `assertCanUpdateGrades`:

```ts
  private assertCanUpdateGrades(
    user: AuthUser,
    lecturerId: string | null,
    studentDepartmentId: string,
  ): void {
```

Và bên trong, chặn trường hợp lớp chưa có GV — giảng viên không được sửa điểm lớp không phải của mình:

```ts
    if (lecturerId !== null && user.id === lecturerId) {
      return;
    }
```

(Thay cho `if (user.id === lecturerId)`. Nếu `lecturerId` là `null` thì `user.id === null` vốn đã false, nhưng viết tường minh để người đọc sau không phải suy luận.)

- [ ] **Step 7: Sửa DTO**

`apps/api/src/modules/master-data/dto/class-section.dto.ts` — `lecturerId` của `CreateClassSectionDto` thành optional:

```ts
  @ApiPropertyOptional({ description: 'ID giảng viên phụ trách — để trống nếu chưa phân công' })
  @IsOptional()
  @IsUUID()
  lecturerId?: string;
```

`apps/api/src/modules/students/dto/student.dto.ts` — **giữ `majorId` và `cohort` BẮT BUỘC** trong `CreateStudentDto`. Lý do: chỉ importer mới tạo sinh viên thiếu ngành; admin tạo tay qua UI thì luôn phải chọn ngành, nhờ đó `departmentId` luôn suy được. Không sửa gì ở bước này — ghi lại quyết định bằng comment ngay trên `majorId`:

```ts
  // BẮT BUỘC dù schema cho nullable: tạo tay qua UI luôn phải chọn ngành để
  // suy ra departmentId (trục của deptFilter). Chỉ importer mới để trống.
```

- [ ] **Step 8: Sửa type phía web**

`apps/web/src/lib/types.ts` — `ClassSection.lecturerId: string | null`, `Student.majorId: string | null`, `Student.cohort: string | null`, `Student.major?: MajorRef | null`. Thêm các trường lịch mới vào `ClassSection` (`block`, `slot`, `weekdays`, `room`, `capacity`, `trainingTime`, `startDate`, `totalHours` — đều optional/nullable) và `lecturerType?: string | null` vào `StaffMember`.

- [ ] **Step 9: Xác nhận toàn bộ xanh**

```bash
pnpm --filter @fcare/api exec prisma generate
pnpm typecheck && pnpm lint && pnpm test
```

Expected: PASS. Nếu còn lỗi kiểu ở file chưa liệt kê, sửa tại chỗ theo cùng nguyên tắc (`?? ''` cho hiển thị, `| null` cho chữ ký hàm) — **không** nới lỏng bằng `any` hay `!`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/prisma apps/api/src apps/web/src/lib/types.ts
git commit -m "feat: schema staging import, ánh xạ danh mục và nới ràng buộc lớp/sinh viên"
```

---

### Task 3: Re-seed 12 bộ môn thật, 10 ngành, 19 alias, 10 quy tắc lớp→ngành

**Bối cảnh:** Seed hiện tại tạo 3 bộ môn giả `SE/AI/GD`. Import sẽ sinh 449 môn học tra bộ môn qua alias — nếu bảng bộ môn sai thì `deptFilter` (RULE 2) hỏng theo.

**Files:**
- Modify: `apps/api/prisma/seed.ts:25-29` (hằng `DEPARTMENTS`) và phần tạo ngành
- Test: `apps/api/prisma/seed.spec.ts` (tạo mới — test thuần trên hằng số, không chạm DB)

**Interfaces:**
- Consumes: Prisma Client từ Task 2
- Produces (các task sau tra cứu theo đúng các mã này):
  - `DEPARTMENTS: Array<{ code: string; name: string }>` — 12 phần tử
  - `MAJORS: Array<{ code: string; name: string; deptCode: string }>` — 10 phần tử
  - `DEPARTMENT_ALIASES: Array<{ alias: string; deptCode: string }>` — 19 phần tử
  - `CLASS_MAJOR_RULES: Array<{ classPrefix: string; majorCode: string }>` — 10 phần tử

- [ ] **Step 1: Viết test đỏ**

Tạo `apps/api/prisma/seed.spec.ts`:

```ts
import {
  CLASS_MAJOR_RULES,
  DEPARTMENT_ALIASES,
  DEPARTMENTS,
  MAJORS,
} from './seed-data';

describe('dữ liệu danh mục seed', () => {
  it('có đúng 12 bộ môn thật, không còn bộ môn giả SE/AI/GD', () => {
    expect(DEPARTMENTS).toHaveLength(12);
    const codes = DEPARTMENTS.map((d) => d.code);
    expect(codes).toContain('CNTT');
    expect(codes).toContain('GDQP');
    expect(codes).not.toContain('SE');
    expect(codes).not.toContain('GD');
  });

  it('mã bộ môn là ASCII, không dấu — dùng làm khoá tra cứu', () => {
    for (const dept of DEPARTMENTS) {
      expect(dept.code).toMatch(/^[A-Z0-9]+$/);
    }
  });

  it('mọi alias trỏ tới một bộ môn có thật', () => {
    const codes = new Set(DEPARTMENTS.map((d) => d.code));
    for (const alias of DEPARTMENT_ALIASES) {
      expect(codes.has(alias.deptCode)).toBe(true);
    }
  });

  it('phủ hết 7 mã bộ môn của sheet "Lịch tool" trừ THUC-TAP-TN', () => {
    const aliases = new Set(DEPARTMENT_ALIASES.map((a) => a.alias));
    for (const raw of [
      'CONG-NGHE-THONG-TIN',
      'CO-BAN',
      'NGON-NGU',
      'THUONG-MAI-DIEN-TU',
      'KINH-TE',
      'THIET-KE-DO-HOA',
      'UNG-DUNG-PHAN-MEM',
    ]) {
      expect(aliases.has(raw)).toBe(true);
    }
    // THUC-TAP-TN cố ý KHÔNG seed: file nguồn không có bộ môn đối ứng,
    // nó phải hiện ra ở bản xem trước để admin ánh xạ tay.
    expect(aliases.has('THUC-TAP-TN')).toBe(false);
  });

  it('phủ hết 12 nhãn bộ môn của sheet "3.1.Môn-BM"', () => {
    const aliases = new Set(DEPARTMENT_ALIASES.map((a) => a.alias));
    for (const raw of [
      'CNTT',
      'Cơ bản',
      'Ngôn ngữ',
      'TMĐT',
      'Kinh tế',
      'TKĐH',
      'UDPM',
      'DLNHKS',
      'Cơ Điện',
      'Kbeauty',
      'QHDN',
      'GDQP',
    ]) {
      expect(aliases.has(raw)).toBe(true);
    }
  });

  it('alias không trùng nhau', () => {
    const aliases = DEPARTMENT_ALIASES.map((a) => a.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it('10 quy tắc lớp→ngành, mỗi quy tắc trỏ tới ngành có thật', () => {
    expect(CLASS_MAJOR_RULES).toHaveLength(10);
    const majorCodes = new Set(MAJORS.map((m) => m.code));
    for (const rule of CLASS_MAJOR_RULES) {
      expect(rule.classPrefix).toMatch(/^[A-Z]{2}$/);
      expect(majorCodes.has(rule.majorCode)).toBe(true);
    }
  });

  it('mọi ngành thuộc về một bộ môn có thật', () => {
    const codes = new Set(DEPARTMENTS.map((d) => d.code));
    expect(MAJORS).toHaveLength(10);
    for (const major of MAJORS) {
      expect(codes.has(major.deptCode)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Cấu hình Jest hiện tại có `rootDir: "src"` nên sẽ **không** nhặt file trong `prisma/`. Sửa `apps/api/package.json`, khối `jest`: đổi `"rootDir": "src"` thành `"rootDir": "."` và thêm `"roots": ["<rootDir>/src", "<rootDir>/prisma"]`, đồng thời đổi `"coverageDirectory": "../coverage"` thành `"coverageDirectory": "./coverage"` và `collectCoverageFrom` thành `["src/**/*.(t|j)s"]`.

Run: `pnpm --filter @fcare/api test -- seed`
Expected: FAIL — `Cannot find module './seed-data'`.

- [ ] **Step 3: Tạo `apps/api/prisma/seed-data.ts`**

```ts
/**
 * Danh mục thật trích từ hai file nguồn (xem spec §2.4).
 * Tách khỏi seed.ts để test được mà không cần kết nối DB.
 */

export const DEPARTMENTS = [
  { code: 'CNTT', name: 'Công nghệ thông tin' },
  { code: 'COBAN', name: 'Cơ bản' },
  { code: 'NGONNGU', name: 'Ngôn ngữ' },
  { code: 'TMDT', name: 'Thương mại điện tử' },
  { code: 'KINHTE', name: 'Kinh tế' },
  { code: 'TKDH', name: 'Thiết kế đồ hoạ' },
  { code: 'UDPM', name: 'Ứng dụng phần mềm' },
  { code: 'DLNHKS', name: 'Du lịch — Nhà hàng — Khách sạn' },
  { code: 'CODIEN', name: 'Cơ điện' },
  { code: 'KBEAUTY', name: 'K-Beauty' },
  { code: 'QHDN', name: 'Quan hệ doanh nghiệp' },
  { code: 'GDQP', name: 'Giáo dục quốc phòng' },
] as const;

export const MAJORS = [
  { code: 'LTAI', name: 'Lập trình trí tuệ nhân tạo', deptCode: 'CNTT' },
  { code: 'LTWE', name: 'Lập trình web', deptCode: 'CNTT' },
  { code: 'PTPM', name: 'Phát triển phần mềm', deptCode: 'CNTT' },
  { code: 'LTGA', name: 'Lập trình game', deptCode: 'CNTT' },
  { code: 'UDPM', name: 'Ứng dụng phần mềm', deptCode: 'UDPM' },
  { code: 'TKDH', name: 'Thiết kế đồ hoạ', deptCode: 'TKDH' },
  { code: 'DIGI', name: 'Digital Marketing', deptCode: 'TMDT' },
  { code: 'TTSK', name: 'Tổ chức sự kiện', deptCode: 'TMDT' },
  { code: 'MASA', name: 'Marketing & Sales', deptCode: 'TMDT' },
  { code: 'LOGI', name: 'Logistics', deptCode: 'KINHTE' },
] as const;

/**
 * Hai file nguồn dùng hai hệ mã khác nhau cho cùng một bộ môn, nên seed cả hai
 * dạng. `THUC-TAP-TN` CỐ Ý không có ở đây — file nguồn không có bộ môn đối ứng,
 * nó phải nổi lên ở bản xem trước để admin ánh xạ tay (spec §8 rủi ro 3).
 */
export const DEPARTMENT_ALIASES = [
  // Dạng viết hoa gạch nối của sheet "Lịch tool"
  { alias: 'CONG-NGHE-THONG-TIN', deptCode: 'CNTT' },
  { alias: 'CO-BAN', deptCode: 'COBAN' },
  { alias: 'NGON-NGU', deptCode: 'NGONNGU' },
  { alias: 'THUONG-MAI-DIEN-TU', deptCode: 'TMDT' },
  { alias: 'KINH-TE', deptCode: 'KINHTE' },
  { alias: 'THIET-KE-DO-HOA', deptCode: 'TKDH' },
  { alias: 'UNG-DUNG-PHAN-MEM', deptCode: 'UDPM' },
  // Nhãn tiếng Việt có dấu của sheet "3.1.Môn-BM"
  { alias: 'CNTT', deptCode: 'CNTT' },
  { alias: 'Cơ bản', deptCode: 'COBAN' },
  { alias: 'Ngôn ngữ', deptCode: 'NGONNGU' },
  { alias: 'TMĐT', deptCode: 'TMDT' },
  { alias: 'Kinh tế', deptCode: 'KINHTE' },
  { alias: 'TKĐH', deptCode: 'TKDH' },
  { alias: 'UDPM', deptCode: 'UDPM' },
  { alias: 'DLNHKS', deptCode: 'DLNHKS' },
  { alias: 'Cơ Điện', deptCode: 'CODIEN' },
  { alias: 'Kbeauty', deptCode: 'KBEAUTY' },
  { alias: 'QHDN', deptCode: 'QHDN' },
  { alias: 'GDQP', deptCode: 'GDQP' },
] as const;

/**
 * Trích từ cột `Ngành` của sheet `BL1+BL2`, đối chiếu với tiền tố mã lớp.
 * LƯU Ý: "UDPM" vừa là mã ngành vừa là mã bộ môn — hai không gian tên khác nhau,
 * không được dùng chung bảng tra.
 */
export const CLASS_MAJOR_RULES = [
  { classPrefix: 'AI', majorCode: 'LTAI' },
  { classPrefix: 'WD', majorCode: 'LTWE' },
  { classPrefix: 'SD', majorCode: 'PTPM' },
  { classPrefix: 'GA', majorCode: 'LTGA' },
  { classPrefix: 'SA', majorCode: 'UDPM' },
  { classPrefix: 'GD', majorCode: 'TKDH' },
  { classPrefix: 'DM', majorCode: 'DIGI' },
  { classPrefix: 'MC', majorCode: 'TTSK' },
  { classPrefix: 'MS', majorCode: 'MASA' },
  { classPrefix: 'LO', majorCode: 'LOGI' },
] as const;
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- seed`
Expected: PASS — 8 test.

- [ ] **Step 5: Nối vào `seed.ts`**

Trong `apps/api/prisma/seed.ts`: xoá hằng `DEPARTMENTS` cũ (dòng 25–29), thêm import:

```ts
import {
  CLASS_MAJOR_RULES,
  DEPARTMENT_ALIASES,
  DEPARTMENTS,
  MAJORS,
} from './seed-data';
```

Sau vòng lặp tạo `Department`, thêm ba vòng lặp upsert idempotent:

```ts
  // ===== Ngành học =====
  for (const major of MAJORS) {
    const department = await prisma.department.findUniqueOrThrow({
      where: { code: major.deptCode },
    });
    await prisma.major.upsert({
      where: { code: major.code },
      update: { name: major.name, departmentId: department.id },
      create: {
        code: major.code,
        name: major.name,
        departmentId: department.id,
      },
    });
  }

  // ===== Alias bộ môn =====
  for (const entry of DEPARTMENT_ALIASES) {
    const department = await prisma.department.findUniqueOrThrow({
      where: { code: entry.deptCode },
    });
    await prisma.departmentAlias.upsert({
      where: { alias: entry.alias },
      update: { departmentId: department.id },
      create: { alias: entry.alias, departmentId: department.id },
    });
  }

  // ===== Quy tắc lớp → ngành =====
  for (const rule of CLASS_MAJOR_RULES) {
    const major = await prisma.major.findUniqueOrThrow({
      where: { code: rule.majorCode },
    });
    await prisma.classMajorRule.upsert({
      where: { classPrefix: rule.classPrefix },
      update: { majorId: major.id },
      create: { classPrefix: rule.classPrefix, majorId: major.id },
    });
  }
```

Cập nhật hằng `STAFF`: các `deptCode` cũ `'SE'` → `'CNTT'`, `'AI'` → `'CNTT'`. Cập nhật mọi chỗ khác trong `seed.ts` còn tham chiếu `'SE'`, `'AI'`, `'GD'` sang mã mới. Xoá phần tự tạo ngành/môn giả nếu nó dựng ngành ngoài danh sách `MAJORS`.

- [ ] **Step 6: Chạy seed trên DB sạch**

```bash
pnpm --filter @fcare/api exec prisma migrate reset --force
```

Expected: chạy hết migration rồi seed không lỗi. Kiểm chứng:

```bash
pnpm --filter @fcare/api exec prisma db execute --stdin <<'SQL'
SELECT
  (SELECT COUNT(*) FROM departments)        AS departments,
  (SELECT COUNT(*) FROM majors)             AS majors,
  (SELECT COUNT(*) FROM department_aliases) AS aliases,
  (SELECT COUNT(*) FROM class_major_rules)  AS rules;
SQL
```

Expected: `departments=12, majors=10, aliases=19, rules=10`.

- [ ] **Step 7: Chạy seed lần hai để chứng minh idempotent**

```bash
pnpm --filter @fcare/api db:seed
```

Expected: không lỗi, các số đếm ở Step 6 giữ nguyên.

- [ ] **Step 8: Cập nhật README**

Trong `README.md`, phần tài khoản demo / dữ liệu mẫu: đổi mô tả 3 bộ môn `SE/AI/GD` thành 12 bộ môn thật và ghi rõ mã bộ môn mới của các tài khoản demo.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma apps/api/package.json README.md
git commit -m "feat: seed 12 bộ môn thật, 10 ngành, 19 alias và 10 quy tắc lớp→ngành"
```

---

## P2 — Đường ống import

### Task 4: Hai tiện ích thuần — định vị header và chuẩn hoá mã lớp

Đây là hai điểm hỏng dễ nhất của cả tính năng (spec §2.1 đặc điểm 1 và 2), nên tách thành hàm thuần, test bằng bảng dữ liệu lấy từ file thật.

**Files:**
- Create: `apps/api/src/modules/imports/parsers/header-locator.ts`
- Create: `apps/api/src/modules/imports/parsers/class-code.ts`
- Test: `apps/api/src/modules/imports/parsers/header-locator.spec.ts`
- Test: `apps/api/src/modules/imports/parsers/class-code.spec.ts`

**Interfaces:**
- Produces (Task 6–9 dùng):
  - `locateHeaders(worksheet: ExcelJS.Worksheet, headerRow: number, wanted: readonly string[]): Map<string, number>`
  - `requireHeaders(map: Map<string, number>, required: readonly string[], sheetName: string): void`
  - `normalizeHeader(raw: string): string`
  - `type ClassKind = 'ADMIN' | 'SECTION'`
  - `interface ParsedClassCode { kind: ClassKind; raw: string; cohort: string | null; majorPrefix: string | null }`
  - `parseClassCode(raw: string): ParsedClassCode | null`
  - `buildSectionCode(subjectCode: string, parsed: ParsedClassCode, term: string): string`

- [ ] **Step 1: Viết test đỏ cho `header-locator`**

Tạo `apps/api/src/modules/imports/parsers/header-locator.spec.ts`:

```ts
import * as ExcelJS from 'exceljs';
import { locateHeaders, normalizeHeader, requireHeaders } from './header-locator';

function sheetWithHeaders(headers: string[], headerRow = 1): ExcelJS.Worksheet {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('test');
  worksheet.getRow(headerRow).values = ['', ...headers];
  return worksheet;
}

describe('normalizeHeader', () => {
  it('bỏ khoảng trắng thừa và hạ chữ thường', () => {
    expect(normalizeHeader('  Điểm  tổng kết ')).toBe('điểm tổng kết');
  });

  it('gộp nhiều khoảng trắng liên tiếp và xuống dòng thành một dấu cách', () => {
    expect(normalizeHeader('Mã\n sinh   viên')).toBe('mã sinh viên');
  });

  it('trả chuỗi rỗng cho ô rỗng', () => {
    expect(normalizeHeader('')).toBe('');
  });
});

describe('locateHeaders', () => {
  it('tìm đúng chỉ số cột theo tên, không theo vị trí', () => {
    // Bố cục thật của sheet SOF1021: Điểm tổng kết ở cột 9.
    const worksheet = sheetWithHeaders([
      '#', 'Mã sinh viên', 'Họ và tên', 'Lớp',
      'Quiz 1', 'Quiz 2', 'Lab 1', 'ASM',
      'Điểm tổng kết', 'Trạng thái',
    ]);
    const map = locateHeaders(worksheet, 1, ['Mã sinh viên', 'Điểm tổng kết', 'Trạng thái']);
    expect(map.get('mã sinh viên')).toBe(2);
    expect(map.get('điểm tổng kết')).toBe(9);
    expect(map.get('trạng thái')).toBe(10);
  });

  it('cùng tên header ở vị trí khác vẫn tìm ra — chứng minh không hardcode chỉ số', () => {
    // Bố cục thật của sheet WEB2072: Điểm tổng kết ở cột 24.
    const columns = Array.from({ length: 23 }, (_, index) => `Cột ${index + 1}`);
    columns[1] = 'Mã sinh viên';
    const worksheet = sheetWithHeaders([...columns, 'Điểm tổng kết']);
    const map = locateHeaders(worksheet, 1, ['Mã sinh viên', 'Điểm tổng kết']);
    expect(map.get('điểm tổng kết')).toBe(24);
  });

  it('đọc được header không nằm ở dòng 1', () => {
    // Sheet BL1+BL2 có header ở dòng 8.
    const worksheet = sheetWithHeaders(['Ngành', 'Kỳ'], 8);
    const map = locateHeaders(worksheet, 8, ['Ngành']);
    expect(map.get('ngành')).toBe(1);
  });

  it('bỏ qua header không nằm trong danh sách cần tìm', () => {
    const worksheet = sheetWithHeaders(['Mã sinh viên', 'Lab 1']);
    const map = locateHeaders(worksheet, 1, ['Mã sinh viên']);
    expect(map.has('lab 1')).toBe(false);
    expect(map.size).toBe(1);
  });

  it('giữ cột đầu tiên khi header trùng tên', () => {
    const worksheet = sheetWithHeaders(['Lớp', 'Lớp']);
    const map = locateHeaders(worksheet, 1, ['Lớp']);
    expect(map.get('lớp')).toBe(1);
  });
});

describe('requireHeaders', () => {
  it('không ném khi đủ cột bắt buộc', () => {
    const map = new Map([['mã sinh viên', 2]]);
    expect(() => requireHeaders(map, ['Mã sinh viên'], 'SOF1021')).not.toThrow();
  });

  it('ném lỗi nêu tên sheet và cột thiếu', () => {
    const map = new Map([['mã sinh viên', 2]]);
    expect(() => requireHeaders(map, ['Mã sinh viên', 'Điểm tổng kết'], 'SOF1021')).toThrow(
      'Sheet "SOF1021" thiếu cột bắt buộc: Điểm tổng kết',
    );
  });
});
```

- [ ] **Step 2: Viết test đỏ cho `class-code`**

Tạo `apps/api/src/modules/imports/parsers/class-code.spec.ts`:

```ts
import { buildSectionCode, parseClassCode } from './class-code';

describe('parseClassCode', () => {
  it('nhận diện lớp hành chính và tách khoá + tiền tố ngành', () => {
    expect(parseClassCode('SD20301')).toEqual({
      kind: 'ADMIN',
      raw: 'SD20301',
      cohort: '20',
      majorPrefix: 'SD',
    });
  });

  it('tách đúng khoá của lớp khoá 21', () => {
    expect(parseClassCode('AI21301')).toEqual({
      kind: 'ADMIN',
      raw: 'AI21301',
      cohort: '21',
      majorPrefix: 'AI',
    });
  });

  it('nhận diện lớp học phần có hậu tố số thứ tự', () => {
    expect(parseClassCode('WEB2064.02')).toEqual({
      kind: 'SECTION',
      raw: 'WEB2064.02',
      cohort: null,
      majorPrefix: null,
    });
  });

  it('nhận diện lớp học phần không có hậu tố', () => {
    expect(parseClassCode('WEB2072')).toEqual({
      kind: 'SECTION',
      raw: 'WEB2072',
      cohort: null,
      majorPrefix: null,
    });
  });

  it('cắt khoảng trắng và viết hoa trước khi phân loại', () => {
    expect(parseClassCode('  sd20301 ')?.kind).toBe('ADMIN');
    expect(parseClassCode('  sd20301 ')?.raw).toBe('SD20301');
  });

  it('trả null cho ô rỗng', () => {
    expect(parseClassCode('')).toBeNull();
    expect(parseClassCode('   ')).toBeNull();
  });
});

describe('buildSectionCode', () => {
  it('lớp hành chính ghép mã môn + lớp + học kỳ', () => {
    const parsed = parseClassCode('SD20301')!;
    expect(buildSectionCode('PMA1011', parsed, 'SU26')).toBe('PMA1011-SD20301-SU26');
  });

  it('lớp học phần chỉ ghép mã lớp + học kỳ', () => {
    const parsed = parseClassCode('WEB2064.02')!;
    expect(buildSectionCode('WEB2064', parsed, 'SU26')).toBe('WEB2064.02-SU26');
  });

  it('hai lớp hành chính khác nhau trong cùng một sheet cho ra hai mã khác nhau', () => {
    // Sheet PMA1011 thật có cả SD20301 lẫn WD20301.
    const a = buildSectionCode('PMA1011', parseClassCode('SD20301')!, 'SU26');
    const b = buildSectionCode('PMA1011', parseClassCode('WD20301')!, 'SU26');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 3: Chạy hai test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- imports/parsers`
Expected: FAIL — không tìm thấy module `./header-locator`, `./class-code`.

- [ ] **Step 4: Cài `header-locator.ts`**

```ts
import type * as ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';

/**
 * Chuẩn hoá tên header để so khớp: hạ chữ thường, gộp mọi khoảng trắng
 * (kể cả xuống dòng trong ô) thành một dấu cách, cắt hai đầu.
 */
export function normalizeHeader(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Trả bản đồ headerĐãChuẩnHoá → chỉ số cột (1-based).
 *
 * BẮT BUỘC dùng thay cho chỉ số cột cố định: số cột điểm thành phần thay đổi
 * theo môn nên `Điểm tổng kết` nằm ở cột 9, 17 hoặc 24 tuỳ sheet (spec §2.1).
 */
export function locateHeaders(
  worksheet: ExcelJS.Worksheet,
  headerRow: number,
  wanted: readonly string[],
): Map<string, number> {
  const wantedSet = new Set(wanted.map(normalizeHeader));
  const found = new Map<string, number>();
  const row = worksheet.getRow(headerRow);

  row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const key = normalizeHeader(String(cell.text ?? ''));
    // Header trùng tên: giữ cột đầu tiên.
    if (wantedSet.has(key) && !found.has(key)) {
      found.set(key, columnNumber);
    }
  });

  return found;
}

/** Ném lỗi nêu rõ sheet nào thiếu cột nào — thông điệp hiện thẳng cho admin. */
export function requireHeaders(
  map: Map<string, number>,
  required: readonly string[],
  sheetName: string,
): void {
  const missing = required.filter((name) => !map.has(normalizeHeader(name)));
  if (missing.length > 0) {
    throw new BadRequestException(
      `Sheet "${sheetName}" thiếu cột bắt buộc: ${missing.join(', ')}`,
    );
  }
}
```

- [ ] **Step 5: Cài `class-code.ts`**

```ts
/** Lớp hành chính: hai chữ cái ngành + hai chữ số khoá + ba chữ số, vd "SD20301". */
const ADMIN_CLASS_PATTERN = /^([A-Z]{2})(\d{2})\d{3}$/;

export type ClassKind = 'ADMIN' | 'SECTION';

export interface ParsedClassCode {
  kind: ClassKind;
  raw: string;
  /** Hai chữ số khoá — chỉ có ở lớp hành chính. */
  cohort: string | null;
  /** Hai chữ cái đầu, tra `ClassMajorRule` — chỉ có ở lớp hành chính. */
  majorPrefix: string | null;
}

/**
 * Cột `Lớp` của gradebook trộn hai loại mã (spec §2.1 đặc điểm 2):
 * lớp hành chính ("SD20301") và lớp học phần ("WEB2064.02", "WEB2072").
 */
export function parseClassCode(raw: string): ParsedClassCode | null {
  const value = raw.trim().toUpperCase();
  if (value === '') {
    return null;
  }

  const match = ADMIN_CLASS_PATTERN.exec(value);
  if (match) {
    return {
      kind: 'ADMIN',
      raw: value,
      cohort: match[2],
      majorPrefix: match[1],
    };
  }

  return { kind: 'SECTION', raw: value, cohort: null, majorPrefix: null };
}

/**
 * Mã lớp học phần trong DB. Với lớp hành chính phải ghép thêm mã môn vì một lớp
 * hành chính học nhiều môn; với lớp học phần thì bản thân mã đã gắn với môn rồi.
 */
export function buildSectionCode(
  subjectCode: string,
  parsed: ParsedClassCode,
  term: string,
): string {
  return parsed.kind === 'ADMIN'
    ? `${subjectCode}-${parsed.raw}-${term}`
    : `${parsed.raw}-${term}`;
}
```

- [ ] **Step 6: Chạy test, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- imports/parsers`
Expected: PASS — 14 test.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/imports/parsers
git commit -m "feat: tiện ích định vị header và chuẩn hoá mã lớp cho import"
```

---

### Task 5: Khung staging — `ImportsModule`, service, controller, CASL

Khung chạy được với **một** loại file duy nhất (`catalog`) làm mẫu; Task 6–9 chỉ cắm parser/committer vào registry.

**Files:**
- Create: `apps/api/src/modules/imports/imports.module.ts`
- Create: `apps/api/src/modules/imports/imports.controller.ts`
- Create: `apps/api/src/modules/imports/imports.service.ts`
- Create: `apps/api/src/modules/imports/dto/import.dto.ts`
- Create: `apps/api/src/modules/imports/types.ts`
- Modify: `apps/api/src/app.module.ts:16-27,63-77` (đăng ký module)
- Modify: `apps/api/src/casl/ability.factory.ts` (thêm subject `Import`)
- Test: `apps/api/src/modules/imports/imports.service.spec.ts`

**Interfaces:**
- Consumes: `assertNoForbiddenValues`, `loadWorkbook` (Task 1); `PrismaService`, `AuditService`
- Produces (Task 6–9 cài đúng hai chữ ký này):
  - `interface ParsedRow { sheet: string; rowIndex: number; payload: Record<string, unknown>; error?: string }`
  - `interface ParseResult { rows: ParsedRow[]; warnings: string[]; unmappedAliases: string[] }`
  - `interface ImportParser { parse(workbook: ExcelJS.Workbook, ctx: ImportContext): Promise<ParseResult> }`
  - `interface CommitResult { created: number; updated: number; skipped: number }`
  - `interface ImportCommitter { commit(rows: ParsedRow[], tx: PrismaTx, ctx: ImportContext): Promise<CommitResult> }`
  - `interface ImportContext { term: string; user: AuthUser; prisma: PrismaService }`
  - `type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>`

- [ ] **Step 1: Viết `types.ts` trước (không cần test — chỉ khai báo kiểu)**

Tạo `apps/api/src/modules/imports/types.ts`:

```ts
import type { PrismaClient } from '@prisma/client';
import type * as ExcelJS from 'exceljs';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';

export type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface ImportContext {
  term: string;
  user: AuthUser;
  prisma: PrismaService;
}

export interface ParsedRow {
  sheet: string;
  rowIndex: number;
  /** Dữ liệu đã chuẩn hoá. KHÔNG BAO GIỜ chứa email/SĐT/CCCD/địa chỉ (RULE 1). */
  payload: Record<string, unknown>;
  /** Dòng lỗi vẫn được lưu để admin thấy ở bản xem trước, nhưng không commit. */
  error?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  warnings: string[];
  /** Mã bộ môn trong file chưa có trong bảng `DepartmentAlias`. */
  unmappedAliases: string[];
}

export interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
}

/** Parser thuần: chỉ đọc workbook, KHÔNG chạm DB. Test được không cần Postgres. */
export interface ImportParser {
  parse(workbook: ExcelJS.Workbook, ctx: ImportContext): Promise<ParseResult>;
}

/** Committer nhận dòng đã parse + transaction, ghi DB. */
export interface ImportCommitter {
  commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    ctx: ImportContext,
  ): Promise<CommitResult>;
}
```

- [ ] **Step 2: Viết test đỏ cho `ImportsService`**

Tạo `apps/api/src/modules/imports/imports.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ImportKind, ImportStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import type { AuthUser } from '../../common/types/auth-user';
import { ImportsService } from './imports.service';
import type { ImportCommitter, ImportParser } from './types';

const user = {
  id: 'staff-1',
  staffCode: 'admin',
  roles: ['ADMIN'],
  departmentId: null,
} as unknown as AuthUser;

function workbookBuffer(headers: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('3.1.Môn-BM');
  worksheet.getRow(1).values = ['', ...headers];
  return workbook.xlsx.writeBuffer() as Promise<Buffer>;
}

function makePrismaMock() {
  const batch = {
    id: 'batch-1',
    kind: ImportKind.CATALOG,
    status: ImportStatus.PENDING,
    fileName: 'a.xlsx',
    term: 'SU26',
    uploadedById: 'staff-1',
    summary: {},
    createdAt: new Date(),
    committedAt: null,
    rows: [
      { id: 'r1', batchId: 'batch-1', sheet: 'S', rowIndex: 2, payload: { code: 'A' }, error: null },
      { id: 'r2', batchId: 'batch-1', sheet: 'S', rowIndex: 3, payload: {}, error: 'hỏng' },
    ],
  };
  return {
    importBatch: {
      create: jest.fn().mockResolvedValue(batch),
      findUnique: jest.fn().mockResolvedValue(batch),
      update: jest.fn().mockResolvedValue({ ...batch, status: ImportStatus.COMMITTED }),
      findMany: jest.fn().mockResolvedValue([batch]),
      delete: jest.fn().mockResolvedValue(batch),
    },
    importRow: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  };
}

describe('ImportsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: { log: jest.Mock };
  let parser: ImportParser;
  let committer: ImportCommitter;
  let service: ImportsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    parser = {
      parse: jest.fn().mockResolvedValue({
        rows: [
          { sheet: 'S', rowIndex: 2, payload: { code: 'A' } },
          { sheet: 'S', rowIndex: 3, payload: {}, error: 'hỏng' },
        ],
        warnings: ['một cảnh báo'],
        unmappedAliases: ['THUC-TAP-TN'],
      }),
    };
    committer = {
      commit: jest.fn().mockResolvedValue({ created: 1, updated: 0, skipped: 0 }),
    };
    service = new ImportsService(prisma as never, audit as never);
    service.register(ImportKind.CATALOG, parser, committer);
  });

  it('quét PII trước khi parse — file có email bị từ chối, không tạo batch', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('T.Kê');
    worksheet.getRow(2).getCell(9).value = 'vandtb2@fe.edu.vn';
    const buffer = (await workbook.xlsx.writeBuffer()) as Buffer;

    await expect(
      service.upload(user, ImportKind.CATALOG, buffer, 'a.xlsx', 'SU26'),
    ).rejects.toThrow(BadRequestException);
    expect(parser.parse).not.toHaveBeenCalled();
    expect(prisma.importBatch.create).not.toHaveBeenCalled();
  });

  it('upload tạo batch PENDING và lưu mọi dòng, kể cả dòng lỗi', async () => {
    const buffer = await workbookBuffer(['Mã môn']);
    await service.upload(user, ImportKind.CATALOG, buffer, 'a.xlsx', 'SU26');

    expect(prisma.importBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: ImportKind.CATALOG,
          status: ImportStatus.PENDING,
          term: 'SU26',
          uploadedById: 'staff-1',
        }),
      }),
    );
    expect(prisma.importRow.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ error: 'hỏng' })]) }),
    );
  });

  it('summary đếm đúng số dòng hợp lệ, dòng lỗi và alias chưa ánh xạ', async () => {
    const buffer = await workbookBuffer(['Mã môn']);
    await service.upload(user, ImportKind.CATALOG, buffer, 'a.xlsx', 'SU26');

    const summary = prisma.importBatch.create.mock.calls[0][0].data.summary;
    expect(summary).toEqual(
      expect.objectContaining({
        totalRows: 2,
        validRows: 1,
        errorCount: 1,
        warnings: ['một cảnh báo'],
        unmappedAliases: ['THUC-TAP-TN'],
      }),
    );
  });

  it('commit chỉ đưa dòng KHÔNG lỗi xuống committer', async () => {
    await service.commit(user, 'batch-1');
    const rows = (committer.commit as jest.Mock).mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({ code: 'A' });
  });

  it('commit chạy trong một transaction và ghi audit log', async () => {
    await service.commit(user, 'batch-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'IMPORT_COMMIT', entity: 'ImportBatch', entityId: 'batch-1' }),
    );
  });

  it('từ chối commit lần hai trên cùng batch', async () => {
    prisma.importBatch.findUnique.mockResolvedValue({
      id: 'batch-1',
      kind: ImportKind.CATALOG,
      status: ImportStatus.COMMITTED,
      term: 'SU26',
      rows: [],
    });
    await expect(service.commit(user, 'batch-1')).rejects.toThrow(BadRequestException);
  });

  it('committer ném lỗi → batch vẫn PENDING, không đánh dấu COMMITTED', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('vi phạm ràng buộc'));
    await expect(service.commit(user, 'batch-1')).rejects.toThrow('vi phạm ràng buộc');
    // $transaction đã rollback; batch giữ nguyên PENDING nên commit lại được sau khi sửa dữ liệu.
    expect(prisma.importBatch.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('batch không tồn tại → NotFoundException', async () => {
    prisma.importBatch.findUnique.mockResolvedValue(null);
    await expect(service.preview(user, 'khong-co')).rejects.toThrow(NotFoundException);
  });

  it('loại file chưa đăng ký parser → BadRequestException', async () => {
    const buffer = await workbookBuffer(['Mã môn']);
    await expect(
      service.upload(user, ImportKind.SCHEDULE, buffer, 'a.xlsx', 'SU26'),
    ).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- imports.service`
Expected: FAIL — không tìm thấy module `./imports.service`.

- [ ] **Step 4: Cài `imports.service.ts`**

```ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImportKind, ImportStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertNoForbiddenValues,
  loadWorkbook,
} from '../excel/excel-utils';
import type {
  ImportCommitter,
  ImportContext,
  ImportParser,
  ParsedRow,
} from './types';

interface Registration {
  parser: ImportParser;
  committer: ImportCommitter;
}

@Injectable()
export class ImportsService {
  private readonly registry = new Map<ImportKind, Registration>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Mỗi loại file đăng ký một cặp parser + committer (gọi trong module). */
  register(
    kind: ImportKind,
    parser: ImportParser,
    committer: ImportCommitter,
  ): void {
    this.registry.set(kind, { parser, committer });
  }

  private require(kind: ImportKind): Registration {
    const registration = this.registry.get(kind);
    if (!registration) {
      throw new BadRequestException(
        `Chưa hỗ trợ import loại "${kind.toLowerCase()}".`,
      );
    }
    return registration;
  }

  async upload(
    user: AuthUser,
    kind: ImportKind,
    buffer: Buffer,
    fileName: string,
    term: string,
  ) {
    const { parser } = this.require(kind);
    const workbook = await loadWorkbook(buffer);

    // RULE 1 — chốt chặn đứng TRƯỚC parser: quét giá trị mọi ô, mọi sheet.
    assertNoForbiddenValues(workbook);

    const ctx: ImportContext = { term, user, prisma: this.prisma };
    const result = await parser.parse(workbook, ctx);
    const errorCount = result.rows.filter((row) => row.error).length;

    const batch = await this.prisma.importBatch.create({
      data: {
        kind,
        status: ImportStatus.PENDING,
        fileName,
        term,
        uploadedById: user.id,
        summary: {
          totalRows: result.rows.length,
          validRows: result.rows.length - errorCount,
          errorCount,
          warnings: result.warnings,
          unmappedAliases: result.unmappedAliases,
        } as Prisma.JsonObject,
      },
    });

    if (result.rows.length > 0) {
      await this.prisma.importRow.createMany({
        data: result.rows.map((row) => ({
          batchId: batch.id,
          sheet: row.sheet,
          rowIndex: row.rowIndex,
          payload: row.payload as Prisma.JsonObject,
          error: row.error ?? null,
        })),
      });
    }

    await this.auditService.log({
      staffId: user.id,
      action: 'IMPORT_UPLOAD',
      entity: 'ImportBatch',
      entityId: batch.id,
      metadata: { kind, fileName, term, totalRows: result.rows.length },
    });

    return this.preview(user, batch.id);
  }

  async preview(user: AuthUser, batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
      include: { rows: { orderBy: [{ sheet: 'asc' }, { rowIndex: 'asc' }] } },
    });
    if (!batch) {
      throw new NotFoundException('Không tìm thấy lượt import.');
    }
    return {
      id: batch.id,
      kind: batch.kind,
      status: batch.status,
      fileName: batch.fileName,
      term: batch.term,
      summary: batch.summary,
      createdAt: batch.createdAt,
      committedAt: batch.committedAt,
      rows: batch.rows.map((row) => ({
        sheet: row.sheet,
        rowIndex: row.rowIndex,
        payload: row.payload,
        error: row.error,
      })),
    };
  }

  async commit(user: AuthUser, batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
      include: { rows: true },
    });
    if (!batch) {
      throw new NotFoundException('Không tìm thấy lượt import.');
    }
    if (batch.status !== ImportStatus.PENDING) {
      throw new BadRequestException(
        'Lượt import này đã được xử lý, không thể commit lại.',
      );
    }

    const { committer } = this.require(batch.kind);
    const validRows: ParsedRow[] = batch.rows
      .filter((row) => !row.error)
      .map((row) => ({
        sheet: row.sheet,
        rowIndex: row.rowIndex,
        payload: row.payload as Record<string, unknown>,
      }));

    const ctx: ImportContext = {
      term: batch.term,
      user,
      prisma: this.prisma,
    };

    const result = await this.prisma.$transaction((tx) =>
      committer.commit(validRows, tx, ctx),
    );

    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.COMMITTED,
        committedAt: new Date(),
        summary: {
          ...(batch.summary as Prisma.JsonObject),
          ...result,
        } as Prisma.JsonObject,
      },
    });

    await this.auditService.log({
      staffId: user.id,
      action: 'IMPORT_COMMIT',
      entity: 'ImportBatch',
      entityId: batch.id,
      metadata: { kind: batch.kind, ...result },
    });

    return result;
  }

  async list(user: AuthUser) {
    const batches = await this.prisma.importBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return batches.map((batch) => ({
      id: batch.id,
      kind: batch.kind,
      status: batch.status,
      fileName: batch.fileName,
      term: batch.term,
      summary: batch.summary,
      createdAt: batch.createdAt,
      committedAt: batch.committedAt,
    }));
  }

  async discard(user: AuthUser, batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('Không tìm thấy lượt import.');
    }
    if (batch.status === ImportStatus.COMMITTED) {
      throw new BadRequestException('Lượt import đã commit, không thể huỷ.');
    }
    await this.prisma.importBatch.delete({ where: { id: batchId } });
    await this.auditService.log({
      staffId: user.id,
      action: 'IMPORT_DISCARD',
      entity: 'ImportBatch',
      entityId: batchId,
    });
    return { id: batchId };
  }
}
```

- [ ] **Step 5: Chạy test, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- imports.service`
Expected: PASS — 9 test.

- [ ] **Step 6: Viết DTO**

Tạo `apps/api/src/modules/imports/dto/import.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class UploadImportDto {
  @ApiProperty({
    description:
      'Học kỳ áp dụng, vd "SU26". Bắt buộc — file nguồn không chứa học kỳ đáng tin cậy.',
    example: 'SU26',
  })
  @IsString()
  @Matches(/^[A-Z]{2}\d{2}$/, {
    message: 'Học kỳ phải có dạng 2 chữ cái + 2 chữ số, vd "SU26".',
  })
  term!: string;
}
```

- [ ] **Step 7: Viết controller**

Tạo `apps/api/src/modules/imports/imports.controller.ts`:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ImportKind } from '@prisma/client';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UploadImportDto } from './dto/import.dto';
import { ImportsService } from './imports.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB — file phân công GV có 449 dòng danh mục.

const KIND_BY_SLUG: Record<string, ImportKind> = {
  catalog: ImportKind.CATALOG,
  lecturer: ImportKind.LECTURER,
  schedule: ImportKind.SCHEDULE,
  gradebook: ImportKind.GRADEBOOK,
};

function requireXlsx(file: Express.Multer.File | undefined): Buffer {
  if (!file) {
    throw new BadRequestException('Thiếu file Excel (field "file").');
  }
  if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new BadRequestException('Chỉ chấp nhận file .xlsx.');
  }
  return file.buffer;
}

function requireKind(slug: string): ImportKind {
  const kind = KIND_BY_SLUG[slug];
  if (!kind) {
    throw new BadRequestException(
      `Loại import không hợp lệ. Chọn một trong: ${Object.keys(KIND_BY_SLUG).join(', ')}.`,
    );
  }
  return kind;
}

/**
 * Import nghiệp vụ theo luồng staging: upload → xem trước → commit.
 * Cùng quyền với module excel: LECTURER KHÔNG BAO GIỜ vào được (RULE 3).
 */
@ApiTags('imports')
@Controller('imports')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('import', 'Excel'))
  list(@CurrentUser() user: AuthUser) {
    return this.importsService.list(user);
  }

  @Post(':kind/upload')
  @CheckPolicies((ability: AppAbility) => ability.can('import', 'Excel'))
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'term'],
      properties: {
        file: { type: 'string', format: 'binary' },
        term: { type: 'string', example: 'SU26' },
      },
    },
  })
  upload(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Body() dto: UploadImportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.importsService.upload(
      user,
      requireKind(kind),
      requireXlsx(file),
      file!.originalname,
      dto.term,
    );
  }

  @Get(':batchId/preview')
  @CheckPolicies((ability: AppAbility) => ability.can('import', 'Excel'))
  preview(
    @CurrentUser() user: AuthUser,
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ) {
    return this.importsService.preview(user, batchId);
  }

  @Post(':batchId/commit')
  @CheckPolicies((ability: AppAbility) => ability.can('import', 'Excel'))
  commit(
    @CurrentUser() user: AuthUser,
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ) {
    return this.importsService.commit(user, batchId);
  }

  @Delete(':batchId')
  @CheckPolicies((ability: AppAbility) => ability.can('import', 'Excel'))
  discard(
    @CurrentUser() user: AuthUser,
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ) {
    return this.importsService.discard(user, batchId);
  }
}
```

- [ ] **Step 8: Viết module**

Tạo `apps/api/src/modules/imports/imports.module.ts`. Registry được nạp trong `onModuleInit` — Task 6–9 sẽ thêm dòng `register(...)` vào đây:

```ts
import { Module, type OnModuleInit } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule implements OnModuleInit {
  constructor(private readonly importsService: ImportsService) {}

  // Task 6–9 cắm parser/committer vào đây.
  onModuleInit(): void {
    // (chưa có loại nào — Task 6 thêm CATALOG)
  }
}
```

- [ ] **Step 9: Đăng ký vào `app.module.ts`**

Thêm `import { ImportsModule } from './modules/imports/imports.module';` cùng nhóm import module khác (giữ thứ tự alphabet: sau `HealthModule`), và thêm `ImportsModule,` vào mảng `imports` ngay sau `ExcelModule`.

- [ ] **Step 10: Viết test quyền cho controller**

Thêm vào `apps/api/src/casl/ability.factory.spec.ts` (nếu chưa có file thì tạo mới với cùng cấu trúc như các spec khác trong `src/casl/`):

```ts
  it('LECTURER không có quyền import — chặn cả module imports mới', () => {
    const ability = factory.createForUser({ ...baseUser, roles: ['LECTURER'] });
    expect(ability.can('import', 'Excel')).toBe(false);
    expect(ability.can('export', 'Excel')).toBe(false);
  });

  it('HEAD_OF_DEPT, TRAINING_OFFICER, SA_OFFICER, SA_HEAD, ADMIN đều import được', () => {
    for (const role of ['HEAD_OF_DEPT', 'TRAINING_OFFICER', 'SA_OFFICER', 'SA_HEAD', 'ADMIN']) {
      const ability = factory.createForUser({ ...baseUser, roles: [role] });
      expect(ability.can('import', 'Excel')).toBe(true);
    }
  });
```

Không cần thêm subject CASL mới: module `imports` dùng lại `can('import','Excel')` sẵn có, nên ma trận quyền RULE 3 không đổi.

- [ ] **Step 11: Chạy toàn bộ test + typecheck**

```bash
pnpm --filter @fcare/api test && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 12: Kiểm tra Swagger nhìn thấy nhóm endpoint mới**

```bash
pnpm --filter @fcare/api dev &
sleep 12
curl -s http://localhost:3001/api/docs-json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d).paths;console.log(Object.keys(p).filter(k=>k.startsWith('/imports')))})"
kill %1
```

Expected: in ra 5 đường dẫn `/imports`, `/imports/{kind}/upload`, `/imports/{batchId}/preview`, `/imports/{batchId}/commit`, `/imports/{batchId}`.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/modules/imports apps/api/src/app.module.ts apps/api/src/casl
git commit -m "feat: khung staging import Excel (upload/preview/commit/discard)"
```

---

### Task 6: Importer 1 — danh mục môn học và bộ môn (`3.1.Môn-BM`)

449 dòng danh mục. Đây là importer chạy **đầu tiên** vì ba importer sau tra `Subject`/`Department` do nó tạo ra.

**Files:**
- Create: `apps/api/src/modules/imports/parsers/catalog.parser.ts`
- Create: `apps/api/src/modules/imports/committers/catalog.committer.ts`
- Modify: `apps/api/src/modules/imports/imports.module.ts` (đăng ký `CATALOG`)
- Test: `apps/api/src/modules/imports/parsers/catalog.parser.spec.ts`
- Test: `apps/api/src/modules/imports/committers/catalog.committer.spec.ts`

**Interfaces:**
- Consumes: `locateHeaders`, `requireHeaders` (Task 4); `ImportParser`, `ImportCommitter`, `ParsedRow`, `ParseResult`, `CommitResult`, `PrismaTx`, `ImportContext` (Task 5)
- Produces:
  - `class CatalogParser implements ImportParser`
  - `class CatalogCommitter implements ImportCommitter`
  - Hình dạng `payload`:
    ```ts
    interface CatalogPayload {
      code: string;            // "Mã môn"
      name: string;            // "Tên môn"
      credits: number;         // "Số TC"
      deptAlias: string;       // giá trị thô cột "Bộ môn"
      subjectGroup: string | null;
      hoursTotal: number | null;
      learningMethod: string | null;
      maxStudents: number | null;
      examForm: string | null;
      attendanceRateRequired: number | null;
    }
    ```

- [ ] **Step 1: Viết test đỏ cho parser**

Tạo `apps/api/src/modules/imports/parsers/catalog.parser.spec.ts`:

```ts
import * as ExcelJS from 'exceljs';
import type { ImportContext } from '../types';
import { CatalogParser } from './catalog.parser';

const HEADERS = [
  'Mã gốc', 'Mã môn', 'Tên môn', 'Nhóm môn', 'Bộ môn', '% đi học',
  'Số giờ thực tế', '', 'Learning method', 'Số SV max/lớp', '',
  'Môn tiên quyết', '', '', 'Hình thức thi', 'Số TC',
];

/** Sheet "3.1.Môn-BM" có header ở DÒNG 2, không phải dòng 1. */
function buildWorkbook(rows: unknown[][]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('3.1.Môn-BM');
  worksheet.getRow(2).values = ['', ...HEADERS];
  rows.forEach((row, index) => {
    worksheet.getRow(3 + index).values = ['', ...row];
  });
  return workbook;
}

const ctx = { term: 'SU26' } as ImportContext;

describe('CatalogParser', () => {
  const parser = new CatalogParser();

  it('parse một dòng đầy đủ', async () => {
    const workbook = buildWorkbook([
      ['ITA107', 'ITA107', 'Nhập môn CNTT', 'SU26', 'CNTT', 0.8, 45, '', 'TRA', 35, '', '', '', '', 'Thi máy', 3],
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payload).toEqual({
      code: 'ITA107',
      name: 'Nhập môn CNTT',
      credits: 3,
      deptAlias: 'CNTT',
      subjectGroup: 'SU26',
      hoursTotal: 45,
      learningMethod: 'TRA',
      maxStudents: 35,
      examForm: 'Thi máy',
      attendanceRateRequired: 0.8,
    });
    expect(result.rows[0].error).toBeUndefined();
  });

  it('giữ "% đi học" ở dạng tỉ lệ 0..1, không nhân 100', async () => {
    const workbook = buildWorkbook([
      ['A', 'A', 'Môn A', '', 'CNTT', 0.8, '', '', '', '', '', '', '', '', '', 3],
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.attendanceRateRequired).toBe(0.8);
  });

  it('dòng thiếu mã môn bị đánh lỗi, không làm hỏng dòng khác', async () => {
    const workbook = buildWorkbook([
      ['', '', 'Môn không mã', '', 'CNTT', '', '', '', '', '', '', '', '', '', '', 3],
      ['B', 'B', 'Môn B', '', 'CNTT', '', '', '', '', '', '', '', '', '', '', 3],
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].error).toContain('Thiếu mã môn');
    expect(result.rows[1].error).toBeUndefined();
  });

  it('dòng thiếu số tín chỉ bị đánh lỗi', async () => {
    const workbook = buildWorkbook([
      ['C', 'C', 'Môn C', '', 'CNTT', '', '', '', '', '', '', '', '', '', '', ''],
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toContain('Số TC');
  });

  it('mã môn trùng nhau: giữ dòng đầu, dòng sau đánh lỗi trùng', async () => {
    const workbook = buildWorkbook([
      ['D', 'D', 'Môn D', '', 'CNTT', '', '', '', '', '', '', '', '', '', '', 3],
      ['D', 'D', 'Môn D lần hai', '', 'CNTT', '', '', '', '', '', '', '', '', '', '', 3],
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toBeUndefined();
    expect(result.rows[1].error).toContain('trùng');
  });

  it('bỏ qua dòng rỗng hoàn toàn', async () => {
    const workbook = buildWorkbook([
      ['E', 'E', 'Môn E', '', 'CNTT', '', '', '', '', '', '', '', '', '', '', 3],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
  });

  it('workbook không có sheet "3.1.Môn-BM" → ném lỗi nêu tên sheet cần có', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Sheet khác');
    await expect(parser.parse(workbook, ctx)).rejects.toThrow('3.1.Môn-BM');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- catalog.parser`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Cài `catalog.parser.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import type * as ExcelJS from 'exceljs';
import { cellNumber, cellText, getWorksheet } from '../../excel/excel-utils';
import type {
  ImportContext,
  ImportParser,
  ParsedRow,
  ParseResult,
} from '../types';
import { locateHeaders, requireHeaders } from './header-locator';

export const CATALOG_SHEET = '3.1.Môn-BM';
const HEADER_ROW = 2;

const COLUMNS = [
  'Mã môn',
  'Tên môn',
  'Số TC',
  'Bộ môn',
  'Nhóm môn',
  '% đi học',
  'Số giờ thực tế',
  'Learning method',
  'Số SV max/lớp',
  'Hình thức thi',
] as const;

function textOrNull(value: string): string | null {
  return value === '' ? null : value;
}

export class CatalogParser implements ImportParser {
  async parse(
    workbook: ExcelJS.Workbook,
    _ctx: ImportContext,
  ): Promise<ParseResult> {
    const worksheet = getWorksheet(workbook, CATALOG_SHEET);
    if (!worksheet) {
      throw new BadRequestException(
        `File thiếu sheet "${CATALOG_SHEET}" — đây không phải file danh mục môn học.`,
      );
    }

    const headers = locateHeaders(worksheet, HEADER_ROW, COLUMNS);
    requireHeaders(headers, ['Mã môn', 'Tên môn', 'Số TC', 'Bộ môn'], CATALOG_SHEET);

    const at = (name: string): number | undefined =>
      headers.get(name.toLowerCase());

    const rows: ParsedRow[] = [];
    const seen = new Set<string>();

    for (
      let rowIndex = HEADER_ROW + 1;
      rowIndex <= worksheet.rowCount;
      rowIndex += 1
    ) {
      const row = worksheet.getRow(rowIndex);
      const code = cellText(row, at('mã môn')!).toUpperCase();
      const name = cellText(row, at('tên môn')!);
      const deptAlias = cellText(row, at('bộ môn')!);
      const credits = cellNumber(row, at('số tc')!);

      // Dòng rỗng hoàn toàn → bỏ hẳn, không tính là lỗi.
      if (code === '' && name === '' && deptAlias === '') {
        continue;
      }

      const payload = {
        code,
        name,
        credits: credits ?? 0,
        deptAlias,
        subjectGroup: textOrNull(cellText(row, at('nhóm môn') ?? 0)),
        hoursTotal: cellNumber(row, at('số giờ thực tế') ?? 0) ?? null,
        learningMethod: textOrNull(cellText(row, at('learning method') ?? 0)),
        maxStudents: cellNumber(row, at('số sv max/lớp') ?? 0) ?? null,
        examForm: textOrNull(cellText(row, at('hình thức thi') ?? 0)),
        attendanceRateRequired: cellNumber(row, at('% đi học') ?? 0) ?? null,
      };

      let error: string | undefined;
      if (code === '') {
        error = 'Thiếu mã môn.';
      } else if (name === '') {
        error = 'Thiếu tên môn.';
      } else if (credits === undefined) {
        error = 'Thiếu hoặc sai định dạng cột "Số TC".';
      } else if (seen.has(code)) {
        error = `Mã môn "${code}" trùng với dòng trước trong cùng file.`;
      }

      if (!error) {
        seen.add(code);
      }
      rows.push({ sheet: CATALOG_SHEET, rowIndex, payload, error });
    }

    return { rows, warnings: [], unmappedAliases: [] };
  }
}
```

> `at(name)` dùng khoá đã chuẩn hoá (chữ thường) vì `locateHeaders` trả bản đồ đã chuẩn hoá. Cột tuỳ chọn thiếu → `at()` trả `undefined` → dùng `?? 0`, và `cellText`/`cellNumber` với cột 0 trả rỗng/`undefined`.

- [ ] **Step 4: Chạy test parser, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- catalog.parser`
Expected: PASS — 7 test.

- [ ] **Step 5: Viết test đỏ cho committer**

Tạo `apps/api/src/modules/imports/committers/catalog.committer.spec.ts`:

```ts
import type { ImportContext, ParsedRow, PrismaTx } from '../types';
import { CatalogCommitter } from './catalog.committer';

function row(payload: Record<string, unknown>, rowIndex = 3): ParsedRow {
  return { sheet: '3.1.Môn-BM', rowIndex, payload };
}

const BASE = {
  name: 'Môn A',
  credits: 3,
  subjectGroup: null,
  hoursTotal: null,
  learningMethod: null,
  maxStudents: null,
  examForm: null,
  attendanceRateRequired: null,
};

function makeTx() {
  return {
    departmentAlias: {
      findMany: jest.fn().mockResolvedValue([
        { alias: 'CNTT', departmentId: 'dept-cntt' },
        { alias: 'CONG-NGHE-THONG-TIN', departmentId: 'dept-cntt' },
      ]),
    },
    subject: {
      findMany: jest.fn().mockResolvedValue([{ id: 'sub-1', code: 'ITA107' }]),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'sub-1' }),
    },
  } as unknown as PrismaTx & {
    departmentAlias: { findMany: jest.Mock };
    subject: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
}

const ctx = { term: 'SU26' } as ImportContext;

describe('CatalogCommitter', () => {
  const committer = new CatalogCommitter();

  it('tạo mới môn chưa có', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ code: 'NEW101', deptAlias: 'CNTT', ...BASE })],
      tx,
      ctx,
    );
    expect(tx.subject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'NEW101', departmentId: 'dept-cntt' }),
      }),
    );
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
  });

  it('cập nhật môn đã có theo mã, không tạo trùng', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ code: 'ITA107', deptAlias: 'CNTT', ...BASE })],
      tx,
      ctx,
    );
    expect(tx.subject.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sub-1' } }),
    );
    expect(tx.subject.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
  });

  it('alias bộ môn chưa ánh xạ → BỎ QUA dòng, KHÔNG đoán bộ môn', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ code: 'X1', deptAlias: 'THUC-TAP-TN', ...BASE })],
      tx,
      ctx,
    );
    expect(tx.subject.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('tra alias phân biệt hoa thường và khoảng trắng thừa', async () => {
    const tx = makeTx();
    await committer.commit([row({ code: 'X2', deptAlias: '  cntt ', ...BASE })], tx, ctx);
    expect(tx.subject.create).toHaveBeenCalled();
  });

  it('chỉ nạp alias và danh sách môn MỘT lần cho cả lô — không N+1', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({ code: 'A1', deptAlias: 'CNTT', ...BASE }, 3),
        row({ code: 'A2', deptAlias: 'CNTT', ...BASE }, 4),
        row({ code: 'A3', deptAlias: 'CNTT', ...BASE }, 5),
      ],
      tx,
      ctx,
    );
    expect(tx.departmentAlias.findMany).toHaveBeenCalledTimes(1);
    expect(tx.subject.findMany).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- catalog.committer`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 7: Cài `catalog.committer.ts`**

```ts
import type {
  CommitResult,
  ImportCommitter,
  ImportContext,
  ParsedRow,
  PrismaTx,
} from '../types';

interface CatalogPayload {
  code: string;
  name: string;
  credits: number;
  deptAlias: string;
  subjectGroup: string | null;
  hoursTotal: number | null;
  learningMethod: string | null;
  maxStudents: number | null;
  examForm: string | null;
  attendanceRateRequired: number | null;
}

/** Khoá tra alias: cắt khoảng trắng + hạ chữ thường. */
function aliasKey(raw: string): string {
  return raw.trim().toLowerCase();
}

export class CatalogCommitter implements ImportCommitter {
  async commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    _ctx: ImportContext,
  ): Promise<CommitResult> {
    // Nạp một lần cho cả lô (449 dòng) — tránh N+1.
    const aliases = await tx.departmentAlias.findMany({
      select: { alias: true, departmentId: true },
    });
    const departmentByAlias = new Map(
      aliases.map((entry) => [aliasKey(entry.alias), entry.departmentId]),
    );

    const codes = rows.map((row) => (row.payload as unknown as CatalogPayload).code);
    const existing = await tx.subject.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const idByCode = new Map(existing.map((s) => [s.code, s.id]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const payload = row.payload as unknown as CatalogPayload;
      const departmentId = departmentByAlias.get(aliasKey(payload.deptAlias));

      // Alias chưa ánh xạ → bỏ qua. KHÔNG đoán bộ môn: gán sai sẽ phá
      // deptFilter và cho giảng viên thấy sinh viên bộ môn khác (RULE 2).
      if (!departmentId) {
        skipped += 1;
        continue;
      }

      const data = {
        name: payload.name,
        credits: payload.credits,
        departmentId,
        subjectGroup: payload.subjectGroup,
        hoursTotal: payload.hoursTotal,
        learningMethod: payload.learningMethod,
        maxStudents: payload.maxStudents,
        examForm: payload.examForm,
        attendanceRateRequired: payload.attendanceRateRequired,
      };

      const existingId = idByCode.get(payload.code);
      if (existingId) {
        await tx.subject.update({ where: { id: existingId }, data });
        updated += 1;
      } else {
        await tx.subject.create({ data: { code: payload.code, ...data } });
        created += 1;
      }
    }

    return { created, updated, skipped };
  }
}
```

- [ ] **Step 8: Chạy test, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- catalog`
Expected: PASS — 12 test (7 parser + 5 committer).

- [ ] **Step 9: Bổ sung phát hiện alias chưa ánh xạ ở parser**

Parser hiện trả `unmappedAliases: []`. Bản xem trước phải nêu ra `THUC-TAP-TN` (rủi ro #3), nhưng parser là hàm thuần không chạm DB — nên `ImportsService` là chỗ tra. Thêm vào `ImportsService.upload`, ngay sau `parser.parse`:

```ts
    // Alias bộ môn có trong file nhưng chưa có trong bảng ánh xạ → hiện ở
    // bản xem trước để admin gán trước khi commit (spec §8 rủi ro 3).
    const fileAliases = new Set(
      result.rows
        .map((row) => String(row.payload.deptAlias ?? '').trim())
        .filter((alias) => alias !== ''),
    );
    if (fileAliases.size > 0) {
      const known = await this.prisma.departmentAlias.findMany({
        select: { alias: true },
      });
      const knownKeys = new Set(known.map((entry) => entry.alias.trim().toLowerCase()));
      for (const alias of fileAliases) {
        if (!knownKeys.has(alias.toLowerCase())) {
          result.unmappedAliases.push(alias);
        }
      }
    }
```

Thêm test tương ứng vào `imports.service.spec.ts`:

```ts
  it('gom alias bộ môn chưa ánh xạ từ payload vào summary', async () => {
    prisma.departmentAlias = { findMany: jest.fn().mockResolvedValue([{ alias: 'CNTT' }]) };
    (parser.parse as jest.Mock).mockResolvedValue({
      rows: [
        { sheet: 'S', rowIndex: 3, payload: { deptAlias: 'CNTT' } },
        { sheet: 'S', rowIndex: 4, payload: { deptAlias: 'THUC-TAP-TN' } },
      ],
      warnings: [],
      unmappedAliases: [],
    });
    const buffer = await workbookBuffer(['Mã môn']);
    await service.upload(user, ImportKind.CATALOG, buffer, 'a.xlsx', 'SU26');
    const summary = prisma.importBatch.create.mock.calls[0][0].data.summary;
    expect(summary.unmappedAliases).toEqual(['THUC-TAP-TN']);
  });
```

Và thêm `departmentAlias: { findMany: jest.fn().mockResolvedValue([]) }` vào `makePrismaMock()` để các test cũ không hỏng.

- [ ] **Step 10: Đăng ký `CATALOG` vào module**

Sửa `imports.module.ts`:

```ts
import { Module, type OnModuleInit } from '@nestjs/common';
import { ImportKind } from '@prisma/client';
import { CatalogCommitter } from './committers/catalog.committer';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { CatalogParser } from './parsers/catalog.parser';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule implements OnModuleInit {
  constructor(private readonly importsService: ImportsService) {}

  onModuleInit(): void {
    this.importsService.register(
      ImportKind.CATALOG,
      new CatalogParser(),
      new CatalogCommitter(),
    );
  }
}
```

- [ ] **Step 11: Kiểm chứng bằng file thật**

Với API đang chạy và DB đã seed:

```bash
# đăng nhập lấy cookie
curl -s -c /tmp/fc.txt -H 'X-Requested-With: XMLHttpRequest' -H 'Content-Type: application/json' \
  -d '{"staffCode":"admin","password":"Fcare@123"}' http://localhost:3001/api/auth/login > /dev/null
curl -s -b /tmp/fc.txt -c /tmp/fc.txt -X POST -H 'X-Requested-With: XMLHttpRequest' \
  http://localhost:3001/api/auth/consent > /dev/null

curl -s -b /tmp/fc.txt -X POST -H 'X-Requested-With: XMLHttpRequest' \
  -F 'term=SU26' \
  -F 'file=@docs/FPLTN-KH Phân công GV HK Summer 2026.xlsx' \
  http://localhost:3001/api/imports/catalog/upload | head -c 1200
```

Expected: **bị từ chối** với thông điệp PII nêu sheet `T.Kê` dòng 2 cột 9 chứa email — đây là hành vi đúng (Task 1). Để kiểm chứng phần danh mục, tạo bản sao đã xoá cột email:

```bash
node -e "
const ExcelJS=require('./apps/api/node_modules/exceljs');
(async()=>{
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.readFile('docs/FPLTN-KH Phân công GV HK Summer 2026.xlsx');
  wb.getWorksheet('T.Kê').spliceColumns(9,1);
  await wb.xlsx.writeFile('/private/tmp/claude-501/-Applications-work-Fcare/3ab28634-9905-40f5-bf4f-80901a2f9a67/scratchpad/phancong-sach.xlsx');
})();
"
curl -s -b /tmp/fc.txt -X POST -H 'X-Requested-With: XMLHttpRequest' -F 'term=SU26' \
  -F 'file=@/private/tmp/claude-501/-Applications-work-Fcare/3ab28634-9905-40f5-bf4f-80901a2f9a67/scratchpad/phancong-sach.xlsx' \
  http://localhost:3001/api/imports/catalog/upload | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.summary))"
```

Expected: `totalRows` ≈ 449, `errorCount` nhỏ, `unmappedAliases` chứa đúng những alias không seed. Commit thử rồi đếm:

```bash
BATCH=$(curl -s -b /tmp/fc.txt http://localhost:3001/api/imports | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data[0].id))")
curl -s -b /tmp/fc.txt -X POST -H 'X-Requested-With: XMLHttpRequest' http://localhost:3001/api/imports/$BATCH/commit
pnpm --filter @fcare/api exec prisma db execute --stdin <<'SQL'
SELECT COUNT(*) AS subjects FROM subjects;
SQL
```

Expected: số môn > 400.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/modules/imports
git commit -m "feat: importer danh mục môn học và bộ môn từ sheet 3.1.Môn-BM"
```

---

### Task 7: Importer 2 — danh sách giảng viên (`T.Kê`)

Sheet này là nơi lỗ hổng PII nằm (cột I email không header). Task 1 đã chặn ở tầng workbook, task này **thêm một lớp nữa**: parser chỉ đọc đúng 3 cột đã kiểm chứng, không bao giờ đọc cột I.

**Files:**
- Create: `apps/api/src/modules/imports/parsers/lecturer.parser.ts`
- Create: `apps/api/src/modules/imports/committers/lecturer.committer.ts`
- Modify: `apps/api/src/modules/imports/imports.module.ts`
- Test: `apps/api/src/modules/imports/parsers/lecturer.parser.spec.ts`
- Test: `apps/api/src/modules/imports/committers/lecturer.committer.spec.ts`

**Interfaces:**
- Consumes: `getWorksheet`, `cellText` (Task 1/hiện có); `generateTempPassword` (`apps/api/src/common/utils/temp-password`); `hashPassword` (`apps/api/src/modules/auth/auth.service`)
- Produces:
  - `class LecturerParser implements ImportParser`
  - `class LecturerCommitter implements ImportCommitter`
  - Payload: `interface LecturerPayload { username: string; fullName: string; lecturerType: 'FULL' | 'PART' | null }`

- [ ] **Step 1: Viết test đỏ cho parser**

Tạo `apps/api/src/modules/imports/parsers/lecturer.parser.spec.ts`:

```ts
import * as ExcelJS from 'exceljs';
import type { ImportContext } from '../types';
import { LecturerParser } from './lecturer.parser';

/**
 * Header của sheet "T.Kê" LỆCH so với dữ liệu (ô G header là "36", dữ liệu là
 * họ tên) nên parser ánh xạ theo VỊ TRÍ đã kiểm chứng: A=username, F=loại GV,
 * G=họ tên. Cột I là email — parser KHÔNG BAO GIỜ chạm tới.
 */
function buildWorkbook(rows: Array<Record<number, unknown>>): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('T.Kê');
  worksheet.getRow(1).values = ['', 'Username', '', '', '', '', 'Loại GV', '36'];
  rows.forEach((cells, index) => {
    const row = worksheet.getRow(2 + index);
    for (const [column, value] of Object.entries(cells)) {
      row.getCell(Number(column)).value = value as ExcelJS.CellValue;
    }
  });
  return workbook;
}

const ctx = { term: 'SU26' } as ImportContext;

describe('LecturerParser', () => {
  const parser = new LecturerParser();

  it('đọc username, họ tên, loại GV theo đúng vị trí cột', async () => {
    const workbook = buildWorkbook([{ 1: 'vandtb2', 6: 'Full', 7: 'Đỗ Thị Bình Vân' }]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload).toEqual({
      username: 'vandtb2',
      fullName: 'Đỗ Thị Bình Vân',
      lecturerType: 'FULL',
    });
  });

  it('ánh xạ Part → PART', async () => {
    const workbook = buildWorkbook([{ 1: 'a1', 6: 'Part', 7: 'Nguyễn Văn A' }]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.lecturerType).toBe('PART');
  });

  it('loại GV rỗng hoặc lạ → null, không đoán', async () => {
    const workbook = buildWorkbook([{ 1: 'a2', 6: '', 7: 'Nguyễn Văn B' }]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.lecturerType).toBeNull();
  });

  it('KHÔNG đọc cột I dù cột đó có dữ liệu — payload không chứa email', async () => {
    const workbook = buildWorkbook([
      { 1: 'a3', 6: 'Full', 7: 'Nguyễn Văn C', 9: 'nguyenvanc@fe.edu.vn' },
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(JSON.stringify(result.rows[0].payload)).not.toContain('@');
    expect(Object.keys(result.rows[0].payload).sort()).toEqual([
      'fullName',
      'lecturerType',
      'username',
    ]);
  });

  it('dòng thiếu username bị đánh lỗi', async () => {
    const workbook = buildWorkbook([{ 1: '', 6: 'Full', 7: 'Không username' }]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toContain('username');
  });

  it('dòng thiếu họ tên bị đánh lỗi', async () => {
    const workbook = buildWorkbook([{ 1: 'a4', 6: 'Full', 7: '' }]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toContain('họ tên');
  });

  it('username trùng trong cùng file → dòng sau đánh lỗi', async () => {
    const workbook = buildWorkbook([
      { 1: 'dup', 6: 'Full', 7: 'Một' },
      { 1: 'dup', 6: 'Full', 7: 'Hai' },
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[1].error).toContain('trùng');
  });

  it('thiếu sheet "T.Kê" → ném lỗi nêu tên sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Khác');
    await expect(parser.parse(workbook, ctx)).rejects.toThrow('T.Kê');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- lecturer.parser`
Expected: FAIL.

- [ ] **Step 3: Cài `lecturer.parser.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import type * as ExcelJS from 'exceljs';
import { cellText, getWorksheet } from '../../excel/excel-utils';
import type {
  ImportContext,
  ImportParser,
  ParsedRow,
  ParseResult,
} from '../types';

export const LECTURER_SHEET = 'T.Kê';
const DATA_START_ROW = 2;

/**
 * Header sheet này KHÔNG tin được (ô G header là "36" trong khi dữ liệu là họ
 * tên) nên ánh xạ theo vị trí cột đã kiểm chứng trên file thật.
 * CỐ Ý bỏ cột I (email): RULE 1 cấm lưu email. Đây là lớp chặn thứ hai sau
 * assertNoForbiddenValues.
 */
const COL_USERNAME = 1;
const COL_TYPE = 6;
const COL_FULL_NAME = 7;

function parseLecturerType(raw: string): 'FULL' | 'PART' | null {
  const value = raw.trim().toUpperCase();
  if (value === 'FULL') return 'FULL';
  if (value === 'PART') return 'PART';
  return null;
}

export class LecturerParser implements ImportParser {
  async parse(
    workbook: ExcelJS.Workbook,
    _ctx: ImportContext,
  ): Promise<ParseResult> {
    const worksheet = getWorksheet(workbook, LECTURER_SHEET);
    if (!worksheet) {
      throw new BadRequestException(
        `File thiếu sheet "${LECTURER_SHEET}" — đây không phải file danh sách giảng viên.`,
      );
    }

    const rows: ParsedRow[] = [];
    const seen = new Set<string>();

    for (
      let rowIndex = DATA_START_ROW;
      rowIndex <= worksheet.rowCount;
      rowIndex += 1
    ) {
      const row = worksheet.getRow(rowIndex);
      const username = cellText(row, COL_USERNAME).trim();
      const fullName = cellText(row, COL_FULL_NAME).trim();

      if (username === '' && fullName === '') {
        continue;
      }

      const payload = {
        username,
        fullName,
        lecturerType: parseLecturerType(cellText(row, COL_TYPE)),
      };

      let error: string | undefined;
      if (username === '') {
        error = 'Thiếu username giảng viên.';
      } else if (fullName === '') {
        error = 'Thiếu họ tên giảng viên.';
      } else if (seen.has(username.toLowerCase())) {
        error = `Username "${username}" trùng với dòng trước trong cùng file.`;
      }

      if (!error) {
        seen.add(username.toLowerCase());
      }
      rows.push({ sheet: LECTURER_SHEET, rowIndex, payload, error });
    }

    return { rows, warnings: [], unmappedAliases: [] };
  }
}
```

- [ ] **Step 4: Chạy test parser, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- lecturer.parser`
Expected: PASS — 8 test.

- [ ] **Step 5: Viết test đỏ cho committer**

Tạo `apps/api/src/modules/imports/committers/lecturer.committer.spec.ts`:

```ts
import type { ImportContext, ParsedRow, PrismaTx } from '../types';
import { LecturerCommitter } from './lecturer.committer';

function row(payload: Record<string, unknown>, rowIndex = 2): ParsedRow {
  return { sheet: 'T.Kê', rowIndex, payload };
}

function makeTx() {
  return {
    staff: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'staff-1', username: 'cu1', staffCode: 'CU1' },
      ]),
      create: jest.fn().mockResolvedValue({ id: 'new-staff' }),
      update: jest.fn().mockResolvedValue({ id: 'staff-1' }),
    },
    role: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'role-lecturer' }),
    },
    staffRole: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaTx & {
    staff: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    role: { findUniqueOrThrow: jest.Mock };
    staffRole: { createMany: jest.Mock };
  };
}

const ctx = { term: 'SU26' } as ImportContext;

describe('LecturerCommitter', () => {
  const committer = new LecturerCommitter();

  it('tạo giảng viên mới kèm mật khẩu tạm và cờ buộc đổi mật khẩu', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ username: 'moi1', fullName: 'GV Mới', lecturerType: 'FULL' })],
      tx,
      ctx,
    );
    const data = tx.staff.create.mock.calls[0][0].data;
    expect(data.mustChangePassword).toBe(true);
    expect(typeof data.passwordHash).toBe('string');
    expect(data.passwordHash.length).toBeGreaterThan(20);
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
  });

  it('KHÔNG ghi email hay bất kỳ trường PII nào', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ username: 'moi2', fullName: 'GV Hai', lecturerType: 'PART' })],
      tx,
      ctx,
    );
    const keys = Object.keys(tx.staff.create.mock.calls[0][0].data);
    for (const banned of ['email', 'phone', 'address', 'cccd']) {
      expect(keys.some((key) => key.toLowerCase().includes(banned))).toBe(false);
    }
  });

  it('gán vai trò LECTURER cho tài khoản mới', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ username: 'moi3', fullName: 'GV Ba', lecturerType: 'FULL' })],
      tx,
      ctx,
    );
    expect(tx.role.findUniqueOrThrow).toHaveBeenCalledWith({ where: { key: 'LECTURER' } });
    expect(tx.staffRole.createMany).toHaveBeenCalled();
  });

  it('username đã có → chỉ cập nhật họ tên và loại GV, KHÔNG đổi mật khẩu', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ username: 'cu1', fullName: 'Tên Mới', lecturerType: 'PART' })],
      tx,
      ctx,
    );
    const data = tx.staff.update.mock.calls[0][0].data;
    expect(data).toEqual({ fullName: 'Tên Mới', lecturerType: 'PART' });
    expect(data.passwordHash).toBeUndefined();
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
  });

  it('staffCode sinh từ username viết hoa', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ username: 'vandtb2', fullName: 'GV', lecturerType: 'FULL' })],
      tx,
      ctx,
    );
    expect(tx.staff.create.mock.calls[0][0].data.staffCode).toBe('VANDTB2');
  });

  it('staffCode đã bị tài khoản khác chiếm → bỏ qua dòng, không ghi đè', async () => {
    const tx = makeTx();
    tx.staff.findMany.mockResolvedValue([
      { id: 'other', username: null, staffCode: 'TRUNG1' },
    ]);
    const result = await committer.commit(
      [row({ username: 'trung1', fullName: 'GV', lecturerType: 'FULL' })],
      tx,
      ctx,
    );
    expect(tx.staff.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });
});
```

- [ ] **Step 6: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- lecturer.committer`
Expected: FAIL.

- [ ] **Step 7: Cài `lecturer.committer.ts`**

```ts
import { generateTempPassword } from '../../../common/utils/temp-password';
import { hashPassword } from '../../auth/auth.service';
import type {
  CommitResult,
  ImportCommitter,
  ImportContext,
  ParsedRow,
  PrismaTx,
} from '../types';

interface LecturerPayload {
  username: string;
  fullName: string;
  lecturerType: 'FULL' | 'PART' | null;
}

export class LecturerCommitter implements ImportCommitter {
  async commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    _ctx: ImportContext,
  ): Promise<CommitResult> {
    const payloads = rows.map((row) => row.payload as unknown as LecturerPayload);
    const usernames = payloads.map((payload) => payload.username);
    const staffCodes = payloads.map((payload) => payload.username.toUpperCase());

    const existing = await tx.staff.findMany({
      where: { OR: [{ username: { in: usernames } }, { staffCode: { in: staffCodes } }] },
      select: { id: true, username: true, staffCode: true },
    });
    const byUsername = new Map(
      existing
        .filter((staff) => staff.username !== null)
        .map((staff) => [staff.username as string, staff.id]),
    );
    const byStaffCode = new Map(existing.map((staff) => [staff.staffCode, staff.id]));

    const lecturerRole = await tx.role.findUniqueOrThrow({
      where: { key: 'LECTURER' },
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const payload of payloads) {
      const existingId = byUsername.get(payload.username);
      if (existingId) {
        // Tài khoản đã có: KHÔNG đụng vào mật khẩu hay vai trò.
        await tx.staff.update({
          where: { id: existingId },
          data: {
            fullName: payload.fullName,
            lecturerType: payload.lecturerType,
          },
        });
        updated += 1;
        continue;
      }

      const staffCode = payload.username.toUpperCase();
      // Mã NV đã thuộc về tài khoản khác (không cùng username) → không ghi đè.
      if (byStaffCode.has(staffCode)) {
        skipped += 1;
        continue;
      }

      const passwordHash = await hashPassword(generateTempPassword());
      const staff = await tx.staff.create({
        data: {
          staffCode,
          username: payload.username,
          fullName: payload.fullName,
          lecturerType: payload.lecturerType,
          passwordHash,
          mustChangePassword: true,
        },
        select: { id: true },
      });
      await tx.staffRole.createMany({
        data: [{ staffId: staff.id, roleId: lecturerRole.id }],
        skipDuplicates: true,
      });
      byStaffCode.set(staffCode, staff.id);
      created += 1;
    }

    return { created, updated, skipped };
  }
}
```

> Mật khẩu tạm **không** được trả về trong kết quả import (32 mật khẩu trong một response là rủi ro). Admin dùng chức năng reset mật khẩu sẵn có ở `/admin/users` khi bàn giao tài khoản. Ghi rõ điều này ở UI Task 12.

- [ ] **Step 8: Chạy test, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- lecturer`
Expected: PASS — 14 test.

- [ ] **Step 9: Đăng ký `LECTURER` vào module**

Trong `imports.module.ts`, thêm vào `onModuleInit`:

```ts
    this.importsService.register(
      ImportKind.LECTURER,
      new LecturerParser(),
      new LecturerCommitter(),
    );
```

kèm hai import tương ứng.

- [ ] **Step 10: Kiểm chứng bằng file thật đã xoá cột email**

```bash
curl -s -b /tmp/fc.txt -X POST -H 'X-Requested-With: XMLHttpRequest' -F 'term=SU26' \
  -F 'file=@/private/tmp/claude-501/-Applications-work-Fcare/3ab28634-9905-40f5-bf4f-80901a2f9a67/scratchpad/phancong-sach.xlsx' \
  http://localhost:3001/api/imports/lecturer/upload | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const b=JSON.parse(d).data;console.log(b.summary);console.log(JSON.stringify(b.rows.slice(0,3)))})"
```

Expected: `totalRows` = 32, không dòng nào trong `rows` chứa ký tự `@`.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/imports
git commit -m "feat: importer danh sách giảng viên từ sheet T.Kê, không đọc cột email"
```

---

### Task 8: Importer 3 — lịch và phân công lớp học phần (`BL1+BL2` ⊕ `Lịch tool`)

Merge hai sheet theo khoá `(mã môn, lớp, block)`: trường lịch lấy từ `Lịch tool` (sạch hơn), giảng viên lấy từ `BL1+BL2` (giá trị thật — `Lịch tool` đã ẩn danh 100%).

**Files:**
- Create: `apps/api/src/modules/imports/parsers/schedule.parser.ts`
- Create: `apps/api/src/modules/imports/committers/schedule.committer.ts`
- Modify: `apps/api/src/modules/imports/imports.module.ts`
- Test: `apps/api/src/modules/imports/parsers/schedule.parser.spec.ts`
- Test: `apps/api/src/modules/imports/committers/schedule.committer.spec.ts`

**Interfaces:**
- Consumes: `locateHeaders`, `requireHeaders` (Task 4); `getWorksheet`, `cellText`, `cellNumber`
- Produces:
  - `class ScheduleParser implements ImportParser`
  - `class ScheduleCommitter implements ImportCommitter`
  - Payload:
    ```ts
    interface SchedulePayload {
      subjectCode: string;
      classCode: string;
      block: number | null;
      slot: string | null;
      weekdays: string | null;
      room: string | null;
      capacity: number | null;
      trainingTime: string | null;
      startDate: string | null;   // ISO 8601, chuyển sang Date ở committer
      totalHours: number | null;
      lecturerName: string | null; // họ tên thật từ BL1+BL2, null nếu chưa phân công
    }
    ```

- [ ] **Step 1: Viết test đỏ cho parser**

Tạo `apps/api/src/modules/imports/parsers/schedule.parser.spec.ts`:

```ts
import * as ExcelJS from 'exceljs';
import type { ImportContext } from '../types';
import { ScheduleParser } from './schedule.parser';

const BL_HEADERS: Record<number, string> = {
  2: 'Ngành', 3: 'Kỳ', 4: 'Mã ghép', 5: 'Mã môn', 6: 'Tên môn', 7: 'P.Pháp',
  8: 'Bộ môn', 10: 'Lớp', 11: 'Lớp gộp', 12: 'Phân công giảng viên',
  13: 'Block', 14: 'Ca', 15: 'Thứ', 16: 'Thứ học thực tế', 17: 'Phòng',
  19: 'Thời gian bắt đầu', 20: 'Số lượng sinh viên', 26: 'Số giờ',
};

const TOOL_HEADERS: Record<number, string> = {
  2: 'Class', 3: 'Subject', 4: 'Lecturer', 5: 'Slot', 6: 'Date',
  7: 'Room', 8: 'Block', 9: 'Dept', 10: 'NumStudent', 11: 'TrainingTime',
};

function setRow(
  worksheet: ExcelJS.Worksheet,
  rowIndex: number,
  cells: Record<number, unknown>,
): void {
  const row = worksheet.getRow(rowIndex);
  for (const [column, value] of Object.entries(cells)) {
    row.getCell(Number(column)).value = value as ExcelJS.CellValue;
  }
}

function buildWorkbook(
  blRows: Array<Record<number, unknown>>,
  toolRows: Array<Record<number, unknown>>,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const bl = workbook.addWorksheet('BL1+BL2');
  setRow(bl, 8, BL_HEADERS); // header ở DÒNG 8
  blRows.forEach((cells, index) => setRow(bl, 9 + index, cells));

  const tool = workbook.addWorksheet('Lịch tool');
  setRow(tool, 1, TOOL_HEADERS);
  toolRows.forEach((cells, index) => setRow(tool, 2 + index, cells));
  return workbook;
}

const ctx = { term: 'SU26' } as ImportContext;

describe('ScheduleParser', () => {
  const parser = new ScheduleParser();

  it('merge lịch từ "Lịch tool" với giảng viên thật từ "BL1+BL2"', async () => {
    const workbook = buildWorkbook(
      [{ 5: 'ITA107', 10: 'AI21301', 12: 'Nguyễn Văn Thật', 13: 1, 20: 30, 26: 45 }],
      [{ 2: 'AI21301', 3: 'ITA107', 4: 'giangvien12', 5: 'S1', 6: '246', 7: 'P301', 8: 1, 10: 30, 11: 'AM' }],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payload).toMatchObject({
      subjectCode: 'ITA107',
      classCode: 'AI21301',
      block: 1,
      slot: 'S1',
      weekdays: '246',
      room: 'P301',
      trainingTime: 'AM',
      lecturerName: 'Nguyễn Văn Thật',
    });
  });

  it('KHÔNG lấy giảng viên ẩn danh từ "Lịch tool"', async () => {
    const workbook = buildWorkbook(
      [{ 5: 'ITA107', 10: 'AI21301', 12: '', 13: 1 }],
      [{ 2: 'AI21301', 3: 'ITA107', 4: 'giangvien12', 5: 'S1', 8: 1 }],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.lecturerName).toBeNull();
  });

  it('bỏ giá trị khớp mẫu giangvienNN dù nó lọt vào cột BL1+BL2', async () => {
    const workbook = buildWorkbook(
      [{ 5: 'ITA107', 10: 'AI21301', 12: 'giangvien07', 13: 1 }],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.lecturerName).toBeNull();
  });

  it('dòng chỉ có ở "Lịch tool" vẫn tạo lớp, lecturerName null', async () => {
    const workbook = buildWorkbook(
      [],
      [{ 2: 'WD20301', 3: 'WEB2064', 4: 'giangvien01', 5: 'S2', 6: '357', 8: 2, 11: 'PM' }],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payload).toMatchObject({
      subjectCode: 'WEB2064',
      classCode: 'WD20301',
      block: 2,
      lecturerName: null,
    });
  });

  it('dòng chỉ có ở "BL1+BL2" vẫn tạo lớp, trường lịch lấy từ chính nó', async () => {
    const workbook = buildWorkbook(
      [{ 5: 'SOF1021', 10: 'SD20301', 12: 'Trần Thị B', 13: 2, 14: 'S3', 16: '246', 20: 25, 26: 60 }],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload).toMatchObject({
      subjectCode: 'SOF1021',
      classCode: 'SD20301',
      block: 2,
      slot: 'S3',
      weekdays: '246',
      capacity: 25,
      totalHours: 60,
      lecturerName: 'Trần Thị B',
    });
  });

  it('khoá merge gồm cả block — cùng môn cùng lớp khác block là hai dòng', async () => {
    const workbook = buildWorkbook(
      [
        { 5: 'ITA107', 10: 'AI21301', 12: 'GV Một', 13: 1 },
        { 5: 'ITA107', 10: 'AI21301', 12: 'GV Hai', 13: 2 },
      ],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.payload.lecturerName)).toEqual(['GV Một', 'GV Hai']);
  });

  it('dòng thiếu mã môn hoặc lớp bị đánh lỗi', async () => {
    const workbook = buildWorkbook([{ 5: '', 10: 'AI21301', 13: 1 }], []);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toContain('Mã môn');
  });

  it('cảnh báo nêu số lớp chưa phân công giảng viên', async () => {
    const workbook = buildWorkbook(
      [
        { 5: 'A1', 10: 'AI21301', 12: 'GV Một', 13: 1 },
        { 5: 'A2', 10: 'AI21301', 12: '', 13: 1 },
        { 5: 'A3', 10: 'AI21301', 12: '', 13: 1 },
      ],
      [],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.warnings.join(' ')).toContain('2/3');
  });

  it('thiếu cả hai sheet → ném lỗi', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Khác');
    await expect(parser.parse(workbook, ctx)).rejects.toThrow('BL1+BL2');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- schedule.parser`
Expected: FAIL.

- [ ] **Step 3: Cài `schedule.parser.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import type * as ExcelJS from 'exceljs';
import { cellNumber, cellText, getWorksheet } from '../../excel/excel-utils';
import type {
  ImportContext,
  ImportParser,
  ParsedRow,
  ParseResult,
} from '../types';
import { locateHeaders, requireHeaders } from './header-locator';

export const BL_SHEET = 'BL1+BL2';
export const TOOL_SHEET = 'Lịch tool';
const BL_HEADER_ROW = 8;
const TOOL_HEADER_ROW = 1;

/** Cột `Lecturer` của "Lịch tool" đã ẩn danh hoá 100% — không dùng định danh này. */
const ANONYMIZED_LECTURER = /^giangvien\d+$/i;

interface SchedulePayload {
  subjectCode: string;
  classCode: string;
  block: number | null;
  slot: string | null;
  weekdays: string | null;
  room: string | null;
  capacity: number | null;
  trainingTime: string | null;
  startDate: string | null;
  totalHours: number | null;
  lecturerName: string | null;
}

function mergeKey(subjectCode: string, classCode: string, block: number | null): string {
  return `${subjectCode}|${classCode}|${block ?? ''}`;
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function realLecturer(raw: string): string | null {
  const value = textOrNull(raw);
  return value === null || ANONYMIZED_LECTURER.test(value) ? null : value;
}

function isoDate(cell: ExcelJS.Cell): string | null {
  const value = cell.value;
  if (value instanceof Date) {
    return value.toISOString();
  }
  const text = String(cell.text ?? '').trim();
  if (text === '') {
    return null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export class ScheduleParser implements ImportParser {
  async parse(
    workbook: ExcelJS.Workbook,
    _ctx: ImportContext,
  ): Promise<ParseResult> {
    const bl = getWorksheet(workbook, BL_SHEET);
    const tool = getWorksheet(workbook, TOOL_SHEET);
    if (!bl && !tool) {
      throw new BadRequestException(
        `File thiếu cả hai sheet "${BL_SHEET}" và "${TOOL_SHEET}" — đây không phải file phân công giảng viên.`,
      );
    }

    const merged = new Map<string, { payload: SchedulePayload; rowIndex: number; sheet: string }>();
    const warnings: string[] = [];

    // ----- Lịch tool: nguồn trường lịch sạch nhất -----
    if (tool) {
      const headers = locateHeaders(tool, TOOL_HEADER_ROW, [
        'Class', 'Subject', 'Slot', 'Date', 'Room', 'Block', 'NumStudent', 'TrainingTime',
      ]);
      requireHeaders(headers, ['Class', 'Subject'], TOOL_SHEET);
      const at = (name: string) => headers.get(name.toLowerCase()) ?? 0;

      for (let rowIndex = TOOL_HEADER_ROW + 1; rowIndex <= tool.rowCount; rowIndex += 1) {
        const row = tool.getRow(rowIndex);
        const subjectCode = cellText(row, at('subject')).trim().toUpperCase();
        const classCode = cellText(row, at('class')).trim().toUpperCase();
        if (subjectCode === '' && classCode === '') {
          continue;
        }
        const block = cellNumber(row, at('block')) ?? null;
        merged.set(mergeKey(subjectCode, classCode, block), {
          sheet: TOOL_SHEET,
          rowIndex,
          payload: {
            subjectCode,
            classCode,
            block,
            slot: textOrNull(cellText(row, at('slot'))),
            weekdays: textOrNull(cellText(row, at('date'))),
            room: textOrNull(cellText(row, at('room'))),
            capacity: cellNumber(row, at('numstudent')) ?? null,
            trainingTime: textOrNull(cellText(row, at('trainingtime'))),
            startDate: null,
            totalHours: null,
            lecturerName: null, // cột Lecturer đã ẩn danh — cố ý bỏ
          },
        });
      }
    }

    // ----- BL1+BL2: nguồn giảng viên thật, lấp trường lịch còn thiếu -----
    if (bl) {
      const headers = locateHeaders(bl, BL_HEADER_ROW, [
        'Mã môn', 'Lớp', 'Phân công giảng viên', 'Block', 'Ca',
        'Thứ học thực tế', 'Phòng', 'Thời gian bắt đầu',
        'Số lượng sinh viên', 'Số giờ',
      ]);
      requireHeaders(headers, ['Mã môn', 'Lớp'], BL_SHEET);
      const at = (name: string) => headers.get(name.toLowerCase()) ?? 0;

      for (let rowIndex = BL_HEADER_ROW + 1; rowIndex <= bl.rowCount; rowIndex += 1) {
        const row = bl.getRow(rowIndex);
        const subjectCode = cellText(row, at('mã môn')).trim().toUpperCase();
        const classCode = cellText(row, at('lớp')).trim().toUpperCase();
        if (subjectCode === '' && classCode === '') {
          continue;
        }
        const block = cellNumber(row, at('block')) ?? null;
        const key = mergeKey(subjectCode, classCode, block);
        const lecturerName = realLecturer(cellText(row, at('phân công giảng viên')));
        const existing = merged.get(key);

        if (existing) {
          // Lịch tool thắng ở trường lịch; BL1+BL2 chỉ lấp chỗ trống + giảng viên.
          existing.payload.lecturerName = lecturerName;
          existing.payload.slot ??= textOrNull(cellText(row, at('ca')));
          existing.payload.weekdays ??= textOrNull(cellText(row, at('thứ học thực tế')));
          existing.payload.room ??= textOrNull(cellText(row, at('phòng')));
          existing.payload.capacity ??= cellNumber(row, at('số lượng sinh viên')) ?? null;
          existing.payload.totalHours ??= cellNumber(row, at('số giờ')) ?? null;
          existing.payload.startDate ??= isoDate(row.getCell(at('thời gian bắt đầu')));
          continue;
        }

        merged.set(key, {
          sheet: BL_SHEET,
          rowIndex,
          payload: {
            subjectCode,
            classCode,
            block,
            slot: textOrNull(cellText(row, at('ca'))),
            weekdays: textOrNull(cellText(row, at('thứ học thực tế'))),
            room: textOrNull(cellText(row, at('phòng'))),
            capacity: cellNumber(row, at('số lượng sinh viên')) ?? null,
            trainingTime: null,
            startDate: isoDate(row.getCell(at('thời gian bắt đầu'))),
            totalHours: cellNumber(row, at('số giờ')) ?? null,
            lecturerName,
          },
        });
      }
    }

    const rows: ParsedRow[] = [];
    let unassigned = 0;

    for (const entry of merged.values()) {
      let error: string | undefined;
      if (entry.payload.subjectCode === '') {
        error = 'Thiếu Mã môn.';
      } else if (entry.payload.classCode === '') {
        error = 'Thiếu mã lớp.';
      }
      if (!error && entry.payload.lecturerName === null) {
        unassigned += 1;
      }
      rows.push({
        sheet: entry.sheet,
        rowIndex: entry.rowIndex,
        payload: entry.payload as unknown as Record<string, unknown>,
        error,
      });
    }

    // Rủi ro #1: 76/94 lớp chưa phân công là THỰC TẾ của file, không phải lỗi
    // import. Nói rõ con số để người dùng không tưởng hệ thống hỏng.
    if (unassigned > 0) {
      warnings.push(
        `${unassigned}/${rows.length} lớp chưa phân công giảng viên trong file nguồn — sẽ tạo ở trạng thái "Chưa phân công", gán sau ở màn hình Lớp học phần.`,
      );
    }

    return { rows, warnings, unmappedAliases: [] };
  }
}
```

- [ ] **Step 4: Chạy test parser, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- schedule.parser`
Expected: PASS — 9 test.

- [ ] **Step 5: Viết test đỏ cho committer**

Tạo `apps/api/src/modules/imports/committers/schedule.committer.spec.ts`:

```ts
import type { ImportContext, ParsedRow, PrismaTx } from '../types';
import { ScheduleCommitter } from './schedule.committer';

const BASE = {
  block: 1, slot: 'S1', weekdays: '246', room: 'P301',
  capacity: 30, trainingTime: 'AM', startDate: null, totalHours: 45,
};

function row(payload: Record<string, unknown>, rowIndex = 9): ParsedRow {
  return { sheet: 'BL1+BL2', rowIndex, payload };
}

function makeTx() {
  return {
    subject: {
      findMany: jest.fn().mockResolvedValue([{ id: 'sub-ita', code: 'ITA107' }]),
    },
    staff: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'gv-1', fullName: 'Nguyễn Văn Thật' },
      ]),
    },
    classSection: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'cs-new' }),
      update: jest.fn().mockResolvedValue({ id: 'cs-1' }),
    },
  } as unknown as PrismaTx & {
    subject: { findMany: jest.Mock };
    staff: { findMany: jest.Mock };
    classSection: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
}

const ctx = { term: 'SU26' } as ImportContext;

describe('ScheduleCommitter', () => {
  const committer = new ScheduleCommitter();

  it('tạo lớp mới với mã ghép mã môn + lớp + học kỳ', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ subjectCode: 'ITA107', classCode: 'AI21301', lecturerName: null, ...BASE })],
      tx,
      ctx,
    );
    expect(tx.classSection.create.mock.calls[0][0].data).toMatchObject({
      code: 'ITA107-AI21301-SU26',
      term: 'SU26',
      subjectId: 'sub-ita',
      lecturerId: null,
    });
  });

  it('gán lecturerId khi tên giảng viên khớp Staff', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ subjectCode: 'ITA107', classCode: 'AI21301', lecturerName: 'Nguyễn Văn Thật', ...BASE })],
      tx,
      ctx,
    );
    expect(tx.classSection.create.mock.calls[0][0].data.lecturerId).toBe('gv-1');
  });

  it('tên giảng viên không khớp Staff nào → lecturerId null, KHÔNG tạo Staff mới', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ subjectCode: 'ITA107', classCode: 'AI21301', lecturerName: 'Người Lạ', ...BASE })],
      tx,
      ctx,
    );
    expect(tx.classSection.create.mock.calls[0][0].data.lecturerId).toBeNull();
    expect(result.created).toBe(1);
  });

  it('khớp tên bỏ qua hoa thường và khoảng trắng thừa', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ subjectCode: 'ITA107', classCode: 'AI21301', lecturerName: '  nguyễn văn thật ', ...BASE })],
      tx,
      ctx,
    );
    expect(tx.classSection.create.mock.calls[0][0].data.lecturerId).toBe('gv-1');
  });

  it('môn chưa có trong DB → bỏ qua dòng, không tạo lớp mồ côi', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ subjectCode: 'KHONGCO', classCode: 'AI21301', lecturerName: null, ...BASE })],
      tx,
      ctx,
    );
    expect(tx.classSection.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('lớp đã tồn tại theo (code, term) → cập nhật, không tạo trùng', async () => {
    const tx = makeTx();
    tx.classSection.findMany.mockResolvedValue([
      { id: 'cs-1', code: 'ITA107-AI21301-SU26' },
    ]);
    const result = await committer.commit(
      [row({ subjectCode: 'ITA107', classCode: 'AI21301', lecturerName: null, ...BASE })],
      tx,
      ctx,
    );
    expect(tx.classSection.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cs-1' } }),
    );
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
  });

  it('chuyển startDate ISO thành Date', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ subjectCode: 'ITA107', classCode: 'AI21301', lecturerName: null, ...BASE, startDate: '2026-05-11T00:00:00.000Z' })],
      tx,
      ctx,
    );
    expect(tx.classSection.create.mock.calls[0][0].data.startDate).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 6: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- schedule.committer`
Expected: FAIL.

- [ ] **Step 7: Cài `schedule.committer.ts`**

```ts
import { buildSectionCode, parseClassCode } from '../parsers/class-code';
import type {
  CommitResult,
  ImportCommitter,
  ImportContext,
  ParsedRow,
  PrismaTx,
} from '../types';

interface SchedulePayload {
  subjectCode: string;
  classCode: string;
  block: number | null;
  slot: string | null;
  weekdays: string | null;
  room: string | null;
  capacity: number | null;
  trainingTime: string | null;
  startDate: string | null;
  totalHours: number | null;
  lecturerName: string | null;
}

function nameKey(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

export class ScheduleCommitter implements ImportCommitter {
  async commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    ctx: ImportContext,
  ): Promise<CommitResult> {
    const payloads = rows.map((row) => row.payload as unknown as SchedulePayload);

    const subjects = await tx.subject.findMany({
      where: { code: { in: payloads.map((p) => p.subjectCode) } },
      select: { id: true, code: true },
    });
    const subjectIdByCode = new Map(subjects.map((s) => [s.code, s.id]));

    const lecturerNames = payloads
      .map((p) => p.lecturerName)
      .filter((name): name is string => name !== null);
    const staff =
      lecturerNames.length > 0
        ? await tx.staff.findMany({
            where: { fullName: { in: lecturerNames } },
            select: { id: true, fullName: true },
          })
        : [];
    const staffIdByName = new Map(staff.map((s) => [nameKey(s.fullName), s.id]));

    const codes = payloads.map((payload) => {
      const parsed = parseClassCode(payload.classCode);
      return parsed ? buildSectionCode(payload.subjectCode, parsed, ctx.term) : '';
    });
    const existing = await tx.classSection.findMany({
      where: { code: { in: codes }, term: ctx.term },
      select: { id: true, code: true },
    });
    const sectionIdByCode = new Map(existing.map((s) => [s.code, s.id]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const payload of payloads) {
      const subjectId = subjectIdByCode.get(payload.subjectCode);
      const parsed = parseClassCode(payload.classCode);
      // Môn chưa có trong danh mục → bỏ qua. Chạy importer danh mục trước.
      if (!subjectId || !parsed) {
        skipped += 1;
        continue;
      }

      const code = buildSectionCode(payload.subjectCode, parsed, ctx.term);
      // Tên không khớp Staff nào → để trống. KHÔNG tự tạo tài khoản giảng viên
      // từ một chuỗi tên: đó là việc của importer T.Kê.
      const lecturerId = payload.lecturerName
        ? (staffIdByName.get(nameKey(payload.lecturerName)) ?? null)
        : null;

      const data = {
        subjectId,
        lecturerId,
        term: ctx.term,
        block: payload.block,
        slot: payload.slot,
        weekdays: payload.weekdays,
        room: payload.room,
        capacity: payload.capacity,
        trainingTime: payload.trainingTime,
        startDate: payload.startDate ? new Date(payload.startDate) : null,
        totalHours: payload.totalHours,
      };

      const existingId = sectionIdByCode.get(code);
      if (existingId) {
        await tx.classSection.update({ where: { id: existingId }, data });
        updated += 1;
      } else {
        const section = await tx.classSection.create({
          data: { code, ...data },
          select: { id: true },
        });
        sectionIdByCode.set(code, section.id);
        created += 1;
      }
    }

    return { created, updated, skipped };
  }
}
```

- [ ] **Step 8: Chạy test, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- schedule`
Expected: PASS — 16 test.

- [ ] **Step 9: Đăng ký `SCHEDULE` vào module**

Thêm vào `onModuleInit` của `imports.module.ts`:

```ts
    this.importsService.register(
      ImportKind.SCHEDULE,
      new ScheduleParser(),
      new ScheduleCommitter(),
    );
```

- [ ] **Step 10: Kiểm chứng bằng file thật**

```bash
curl -s -b /tmp/fc.txt -X POST -H 'X-Requested-With: XMLHttpRequest' -F 'term=SU26' \
  -F 'file=@/private/tmp/claude-501/-Applications-work-Fcare/3ab28634-9905-40f5-bf4f-80901a2f9a67/scratchpad/phancong-sach.xlsx' \
  http://localhost:3001/api/imports/schedule/upload | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.summary))"
```

Expected: `totalRows` ≈ 94, `warnings` chứa câu "… lớp chưa phân công giảng viên trong file nguồn" với con số ≈ 76.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/imports
git commit -m "feat: importer lịch và phân công lớp học phần, merge BL1+BL2 với Lịch tool"
```

---

### Task 9: Importer 4 — bảng điểm (21 sheet)

Chỉ đọc **5 cột** — `Mã sinh viên`, `Họ và tên`, `Lớp`, `Điểm tổng kết`, `Trạng thái`. Mọi cột điểm thành phần bị bỏ hoàn toàn (quyết định §3).

**Files:**
- Create: `apps/api/src/modules/imports/parsers/gradebook.parser.ts`
- Create: `apps/api/src/modules/imports/committers/gradebook.committer.ts`
- Modify: `apps/api/src/modules/imports/imports.module.ts`
- Modify: `apps/api/src/modules/excel/grades-excel.service.ts` (bổ sung nhãn `Không đạt`)
- Test: `apps/api/src/modules/imports/parsers/gradebook.parser.spec.ts`
- Test: `apps/api/src/modules/imports/committers/gradebook.committer.spec.ts`

**Interfaces:**
- Consumes: `locateHeaders`, `requireHeaders`, `parseClassCode`, `buildSectionCode` (Task 4)
- Produces:
  - `class GradebookParser implements ImportParser`
  - `class GradebookCommitter implements ImportCommitter`
  - `parseEnrollmentResult(label: string): EnrollmentResult` — export từ `gradebook.parser.ts`, xử lý cả `Không đạt`
  - Payload:
    ```ts
    interface GradebookPayload {
      subjectCode: string;   // = tên sheet
      studentCode: string;
      fullName: string;
      rawClass: string;
      totalScore: number | null;
      resultLabel: string;
    }
    ```

- [ ] **Step 1: Viết test đỏ cho parser**

Tạo `apps/api/src/modules/imports/parsers/gradebook.parser.spec.ts`:

```ts
import { EnrollmentResult } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import type { ImportContext } from '../types';
import { GradebookParser, parseEnrollmentResult } from './gradebook.parser';

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: unknown[][],
): void {
  const worksheet = workbook.addWorksheet(name);
  worksheet.getRow(1).values = ['', ...headers];
  rows.forEach((row, index) => {
    worksheet.getRow(2 + index).values = ['', ...row];
  });
}

const ctx = { term: 'SU26' } as ImportContext;

describe('parseEnrollmentResult', () => {
  it('Đạt → PASS', () => {
    expect(parseEnrollmentResult('Đạt')).toBe(EnrollmentResult.PASS);
  });

  it('Trượt → FAIL', () => {
    expect(parseEnrollmentResult('Trượt')).toBe(EnrollmentResult.FAIL);
  });

  it('Không đạt → FAIL (nhãn mới có trong file thật)', () => {
    expect(parseEnrollmentResult('Không đạt')).toBe(EnrollmentResult.FAIL);
  });

  it('rỗng → IN_PROGRESS', () => {
    expect(parseEnrollmentResult('')).toBe(EnrollmentResult.IN_PROGRESS);
  });

  it('nhãn lạ → IN_PROGRESS, không ném lỗi', () => {
    expect(parseEnrollmentResult('Chưa rõ')).toBe(EnrollmentResult.IN_PROGRESS);
  });
});

describe('GradebookParser', () => {
  const parser = new GradebookParser();

  it('định vị "Điểm tổng kết" theo tên header, không theo chỉ số', async () => {
    const workbook = new ExcelJS.Workbook();
    // Bố cục SOF1021: Điểm tổng kết ở cột 9.
    addSheet(workbook, 'SOF1021',
      ['#', 'Mã sinh viên', 'Họ và tên', 'Lớp', 'Quiz 1', 'Lab 1', 'Lab 2', 'ASM', 'Điểm tổng kết', 'Trạng thái'],
      [[1, 'PK00123', 'Nguyễn Văn A', 'SD20301', 8, 7, 9, 6, 7.5, 'Đạt']],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload).toEqual({
      subjectCode: 'SOF1021',
      studentCode: 'PK00123',
      fullName: 'Nguyễn Văn A',
      rawClass: 'SD20301',
      totalScore: 7.5,
      resultLabel: 'Đạt',
    });
  });

  it('cùng một parser xử lý sheet có Điểm tổng kết ở cột 24', async () => {
    const workbook = new ExcelJS.Workbook();
    const filler = Array.from({ length: 19 }, (_, i) => `Lab ${i + 1}`);
    addSheet(workbook, 'WEB2072',
      ['#', 'Mã sinh viên', 'Họ và tên', 'Lớp', ...filler, 'Điểm tổng kết'],
      [[1, 'PS00456', 'Trần Thị B', 'WEB2072', ...filler.map(() => 5), 6.2]],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.totalScore).toBe(6.2);
  });

  it('KHÔNG lấy bất kỳ cột điểm thành phần nào vào payload', async () => {
    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, 'A',
      ['#', 'Mã sinh viên', 'Họ và tên', 'Lớp', 'Quiz 1', 'ASM', 'Điểm tổng kết', 'Trạng thái'],
      [[1, 'PK1', 'A', 'SD20301', 9.9, 8.8, 7, 'Đạt']],
    );
    const result = await parser.parse(workbook, ctx);
    const values = Object.values(result.rows[0].payload);
    expect(values).not.toContain(9.9);
    expect(values).not.toContain(8.8);
    expect(Object.keys(result.rows[0].payload).sort()).toEqual([
      'fullName', 'rawClass', 'resultLabel', 'studentCode', 'subjectCode', 'totalScore',
    ]);
  });

  it('sheet thiếu "Mã sinh viên" hoặc "Điểm tổng kết" bị bỏ qua kèm cảnh báo', async () => {
    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, 'Tổng hợp', ['Ghi chú'], [['abc']]);
    addSheet(workbook, 'OK',
      ['Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết'],
      [['PK1', 'A', 'SD20301', 7]],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('Tổng hợp');
  });

  it('điểm rỗng → totalScore null, không đánh lỗi (sinh viên chưa có điểm)', async () => {
    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, 'A',
      ['Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết', 'Trạng thái'],
      [['PK1', 'A', 'SD20301', '', '']],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.totalScore).toBeNull();
    expect(result.rows[0].error).toBeUndefined();
  });

  it('điểm ngoài thang 0..10 bị đánh lỗi', async () => {
    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, 'A',
      ['Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết'],
      [['PK1', 'A', 'SD20301', 87]],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toContain('0 đến 10');
  });

  it('dòng thiếu MSSV bị đánh lỗi', async () => {
    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, 'A',
      ['Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết'],
      [['', 'A', 'SD20301', 7]],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toContain('Mã sinh viên');
  });

  it('một sheet chứa nhiều lớp — mỗi dòng giữ mã lớp riêng', async () => {
    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, 'PMA1011',
      ['Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết'],
      [['PK1', 'A', 'SD20301', 7], ['PK2', 'B', 'WD20301', 8]],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows.map((r) => r.payload.rawClass)).toEqual(['SD20301', 'WD20301']);
  });

  it('xử lý nhiều sheet trong một lượt, ghi đúng tên sheet vào từng dòng', async () => {
    const workbook = new ExcelJS.Workbook();
    for (const name of ['WEB2064', 'SOF1021']) {
      addSheet(workbook, name,
        ['Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết'],
        [['PK1', 'A', 'SD20301', 7]],
      );
    }
    const result = await parser.parse(workbook, ctx);
    expect(result.rows.map((r) => r.sheet)).toEqual(['WEB2064', 'SOF1021']);
    expect(result.rows.map((r) => r.payload.subjectCode)).toEqual(['WEB2064', 'SOF1021']);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- gradebook.parser`
Expected: FAIL.

- [ ] **Step 3: Cài `gradebook.parser.ts`**

```ts
import { EnrollmentResult } from '@prisma/client';
import type * as ExcelJS from 'exceljs';
import { cellNumber, cellText } from '../../excel/excel-utils';
import type {
  ImportContext,
  ImportParser,
  ParsedRow,
  ParseResult,
} from '../types';
import { locateHeaders, requireHeaders } from './header-locator';

const HEADER_ROW = 1;

const COLUMNS = [
  'Mã sinh viên',
  'Họ và tên',
  'Lớp',
  'Điểm tổng kết',
  'Trạng thái',
] as const;

/**
 * File thật có cả "Đạt", "Trượt", "Không đạt" và ô rỗng — RESULT_BY_LABEL cũ
 * trong grades-excel.service.ts thiếu "Không đạt" (spec §2.1 đặc điểm 3).
 */
const RESULT_BY_LABEL: Record<string, EnrollmentResult> = {
  đạt: EnrollmentResult.PASS,
  trượt: EnrollmentResult.FAIL,
  'không đạt': EnrollmentResult.FAIL,
  'đang học': EnrollmentResult.IN_PROGRESS,
};

export function parseEnrollmentResult(label: string): EnrollmentResult {
  return (
    RESULT_BY_LABEL[label.replace(/\s+/g, ' ').trim().toLowerCase()] ??
    EnrollmentResult.IN_PROGRESS
  );
}

export class GradebookParser implements ImportParser {
  async parse(
    workbook: ExcelJS.Workbook,
    _ctx: ImportContext,
  ): Promise<ParseResult> {
    const rows: ParsedRow[] = [];
    const warnings: string[] = [];

    workbook.eachSheet((worksheet) => {
      const headers = locateHeaders(worksheet, HEADER_ROW, COLUMNS);
      // Sheet thống kê / ghi chú không có hai cột này → bỏ cả sheet, ghi cảnh báo.
      if (!headers.has('mã sinh viên') || !headers.has('điểm tổng kết')) {
        warnings.push(
          `Bỏ qua sheet "${worksheet.name}": thiếu cột "Mã sinh viên" hoặc "Điểm tổng kết".`,
        );
        return;
      }
      requireHeaders(headers, ['Mã sinh viên', 'Điểm tổng kết'], worksheet.name);

      const at = (name: string) => headers.get(name) ?? 0;
      const subjectCode = worksheet.name.trim().toUpperCase();

      for (
        let rowIndex = HEADER_ROW + 1;
        rowIndex <= worksheet.rowCount;
        rowIndex += 1
      ) {
        const row = worksheet.getRow(rowIndex);
        const studentCode = cellText(row, at('mã sinh viên')).trim().toUpperCase();
        const fullName = cellText(row, at('họ và tên')).trim();
        const rawClass = cellText(row, at('lớp')).trim();

        if (studentCode === '' && fullName === '') {
          continue;
        }

        const totalScore = cellNumber(row, at('điểm tổng kết'));
        const payload = {
          subjectCode,
          studentCode,
          fullName,
          rawClass,
          totalScore: totalScore ?? null,
          resultLabel: cellText(row, at('trạng thái')).trim(),
        };

        let error: string | undefined;
        if (studentCode === '') {
          error = 'Thiếu Mã sinh viên.';
        } else if (fullName === '') {
          error = 'Thiếu họ và tên.';
        } else if (rawClass === '') {
          error = 'Thiếu mã lớp — không xác định được lớp học phần.';
        } else if (
          totalScore !== undefined &&
          (totalScore < 0 || totalScore > 10)
        ) {
          error = `Điểm tổng kết ${totalScore} nằm ngoài thang 0 đến 10.`;
        }

        rows.push({ sheet: worksheet.name, rowIndex, payload, error });
      }
    });

    return { rows, warnings, unmappedAliases: [] };
  }
}
```

- [ ] **Step 4: Chạy test parser, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- gradebook.parser`
Expected: PASS — 14 test.

- [ ] **Step 5: Đồng bộ nhãn "Không đạt" vào importer Excel cũ**

Trong `apps/api/src/modules/excel/grades-excel.service.ts`, thêm dòng vào `RESULT_BY_LABEL`:

```ts
  'không đạt': EnrollmentResult.FAIL,
```

Thêm test vào `apps/api/src/modules/excel/grades-excel.service.spec.ts` (tạo file nếu chưa có) khẳng định `parseResult('Không đạt')` trả `FAIL`. Nếu `parseResult` chưa export, export nó.

- [ ] **Step 6: Viết test đỏ cho committer**

Tạo `apps/api/src/modules/imports/committers/gradebook.committer.spec.ts`:

```ts
import { EnrollmentResult } from '@prisma/client';
import type { ImportContext, ParsedRow, PrismaTx } from '../types';
import { GradebookCommitter } from './gradebook.committer';

function row(payload: Record<string, unknown>, rowIndex = 2): ParsedRow {
  return { sheet: 'SOF1021', rowIndex, payload };
}

const BASE = {
  subjectCode: 'SOF1021',
  fullName: 'Nguyễn Văn A',
  totalScore: 7.5,
  resultLabel: 'Đạt',
};

function makeTx() {
  return {
    subject: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'sub-1', code: 'SOF1021', departmentId: 'dept-cntt' },
      ]),
    },
    classMajorRule: {
      findMany: jest.fn().mockResolvedValue([
        { classPrefix: 'SD', majorId: 'major-ptpm' },
      ]),
    },
    student: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: `stu-${data.studentCode}` }),
      ),
      update: jest.fn().mockResolvedValue({ id: 'stu-1' }),
    },
    classSection: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: `cs-${data.code}` }),
      ),
    },
    enrollment: {
      upsert: jest.fn().mockResolvedValue({ id: 'enr-1' }),
    },
  } as unknown as PrismaTx & Record<string, Record<string, jest.Mock>>;
}

const ctx = { term: 'SU26' } as ImportContext;

describe('GradebookCommitter', () => {
  const committer = new GradebookCommitter();

  it('lớp hành chính: suy khoá và ngành từ mã lớp', async () => {
    const tx = makeTx();
    await committer.commit([row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' })], tx, ctx);
    expect(tx.student.create.mock.calls[0][0].data).toMatchObject({
      studentCode: 'PK1',
      classCode: 'SD20301',
      cohort: '20',
      majorId: 'major-ptpm',
      departmentId: 'dept-cntt',
    });
  });

  it('lớp học phần: majorId và cohort để null, vào hàng chờ gán', async () => {
    const tx = makeTx();
    await committer.commit([row({ ...BASE, studentCode: 'PK2', rawClass: 'WEB2064.02' })], tx, ctx);
    expect(tx.student.create.mock.calls[0][0].data).toMatchObject({
      majorId: null,
      cohort: null,
      classCode: 'WEB2064.02',
    });
  });

  it('departmentId LUÔN lấy từ bộ môn của môn học, không bao giờ null', async () => {
    const tx = makeTx();
    await committer.commit([row({ ...BASE, studentCode: 'PK3', rawClass: 'WEB2064.02' })], tx, ctx);
    expect(tx.student.create.mock.calls[0][0].data.departmentId).toBe('dept-cntt');
  });

  it('sinh viên đã có: cập nhật họ tên, KHÔNG ghi đè ngành đã gán tay', async () => {
    const tx = makeTx();
    tx.student.findMany.mockResolvedValue([
      { id: 'stu-1', studentCode: 'PK1', majorId: 'major-da-gan', cohort: '19' },
    ]);
    await committer.commit([row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' })], tx, ctx);
    const data = tx.student.update.mock.calls[0][0].data;
    expect(data.fullName).toBe('Nguyễn Văn A');
    expect(data.majorId).toBeUndefined();
    expect(data.cohort).toBeUndefined();
  });

  it('sinh viên đã có nhưng chưa có ngành: lấp ngành suy được', async () => {
    const tx = makeTx();
    tx.student.findMany.mockResolvedValue([
      { id: 'stu-1', studentCode: 'PK1', majorId: null, cohort: null },
    ]);
    await committer.commit([row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' })], tx, ctx);
    expect(tx.student.update.mock.calls[0][0].data).toMatchObject({
      majorId: 'major-ptpm',
      cohort: '20',
    });
  });

  it('upsert enrollment với totalScore và result đã ánh xạ', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301', resultLabel: 'Không đạt' })],
      tx,
      ctx,
    );
    const call = tx.enrollment.upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({ totalScore: 7.5, result: EnrollmentResult.FAIL });
    expect(call.update).toMatchObject({ totalScore: 7.5, result: EnrollmentResult.FAIL });
  });

  it('KHÔNG ghi midtermScore, finalScore hay attendanceRate', async () => {
    const tx = makeTx();
    await committer.commit([row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' })], tx, ctx);
    const keys = Object.keys(tx.enrollment.upsert.mock.calls[0][0].create);
    expect(keys).not.toContain('midtermScore');
    expect(keys).not.toContain('finalScore');
    expect(keys).not.toContain('attendanceRate');
  });

  it('tạo lớp học phần nếu chưa có, dùng đúng quy tắc mã', async () => {
    const tx = makeTx();
    await committer.commit([row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' })], tx, ctx);
    expect(tx.classSection.create.mock.calls[0][0].data).toMatchObject({
      code: 'SOF1021-SD20301-SU26',
      term: 'SU26',
      subjectId: 'sub-1',
      lecturerId: null,
    });
  });

  it('môn chưa có trong danh mục → bỏ qua dòng', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ ...BASE, subjectCode: 'KHONGCO', studentCode: 'PK1', rawClass: 'SD20301' })],
      tx,
      ctx,
    );
    expect(tx.student.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('hai dòng cùng sinh viên khác môn chỉ tạo Student một lần', async () => {
    const tx = makeTx();
    tx.subject.findMany.mockResolvedValue([
      { id: 'sub-1', code: 'SOF1021', departmentId: 'dept-cntt' },
      { id: 'sub-2', code: 'WEB2064', departmentId: 'dept-cntt' },
    ]);
    await committer.commit(
      [
        row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' }),
        row({ ...BASE, subjectCode: 'WEB2064', studentCode: 'PK1', rawClass: 'SD20301' }),
      ],
      tx,
      ctx,
    );
    expect(tx.student.create).toHaveBeenCalledTimes(1);
    expect(tx.enrollment.upsert).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 7: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- gradebook.committer`
Expected: FAIL.

- [ ] **Step 8: Cài `gradebook.committer.ts`**

```ts
import { buildSectionCode, parseClassCode } from '../parsers/class-code';
import { parseEnrollmentResult } from '../parsers/gradebook.parser';
import type {
  CommitResult,
  ImportCommitter,
  ImportContext,
  ParsedRow,
  PrismaTx,
} from '../types';

interface GradebookPayload {
  subjectCode: string;
  studentCode: string;
  fullName: string;
  rawClass: string;
  totalScore: number | null;
  resultLabel: string;
}

export class GradebookCommitter implements ImportCommitter {
  async commit(
    rows: ParsedRow[],
    tx: PrismaTx,
    ctx: ImportContext,
  ): Promise<CommitResult> {
    const payloads = rows.map((row) => row.payload as unknown as GradebookPayload);

    const subjects = await tx.subject.findMany({
      where: { code: { in: payloads.map((p) => p.subjectCode) } },
      select: { id: true, code: true, departmentId: true },
    });
    const subjectByCode = new Map(subjects.map((s) => [s.code, s]));

    const rules = await tx.classMajorRule.findMany({
      select: { classPrefix: true, majorId: true },
    });
    const majorIdByPrefix = new Map(rules.map((r) => [r.classPrefix, r.majorId]));

    const students = await tx.student.findMany({
      where: { studentCode: { in: payloads.map((p) => p.studentCode) } },
      select: { id: true, studentCode: true, majorId: true, cohort: true },
    });
    const studentByCode = new Map(students.map((s) => [s.studentCode, s]));

    const sections = await tx.classSection.findMany({
      where: { term: ctx.term },
      select: { id: true, code: true },
    });
    const sectionIdByCode = new Map(sections.map((s) => [s.code, s.id]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const payload of payloads) {
      const subject = subjectByCode.get(payload.subjectCode);
      const parsed = parseClassCode(payload.rawClass);
      // Môn chưa có trong danh mục → bỏ qua; chạy importer danh mục trước.
      if (!subject || !parsed) {
        skipped += 1;
        continue;
      }

      // departmentId LUÔN có giá trị: lấy từ bộ môn của môn đang import.
      // Không bao giờ null, không bao giờ dùng placeholder (RULE 2).
      const departmentId = subject.departmentId;
      const majorId =
        parsed.majorPrefix !== null
          ? (majorIdByPrefix.get(parsed.majorPrefix) ?? null)
          : null;

      const existing = studentByCode.get(payload.studentCode);
      let studentId: string;

      if (existing) {
        // Chỉ lấp chỗ trống — KHÔNG ghi đè ngành/khoá admin đã gán tay.
        const data: Record<string, unknown> = { fullName: payload.fullName };
        if (existing.majorId === null && majorId !== null) {
          data.majorId = majorId;
        }
        if (existing.cohort === null && parsed.cohort !== null) {
          data.cohort = parsed.cohort;
        }
        await tx.student.update({ where: { id: existing.id }, data });
        studentId = existing.id;
        updated += 1;
      } else {
        const student = await tx.student.create({
          data: {
            studentCode: payload.studentCode,
            fullName: payload.fullName,
            classCode: parsed.raw,
            cohort: parsed.cohort,
            majorId,
            departmentId,
          },
          select: { id: true },
        });
        studentByCode.set(payload.studentCode, {
          id: student.id,
          studentCode: payload.studentCode,
          majorId,
          cohort: parsed.cohort,
        });
        studentId = student.id;
        created += 1;
      }

      const sectionCode = buildSectionCode(payload.subjectCode, parsed, ctx.term);
      let classSectionId = sectionIdByCode.get(sectionCode);
      if (!classSectionId) {
        const section = await tx.classSection.create({
          data: {
            code: sectionCode,
            term: ctx.term,
            subjectId: subject.id,
            lecturerId: null,
          },
          select: { id: true },
        });
        classSectionId = section.id;
        sectionIdByCode.set(sectionCode, section.id);
      }

      // Chỉ ghi điểm tổng kết + kết quả (quyết định §3). Không đụng
      // midtermScore/finalScore/attendanceRate — không có nguồn dữ liệu.
      const grade = {
        totalScore: payload.totalScore,
        result: parseEnrollmentResult(payload.resultLabel),
      };
      await tx.enrollment.upsert({
        where: { studentId_classSectionId: { studentId, classSectionId } },
        create: { studentId, classSectionId, ...grade },
        update: grade,
      });
    }

    return { created, updated, skipped };
  }
}
```

- [ ] **Step 9: Chạy test, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- gradebook`
Expected: PASS — 24 test.

- [ ] **Step 10: Đăng ký `GRADEBOOK` vào module**

Thêm vào `onModuleInit`:

```ts
    this.importsService.register(
      ImportKind.GRADEBOOK,
      new GradebookParser(),
      new GradebookCommitter(),
    );
```

- [ ] **Step 11: Kiểm chứng bằng file gradebook thật**

```bash
curl -s -b /tmp/fc.txt -X POST -H 'X-Requested-With: XMLHttpRequest' -F 'term=SU26' \
  -F 'file=@docs/gradebook_20260504174543_hoactm_64_119_all_ (1).xlsx' \
  http://localhost:3001/api/imports/gradebook/upload | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.summary))"
```

Expected: `totalRows` = 316, `errorCount` = 0. Commit rồi kiểm tra số liệu:

```bash
BATCH=$(curl -s -b /tmp/fc.txt http://localhost:3001/api/imports | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data[0].id))")
curl -s -b /tmp/fc.txt -X POST -H 'X-Requested-With: XMLHttpRequest' http://localhost:3001/api/imports/$BATCH/commit
pnpm --filter @fcare/api exec prisma db execute --stdin <<'SQL'
SELECT
  (SELECT COUNT(*) FROM students)                            AS students,
  (SELECT COUNT(*) FROM students WHERE "majorId" IS NULL)    AS cho_gan_nganh,
  (SELECT COUNT(*) FROM students WHERE "departmentId" IS NULL) AS thieu_bo_mon,
  (SELECT COUNT(*) FROM enrollments)                         AS enrollments;
SQL
```

Expected: `students` = 176, `cho_gan_nganh` ≈ 8, **`thieu_bo_mon` = 0**, `enrollments` = 316. Nếu `cho_gan_nganh` lệch nhiều so với 8, kiểm tra lại `CLASS_MAJOR_RULES` chứ đừng nới điều kiện suy ngành.

- [ ] **Step 12: Kiểm tra không có PII lọt vào DB**

```bash
pnpm --filter @fcare/api exec prisma db execute --stdin <<'SQL'
SELECT COUNT(*) AS nghi_ngo FROM students
WHERE "fullName" ~ '@' OR "classCode" ~ '@' OR "studentCode" ~ '[0-9]{12}';
SQL
```

Expected: `nghi_ngo = 0`.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/modules/imports apps/api/src/modules/excel
git commit -m "feat: importer bảng điểm chỉ lấy điểm tổng kết và trạng thái"
```

---

## P3 — CRUD quản trị và giao diện

### Task 10: CRUD bảng ánh xạ (`/department-aliases`, `/class-major-rules`)

Hai bảng ánh xạ do Task 2 tạo phải sửa được từ UI, nếu không mỗi lần trường đổi nhãn cột lại phải sửa code và deploy.

**Files:**
- Create: `apps/api/src/modules/master-data/mappings.service.ts`
- Create: `apps/api/src/modules/master-data/dto/mapping.dto.ts`
- Modify: `apps/api/src/modules/master-data/master-data.controller.ts` (thêm 2 controller ở cuối)
- Modify: `apps/api/src/modules/master-data/master-data.module.ts`
- Test: `apps/api/src/modules/master-data/mappings.service.spec.ts`

**Interfaces:**
- Consumes: `isPrismaError` (`../../common/utils/prisma-error`), `PrismaService`
- Produces:
  - `class DepartmentAliasesService` — `findAll()`, `create(dto)`, `update(id, dto)`, `remove(id)`
  - `class ClassMajorRulesService` — `findAll()`, `create(dto)`, `update(id, dto)`, `remove(id)`
  - `CreateDepartmentAliasDto { alias: string; departmentId: string }`, `UpdateDepartmentAliasDto`
  - `CreateClassMajorRuleDto { classPrefix: string; majorId: string }`, `UpdateClassMajorRuleDto`
  - Route: `GET|POST /department-aliases`, `PATCH|DELETE /department-aliases/:id`, tương tự `/class-major-rules`

- [ ] **Step 1: Viết DTO**

Tạo `apps/api/src/modules/master-data/dto/mapping.dto.ts`:

```ts
import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateDepartmentAliasDto {
  @ApiProperty({
    example: 'Lịch tool',
    description: 'Nhãn bộ môn xuất hiện trong file Excel nguồn',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  alias!: string;

  @ApiProperty({ description: 'ID bộ môn đích' })
  @IsUUID()
  departmentId!: string;
}

export class UpdateDepartmentAliasDto extends PartialType(
  CreateDepartmentAliasDto,
) {}

export class CreateClassMajorRuleDto {
  @ApiProperty({
    example: 'AI',
    description: 'Tiền tố 2 chữ cái của mã lớp hành chính',
  })
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, {
    message: 'Tiền tố lớp phải gồm đúng 2 chữ cái, ví dụ "AI".',
  })
  classPrefix!: string;

  @ApiProperty({ description: 'ID ngành đích' })
  @IsUUID()
  majorId!: string;
}

export class UpdateClassMajorRuleDto extends PartialType(
  CreateClassMajorRuleDto,
) {}
```

- [ ] **Step 2: Viết test đỏ**

Tạo `apps/api/src/modules/master-data/mappings.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  ClassMajorRulesService,
  DepartmentAliasesService,
} from './mappings.service';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: '6.0.0',
  });
}

describe('DepartmentAliasesService', () => {
  const prisma = {
    departmentAlias: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as PrismaService & {
    departmentAlias: Record<string, jest.Mock>;
  };
  const service = new DepartmentAliasesService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('liệt kê kèm bộ môn, sắp xếp theo alias', async () => {
    prisma.departmentAlias.findMany.mockResolvedValue([]);
    await service.findAll();
    expect(prisma.departmentAlias.findMany).toHaveBeenCalledWith({
      orderBy: { alias: 'asc' },
      include: { department: { select: { id: true, code: true, name: true } } },
    });
  });

  it('alias trùng → ConflictException nêu rõ alias', async () => {
    prisma.departmentAlias.create.mockRejectedValue(prismaError('P2002'));
    await expect(
      service.create({ alias: 'Lịch tool', departmentId: 'd1' }),
    ).rejects.toThrow(/Lịch tool/);
  });

  it('alias trùng → đúng loại ConflictException', async () => {
    prisma.departmentAlias.create.mockRejectedValue(prismaError('P2002'));
    await expect(
      service.create({ alias: 'Lịch tool', departmentId: 'd1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('bộ môn không tồn tại → NotFoundException', async () => {
    prisma.departmentAlias.create.mockRejectedValue(prismaError('P2003'));
    await expect(
      service.create({ alias: 'X', departmentId: 'khong-co' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sửa bản ghi không tồn tại → NotFoundException', async () => {
    prisma.departmentAlias.update.mockRejectedValue(prismaError('P2025'));
    await expect(service.update('x', { alias: 'Y' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('xóa thành công trả { deleted: true }', async () => {
    prisma.departmentAlias.delete.mockResolvedValue({});
    await expect(service.remove('x')).resolves.toEqual({ deleted: true });
  });
});

describe('ClassMajorRulesService', () => {
  const prisma = {
    classMajorRule: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as PrismaService & {
    classMajorRule: Record<string, jest.Mock>;
  };
  const service = new ClassMajorRulesService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('chuẩn hoá tiền tố về chữ in hoa trước khi lưu', async () => {
    prisma.classMajorRule.create.mockResolvedValue({});
    await service.create({ classPrefix: 'ai', majorId: 'm1' });
    expect(prisma.classMajorRule.create).toHaveBeenCalledWith({
      data: { classPrefix: 'AI', majorId: 'm1' },
    });
  });

  it('tiền tố trùng → ConflictException', async () => {
    prisma.classMajorRule.create.mockRejectedValue(prismaError('P2002'));
    await expect(
      service.create({ classPrefix: 'AI', majorId: 'm1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sửa cũng chuẩn hoá tiền tố', async () => {
    prisma.classMajorRule.update.mockResolvedValue({});
    await service.update('r1', { classPrefix: 'wd' });
    expect(prisma.classMajorRule.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { classPrefix: 'WD' },
    });
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- mappings.service`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 4: Cài `mappings.service.ts`**

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateClassMajorRuleDto,
  CreateDepartmentAliasDto,
  UpdateClassMajorRuleDto,
  UpdateDepartmentAliasDto,
} from './dto/mapping.dto';

@Injectable()
export class DepartmentAliasesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.departmentAlias.findMany({
      orderBy: { alias: 'asc' },
      include: { department: { select: { id: true, code: true, name: true } } },
    });
  }

  async create(dto: CreateDepartmentAliasDto) {
    try {
      return await this.prisma.departmentAlias.create({ data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Nhãn "${dto.alias}" đã được ánh xạ.`);
      }
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Bộ môn không tồn tại.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateDepartmentAliasDto) {
    try {
      return await this.prisma.departmentAlias.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy ánh xạ bộ môn.');
      }
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Nhãn "${dto.alias}" đã được ánh xạ.`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.departmentAlias.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy ánh xạ bộ môn.');
      }
      throw error;
    }
  }
}

@Injectable()
export class ClassMajorRulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.classMajorRule.findMany({
      orderBy: { classPrefix: 'asc' },
      include: { major: { select: { id: true, code: true, name: true } } },
    });
  }

  async create(dto: CreateClassMajorRuleDto) {
    const data = { ...dto, classPrefix: dto.classPrefix.toUpperCase() };
    try {
      return await this.prisma.classMajorRule.create({ data });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          `Tiền tố lớp "${data.classPrefix}" đã có quy tắc.`,
        );
      }
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Ngành học không tồn tại.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateClassMajorRuleDto) {
    const data = {
      ...dto,
      ...(dto.classPrefix
        ? { classPrefix: dto.classPrefix.toUpperCase() }
        : {}),
    };
    try {
      return await this.prisma.classMajorRule.update({ where: { id }, data });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy quy tắc lớp → ngành.');
      }
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          `Tiền tố lớp "${data.classPrefix}" đã có quy tắc.`,
        );
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.classMajorRule.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy quy tắc lớp → ngành.');
      }
      throw error;
    }
  }
}
```

- [ ] **Step 5: Chạy test, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- mappings.service`
Expected: PASS — 9 test.

- [ ] **Step 6: Thêm 2 controller vào `master-data.controller.ts`**

Bổ sung import ở đầu file:

```ts
import {
  CreateClassMajorRuleDto,
  CreateDepartmentAliasDto,
  UpdateClassMajorRuleDto,
  UpdateDepartmentAliasDto,
} from './dto/mapping.dto';
import {
  ClassMajorRulesService,
  DepartmentAliasesService,
} from './mappings.service';
```

Thêm vào **cuối** file — dùng lại đúng hai policy `canRead` / `canManage` đã có sẵn ở đầu file:

```ts
@ApiTags('master-data')
@Controller('department-aliases')
export class DepartmentAliasesController {
  constructor(private readonly service: DepartmentAliasesService) {}

  @Get()
  @CheckPolicies(canRead)
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @CheckPolicies(canManage)
  create(@Body() dto: CreateDepartmentAliasDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies(canManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentAliasDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies(canManage)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}

@ApiTags('master-data')
@Controller('class-major-rules')
export class ClassMajorRulesController {
  constructor(private readonly service: ClassMajorRulesService) {}

  @Get()
  @CheckPolicies(canRead)
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @CheckPolicies(canManage)
  create(@Body() dto: CreateClassMajorRuleDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies(canManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassMajorRuleDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies(canManage)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
```

- [ ] **Step 7: Đăng ký vào `master-data.module.ts`**

Thêm `DepartmentAliasesController`, `ClassMajorRulesController` vào mảng `controllers`; thêm `DepartmentAliasesService`, `ClassMajorRulesService` vào cả `providers` **và** `exports` (khớp quy ước hiện có của module này — bốn service cũ đều được export).

- [ ] **Step 8: Kiểm chứng bằng curl**

```bash
curl -s -b /tmp/fc.txt http://localhost:3001/api/department-aliases | head -c 400; echo
curl -s -b /tmp/fc.txt http://localhost:3001/api/class-major-rules | head -c 400; echo
```

Expected: envelope `{"success":true,...}`, lần lượt 19 và 10 bản ghi từ seed Task 3.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/master-data
git commit -m "feat: CRUD ánh xạ bộ môn và quy tắc lớp sang ngành"
```

---

### Task 11: Bộ lọc dữ liệu thiếu + sửa điểm theo lớp

Ba API phục vụ việc dọn dữ liệu sau import: tìm sinh viên chưa có ngành, tìm lớp chưa phân công giảng viên, và xem/sửa điểm cả lớp.

**Files:**
- Modify: `apps/api/src/modules/students/dto/student.dto.ts` (thêm `missingMajor` vào `ListStudentsQuery`)
- Modify: `apps/api/src/modules/students/students.service.ts` (`list` xử lý `missingMajor`; thêm `bulkAssignMajor`)
- Modify: `apps/api/src/modules/students/students.controller.ts` (route gán ngành hàng loạt)
- Modify: `apps/api/src/modules/master-data/dto/class-section.dto.ts` (thêm `unassigned` vào `ListClassSectionsQuery`)
- Modify: `apps/api/src/modules/master-data/class-sections.service.ts` (`findAll` xử lý `unassigned`; thêm `findGrades`, `updateGrades`)
- Modify: `apps/api/src/modules/master-data/master-data.controller.ts` (2 route trong `ClassSectionsController`)
- Modify: `apps/api/src/modules/master-data/master-data.module.ts` (import `AuditModule` nếu chưa global)
- Create: `apps/api/src/modules/master-data/dto/section-grades.dto.ts`
- Test: `apps/api/src/modules/master-data/class-sections.service.spec.ts`
- Test: `apps/api/src/modules/students/students.service.spec.ts` (bổ sung; tạo mới nếu chưa có)

**Interfaces:**
- Consumes: `deptFilter` (`../../common/utils/dept-scope`), `AuthUser`, `AuditService`
- Produces:
  - `ListStudentsQuery.missingMajor?: boolean`
  - `BulkAssignMajorDto { studentIds: string[]; majorId: string }`
  - `StudentsService.bulkAssignMajor(user: AuthUser, dto: BulkAssignMajorDto)` → `{ updated: number }`
  - `ListClassSectionsQuery.unassigned?: boolean`
  - `ClassSectionsService.findGrades(user: AuthUser, id: string)` → `{ section: { id, code, term, subject }, rows: SectionGradeRow[] }`
  - `ClassSectionsService.updateGrades(user: AuthUser, id: string, dto: UpdateSectionGradesDto)` → `{ updated: number }`
  - `SectionGradeRowDto { enrollmentId: string; totalScore: number | null; result: EnrollmentResult }`
  - `UpdateSectionGradesDto { rows: SectionGradeRowDto[] }`

- [ ] **Step 1: Viết test đỏ cho `missingMajor`**

Thêm vào `apps/api/src/modules/students/students.service.spec.ts` (nếu file chưa có, tạo mới với khung mock: `prisma.$transaction` trả `[[], 0]`, `prisma.student.findMany`/`count` là `jest.fn()`; `adminUser = { id: 'a', roles: ['ADMIN'], departmentId: null } as AuthUser`; `lecturerUser = { id: 'l', roles: ['LECTURER'], departmentId: 'dept-1' } as AuthUser`):

```ts
it('missingMajor=true lọc sinh viên chưa gán ngành', async () => {
  await service.list(adminUser, { missingMajor: true } as ListStudentsQuery);
  const where = prisma.student.findMany.mock.calls[0][0].where;
  expect(where.majorId).toBeNull();
});

it('missingMajor=false không thêm điều kiện majorId', async () => {
  await service.list(adminUser, { missingMajor: false } as ListStudentsQuery);
  const where = prisma.student.findMany.mock.calls[0][0].where;
  expect(where.majorId).toBeUndefined();
});

it('missingMajor không phá scope bộ môn của giảng viên', async () => {
  await service.list(lecturerUser, { missingMajor: true } as ListStudentsQuery);
  const where = prisma.student.findMany.mock.calls[0][0].where;
  expect(where.majorId).toBeNull();
  expect(where.departmentId).toBe('dept-1');
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- students.service`
Expected: FAIL — `where.majorId` là `undefined`.

- [ ] **Step 3: Cài `missingMajor`**

Thêm vào `ListStudentsQuery` trong `apps/api/src/modules/students/dto/student.dto.ts` (bổ sung `IsBoolean` từ `class-validator` và `Transform` từ `class-transformer` vào import nếu chưa có):

```ts
  @ApiPropertyOptional({
    description: 'Chỉ lấy sinh viên chưa gán ngành (hàng chờ dọn sau import)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  missingMajor?: boolean;
```

Trong `students.service.ts`, thêm vào object `where` của `list` — đặt **trước** `...deptFilter(user)` để scope bộ môn vẫn luôn thắng:

```ts
      ...(query.missingMajor ? { majorId: null } : {}),
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- students.service`
Expected: PASS.

- [ ] **Step 5: Viết test đỏ cho lớp học phần**

Tạo `apps/api/src/modules/master-data/class-sections.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { EnrollmentResult } from '@prisma/client';
import type { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import { ClassSectionsService } from './class-sections.service';

const user = { id: 'staff-1', roles: ['ADMIN'], departmentId: null } as AuthUser;

type MockPrisma = PrismaService & Record<string, Record<string, jest.Mock>>;

function makePrisma(): MockPrisma {
  return {
    classSection: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    enrollment: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockResolvedValue([]),
  } as unknown as MockPrisma;
}

const audit = { log: jest.fn() } as unknown as AuditService;

describe('ClassSectionsService — lọc lớp chưa phân công', () => {
  beforeEach(() => jest.clearAllMocks());

  it('unassigned=true lọc lecturerId null', async () => {
    const prisma = makePrisma();
    await new ClassSectionsService(prisma, audit).findAll({ unassigned: true });
    expect(
      prisma.classSection.findMany.mock.calls[0][0].where.lecturerId,
    ).toBeNull();
  });

  it('không truyền unassigned thì không lọc theo lecturerId', async () => {
    const prisma = makePrisma();
    await new ClassSectionsService(prisma, audit).findAll({});
    expect(
      prisma.classSection.findMany.mock.calls[0][0].where.lecturerId,
    ).toBeUndefined();
  });

  it('lọc theo lecturerId cụ thể vẫn hoạt động như cũ', async () => {
    const prisma = makePrisma();
    await new ClassSectionsService(prisma, audit).findAll({
      lecturerId: 'gv-1',
    });
    expect(prisma.classSection.findMany.mock.calls[0][0].where.lecturerId).toBe(
      'gv-1',
    );
  });
});

describe('ClassSectionsService — bảng điểm lớp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trả danh sách sinh viên kèm điểm tổng kết và kết quả', async () => {
    const prisma = makePrisma();
    prisma.classSection.findUnique.mockResolvedValue({
      id: 'cs-1',
      code: 'SOF1021-SD20301-SU26',
      term: 'SU26',
      subject: { code: 'SOF1021', name: 'Lập trình' },
      enrollments: [
        {
          id: 'enr-1',
          totalScore: 7.5,
          result: EnrollmentResult.PASS,
          student: { id: 'stu-1', studentCode: 'PK1', fullName: 'Nguyễn Văn A' },
        },
      ],
    });
    const result = await new ClassSectionsService(prisma, audit).findGrades(
      user,
      'cs-1',
    );
    expect(result.rows).toEqual([
      {
        enrollmentId: 'enr-1',
        studentId: 'stu-1',
        studentCode: 'PK1',
        fullName: 'Nguyễn Văn A',
        totalScore: 7.5,
        result: EnrollmentResult.PASS,
      },
    ]);
  });

  it('lớp không tồn tại → NotFoundException', async () => {
    const prisma = makePrisma();
    prisma.classSection.findUnique.mockResolvedValue(null);
    await expect(
      new ClassSectionsService(prisma, audit).findGrades(user, 'khong-co'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('giảng viên chỉ thấy sinh viên bộ môn mình trong lưới điểm (RULE 2)', async () => {
    const prisma = makePrisma();
    prisma.classSection.findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [],
    });
    const lecturer = {
      id: 'staff-2',
      roles: ['LECTURER'],
      departmentId: 'bm-1',
    } as AuthUser;
    await new ClassSectionsService(prisma, audit).findGrades(lecturer, 'cs-1');
    expect(
      prisma.classSection.findUnique.mock.calls[0][0].include.enrollments.where,
    ).toEqual({ student: { departmentId: 'bm-1' } });
  });

  it('cập nhật điểm chạy trong đúng một transaction', async () => {
    const prisma = makePrisma();
    prisma.classSection.findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [{ id: 'enr-1' }],
    });
    const result = await new ClassSectionsService(prisma, audit).updateGrades(
      user,
      'cs-1',
      { rows: [{ enrollmentId: 'enr-1', totalScore: 8, result: EnrollmentResult.PASS }] },
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ updated: 1 });
  });

  it('từ chối enrollmentId không thuộc lớp — chặn sửa điểm lớp khác', async () => {
    const prisma = makePrisma();
    prisma.classSection.findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [{ id: 'enr-1' }],
    });
    await expect(
      new ClassSectionsService(prisma, audit).updateGrades(user, 'cs-1', {
        rows: [
          { enrollmentId: 'enr-lop-khac', totalScore: 8, result: EnrollmentResult.PASS },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ghi audit log khi sửa điểm', async () => {
    const prisma = makePrisma();
    prisma.classSection.findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [{ id: 'enr-1' }],
    });
    await new ClassSectionsService(prisma, audit).updateGrades(user, 'cs-1', {
      rows: [{ enrollmentId: 'enr-1', totalScore: 8, result: EnrollmentResult.PASS }],
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 'staff-1',
        action: 'SECTION_GRADES_UPDATE',
        entity: 'ClassSection',
        entityId: 'cs-1',
      }),
    );
  });
});
```

- [ ] **Step 6: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- class-sections.service`
Expected: FAIL — `findGrades`/`updateGrades` chưa tồn tại, constructor chưa nhận `audit`.

- [ ] **Step 7: Viết DTO điểm lớp**

Tạo `apps/api/src/modules/master-data/dto/section-grades.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { EnrollmentResult } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SectionGradeRowDto {
  @ApiProperty({ description: 'ID bản ghi ghi danh' })
  @IsUUID()
  enrollmentId!: string;

  @ApiProperty({
    nullable: true,
    example: 7.5,
    description: 'Điểm tổng kết 0..10, null nghĩa là chưa có điểm',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10)
  totalScore!: number | null;

  @ApiProperty({ enum: EnrollmentResult })
  @IsEnum(EnrollmentResult)
  result!: EnrollmentResult;
}

export class UpdateSectionGradesDto {
  @ApiProperty({ type: [SectionGradeRowDto] })
  @ArrayNotEmpty()
  // Lớp đông nhất trong dữ liệu thật ~40 SV; 200 là trần an toàn chặn payload rác.
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SectionGradeRowDto)
  rows!: SectionGradeRowDto[];
}
```

- [ ] **Step 8: Cài `unassigned`, `findGrades`, `updateGrades`**

Trong `class-section.dto.ts`, thêm vào `ListClassSectionsQuery`:

```ts
  @ApiPropertyOptional({ description: 'Chỉ lấy lớp chưa phân công giảng viên' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unassigned?: boolean;
```

Trong `class-sections.service.ts`, bổ sung import:

```ts
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { deptFilter } from '../../common/utils/dept-scope';
import { UpdateSectionGradesDto } from './dto/section-grades.dto';
```

Đổi constructor thành:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
```

Sửa `findAll`:

```ts
  findAll(query: ListClassSectionsQuery) {
    return this.prisma.classSection.findMany({
      where: {
        term: query.term,
        // unassigned thắng lecturerId: hai bộ lọc loại trừ nhau về nghĩa.
        lecturerId: query.unassigned ? null : query.lecturerId,
      },
      orderBy: [{ term: 'desc' }, { code: 'asc' }],
      include: {
        subject: true,
        lecturer: { select: { id: true, staffCode: true, fullName: true } },
        _count: { select: { enrollments: true } },
      },
    });
  }
```

Thêm hai method:

```ts
  async findGrades(user: AuthUser, id: string) {
    const section = await this.prisma.classSection.findUnique({
      where: { id },
      include: {
        subject: { select: { code: true, name: true } },
        enrollments: {
          // RULE 2: lưới điểm chạm sinh viên nên PHẢI đi qua deptFilter —
          // giảng viên/TBM chỉ thấy sinh viên bộ môn mình.
          where: { student: deptFilter(user) },
          orderBy: { student: { studentCode: 'asc' } },
          select: {
            id: true,
            totalScore: true,
            result: true,
            student: { select: { id: true, studentCode: true, fullName: true } },
          },
        },
      },
    });
    if (!section) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }

    const { enrollments, ...rest } = section;
    return {
      section: rest,
      rows: enrollments.map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentId: enrollment.student.id,
        studentCode: enrollment.student.studentCode,
        fullName: enrollment.student.fullName,
        totalScore: enrollment.totalScore,
        result: enrollment.result,
      })),
    };
  }

  async updateGrades(
    user: AuthUser,
    id: string,
    dto: UpdateSectionGradesDto,
  ): Promise<{ updated: number }> {
    const section = await this.prisma.classSection.findUnique({
      where: { id },
      select: {
        id: true,
        // Cùng scope với findGrades: enrollment ngoài bộ môn không lọt vào tập
        // "owned", nên vòng kiểm tra bên dưới chặn luôn (RULE 2).
        enrollments: {
          where: { student: deptFilter(user) },
          select: { id: true },
        },
      },
    });
    if (!section) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }

    // Chặn sửa điểm lớp khác bằng cách nhét enrollmentId lạ vào payload.
    const owned = new Set(section.enrollments.map((item) => item.id));
    const foreign = dto.rows.find((row) => !owned.has(row.enrollmentId));
    if (foreign) {
      throw new NotFoundException(
        'Có bản ghi ghi danh không thuộc lớp học phần này.',
      );
    }

    await this.prisma.$transaction(
      dto.rows.map((row) =>
        this.prisma.enrollment.update({
          where: { id: row.enrollmentId },
          data: { totalScore: row.totalScore, result: row.result },
        }),
      ),
    );

    await this.audit.log({
      staffId: user.id,
      action: 'SECTION_GRADES_UPDATE',
      entity: 'ClassSection',
      entityId: id,
      metadata: { rowCount: dto.rows.length },
    });

    return { updated: dto.rows.length };
  }
```

- [ ] **Step 9: Thêm 2 route vào `ClassSectionsController`**

```ts
  @Get(':id/grades')
  @CheckPolicies(canRead)
  findGrades(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findGrades(user, id);
  }

  @Patch(':id/grades')
  @CheckPolicies(canManage)
  updateGrades(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSectionGradesDto,
  ) {
    return this.service.updateGrades(user, id, dto);
  }
```

Bổ sung import `CurrentUser` (`../../common/decorators/current-user.decorator`), `AuthUser`, `UpdateSectionGradesDto` vào đầu `master-data.controller.ts`.

- [ ] **Step 10: Viết test đỏ cho gán ngành hàng loạt**

Trước hết sửa khung mock trong `students.service.spec.ts`: thêm `updateMany: jest.fn()` vào `prisma.student`, khai báo `const audit = { log: jest.fn() } as unknown as AuditService;` và dựng service bằng `new StudentsService(prisma, audit)`. Thêm `import { NotFoundException } from '@nestjs/common';` và `import type { AuditService } from '../../audit/audit.service';`.

Thêm vào cuối file:

```ts
describe('StudentsService.bulkAssignMajor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('chỉ đụng tới sinh viên trong bộ môn của người dùng (RULE 2)', async () => {
    prisma.student.updateMany.mockResolvedValue({ count: 2 });
    await service.bulkAssignMajor(lecturerUser, {
      studentIds: ['s-1', 's-2'],
      majorId: 'mj-1',
    });
    expect(prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s-1', 's-2'] }, departmentId: 'dept-1' },
      data: { majorId: 'mj-1' },
    });
  });

  it('trả về đúng số bản ghi thực sự được cập nhật', async () => {
    prisma.student.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.bulkAssignMajor(adminUser, {
      studentIds: ['s-1', 's-2'],
      majorId: 'mj-1',
    });
    expect(result).toEqual({ updated: 1 });
  });

  it('không sinh viên nào thuộc phạm vi → NotFoundException, không ghi audit', async () => {
    prisma.student.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.bulkAssignMajor(lecturerUser, {
        studentIds: ['s-ngoai-bo-mon'],
        majorId: 'mj-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('majorId không tồn tại (P2003) → NotFoundException nêu rõ ngành', async () => {
    prisma.student.updateMany.mockRejectedValue(
      Object.assign(new Error('FK'), { code: 'P2003' }),
    );
    await expect(
      service.bulkAssignMajor(adminUser, {
        studentIds: ['s-1'],
        majorId: 'mj-khong-co',
      }),
    ).rejects.toThrow('Ngành học không tồn tại.');
  });

  it('ghi audit log kèm số lượng đã gán', async () => {
    prisma.student.updateMany.mockResolvedValue({ count: 2 });
    await service.bulkAssignMajor(adminUser, {
      studentIds: ['s-1', 's-2'],
      majorId: 'mj-1',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 'a',
        action: 'STUDENT_BULK_ASSIGN_MAJOR',
        entity: 'Student',
        metadata: { majorId: 'mj-1', updated: 2 },
      }),
    );
  });
});
```

- [ ] **Step 11: Chạy test, xác nhận ĐỎ**

Run: `pnpm --filter @fcare/api test -- students.service`
Expected: FAIL — `bulkAssignMajor` chưa tồn tại, constructor chưa nhận `audit`.

- [ ] **Step 12: Viết DTO và cài `bulkAssignMajor`**

Thêm vào cuối `apps/api/src/modules/students/dto/student.dto.ts` (bổ sung `ArrayMaxSize`, `ArrayNotEmpty`, `IsUUID` vào import `class-validator`):

```ts
export class BulkAssignMajorDto {
  @ApiProperty({ type: [String], description: 'Danh sách id sinh viên cần gán ngành' })
  @ArrayNotEmpty()
  // Trang sinh viên phân trang 20 dòng; 500 là trần an toàn chặn payload rác.
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  studentIds!: string[];

  @ApiProperty()
  @IsUUID()
  majorId!: string;
}
```

Trong `students.service.ts`, đổi constructor và thêm method (bổ sung `import { AuditService } from '../../audit/audit.service';` và `BulkAssignMajorDto` vào import DTO):

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
```

```ts
  async bulkAssignMajor(
    user: AuthUser,
    dto: BulkAssignMajorDto,
  ): Promise<{ updated: number }> {
    let result: { count: number };
    try {
      result = await this.prisma.student.updateMany({
        // deptFilter nằm trong where: sinh viên ngoài bộ môn không bị đụng tới,
        // và người gọi cũng không biết được id đó có tồn tại hay không (RULE 2).
        where: { id: { in: dto.studentIds }, ...deptFilter(user) },
        data: { majorId: dto.majorId },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Ngành học không tồn tại.');
      }
      throw error;
    }

    if (result.count === 0) {
      throw new NotFoundException(
        'Không có sinh viên nào trong phạm vi truy cập của bạn khớp danh sách đã chọn.',
      );
    }

    await this.audit.log({
      staffId: user.id,
      action: 'STUDENT_BULK_ASSIGN_MAJOR',
      entity: 'Student',
      metadata: { majorId: dto.majorId, updated: result.count },
    });

    return { updated: result.count };
  }
```

`AuditEntry.entityId` là tuỳ chọn nên thao tác hàng loạt bỏ trống được; số lượng và ngành nằm trong `metadata`.

- [ ] **Step 13: Thêm route gán hàng loạt vào `StudentsController`**

Chèn **NGAY TRƯỚC** `@Patch(':id')` — Nest khớp route theo thứ tự khai báo, đặt sau thì `bulk-assign-major` sẽ bị `:id` nuốt mất:

```ts
  @Patch('bulk-assign-major')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Student'))
  bulkAssignMajor(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkAssignMajorDto,
  ) {
    return this.studentsService.bulkAssignMajor(user, dto);
  }
```

Bổ sung `BulkAssignMajorDto` vào import DTO ở đầu file.

- [ ] **Step 14: Xác nhận `AuditService` khả dụng**

`apps/api/src/audit/audit.module.ts` đã gắn `@Global()` và export `AuditService`, nên **không phải sửa module nào** — cả `MasterDataModule` lẫn `StudentsModule` inject thẳng được. Chỉ chạy lệnh sau để chắc chắn điều đó chưa đổi:

```bash
grep -n '@Global()' apps/api/src/audit/audit.module.ts
```

Expected: in ra một dòng. Nếu không in ra gì, thêm `AuditModule` vào mảng `imports` của cả `master-data.module.ts` và `students.module.ts`.

- [ ] **Step 15: Chạy test, xác nhận XANH**

Run: `pnpm --filter @fcare/api test -- class-sections.service students.service`
Expected: PASS — 10 test (`class-sections.service`) + 8 test (`students.service`).

- [ ] **Step 16: Kiểm chứng bằng curl**

```bash
curl -s -b /tmp/fc.txt 'http://localhost:3001/api/class-sections?unassigned=true' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('lop chua phan cong:',JSON.parse(d).data.length))"
curl -s -b /tmp/fc.txt 'http://localhost:3001/api/students?missingMajor=true&limit=5' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('SV chua gan nganh:',JSON.parse(d).data.meta.total))"
```

Expected: hai con số khớp §8 của spec — khoảng 76 lớp chưa phân công và khoảng 8 sinh viên chưa gán ngành.

- [ ] **Step 17: Commit**

```bash
git add apps/api/src/modules/master-data apps/api/src/modules/students
git commit -m "feat: loc du lieu thieu sau import va API sua diem theo lop"
```

---

### Task 12: Trình hướng dẫn import 4 bước trên web

Thay phần import của trang `/import-export` bằng wizard *Chọn loại → Tải file → Xem trước → Xác nhận*, kèm bảng lịch sử. Phần export Excel hiện có giữ nguyên, chuyển xuống dưới.

**Files:**
- Create: `apps/web/src/components/imports/import-wizard.tsx`
- Create: `apps/web/src/components/imports/import-preview.tsx`
- Create: `apps/web/src/components/imports/import-history.tsx`
- Create: `apps/web/src/lib/import-kinds.ts`
- Modify: `apps/web/src/app/(dashboard)/import-export/page.tsx`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/api.ts` (`apiUpload` nhận thêm field)

**Interfaces:**
- Consumes: API của Task 5 — `POST /imports/:slug/upload`, `POST /imports/:id/commit`, `GET /imports`, `DELETE /imports/:id`
- Produces:
  - `IMPORT_KINDS: ReadonlyArray<{ slug; label; hint }>` và `ImportKindSlug` (`lib/import-kinds.ts`)
  - `ImportKind`, `ImportStatus`, `ImportRowView`, `ImportBatchSummary`, `ImportBatchDetail`, `ImportCommitResult` (`lib/types.ts`)
  - `apiUpload<T>(path: string, file: File, fields?: Record<string, string>): Promise<T>`
  - `<ImportWizard />`, `<ImportPreview batch isCommitting onCommit onDiscard />`, `<ImportHistory />`

- [ ] **Step 1: Mở rộng `apiUpload` để gửi kèm học kỳ**

Trong `apps/web/src/lib/api.ts`, thay thân hàm `apiUpload`:

```ts
export async function apiUpload<T>(
  path: string,
  file: File,
  fields?: Record<string, string>,
): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);
  for (const [key, value] of Object.entries(fields ?? {})) {
    formData.append(key, value);
  }
  return apiFetch<T>(path, { method: 'POST', body: formData });
}
```

Tham số thứ ba là tuỳ chọn nên hai lời gọi cũ trong `import-export/page.tsx` không phải sửa.

- [ ] **Step 2: Khai báo kiểu và danh mục loại import**

Thêm vào `apps/web/src/lib/types.ts`:

```ts
export type ImportKind = 'CATALOG' | 'LECTURER' | 'SCHEDULE' | 'GRADEBOOK';
export type ImportStatus = 'PENDING' | 'COMMITTED' | 'FAILED' | 'CANCELLED';

export interface ImportRowView {
  id: string;
  sheet: string;
  rowIndex: number;
  payload: Record<string, unknown>;
  error: string | null;
}

export interface ImportBatchSummary {
  id: string;
  kind: ImportKind;
  status: ImportStatus;
  term: string;
  fileName: string;
  totalRows: number;
  errorCount: number;
  warnings: string[];
  unmappedAliases: string[];
  createdAt: string;
  committedAt: string | null;
  createdBy?: { staffCode: string; fullName: string };
}

export interface ImportBatchDetail extends ImportBatchSummary {
  rows: ImportRowView[];
}

export interface ImportCommitResult {
  created: number;
  updated: number;
  skipped: number;
}
```

Tạo `apps/web/src/lib/import-kinds.ts`:

```ts
/** Bốn loại import, theo đúng thứ tự phải chạy: danh mục trước, dữ liệu sau. */
export const IMPORT_KINDS = [
  {
    slug: 'catalog',
    label: 'Danh mục môn học',
    hint: 'Sheet "3.1.Môn-BM" của file phân công. Chạy đầu tiên — các bước sau cần môn học đã có.',
  },
  {
    slug: 'lecturer',
    label: 'Danh sách giảng viên',
    hint: 'Sheet "T.Kê". Tạo tài khoản với mật khẩu tạm; cấp lại mật khẩu ở trang Người dùng.',
  },
  {
    slug: 'schedule',
    label: 'Lịch và phân công lớp',
    hint: 'Hai sheet "BL1+BL2" và "Lịch tool". Lớp chưa có giảng viên sẽ ở trạng thái chờ gán.',
  },
  {
    slug: 'gradebook',
    label: 'Bảng điểm',
    hint: 'File gradebook nhiều sheet. Chỉ lấy điểm tổng kết và trạng thái.',
  },
] as const;

export type ImportKindSlug = (typeof IMPORT_KINDS)[number]['slug'];
```

- [ ] **Step 3: Viết `import-preview.tsx`**

```tsx
'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { DataTable, Td } from '../ui/data-table';
import type { ImportBatchDetail } from '../../lib/types';

const MAX_VISIBLE_ROWS = 50;

interface ImportPreviewProps {
  batch: ImportBatchDetail;
  isCommitting: boolean;
  onCommit: () => void;
  onDiscard: () => void;
}

export function ImportPreview({
  batch,
  isCommitting,
  onCommit,
  onDiscard,
}: ImportPreviewProps) {
  const okCount = batch.totalRows - batch.errorCount;
  const visible = batch.rows.slice(0, MAX_VISIBLE_ROWS);
  const columns = Object.keys(visible[0]?.payload ?? {});

  return (
    <section aria-labelledby="preview-heading" className="space-y-4">
      <h3 id="preview-heading" className="text-lg font-bold text-fpt-blue-900">
        Xem trước — {batch.fileName}
      </h3>

      <dl className="flex flex-wrap gap-6 rounded-md border border-border bg-surface p-4 text-sm">
        <div>
          <dt className="text-muted">Tổng dòng</dt>
          <dd className="text-xl font-bold text-ink">{batch.totalRows}</dd>
        </div>
        <div>
          <dt className="text-muted">Sẽ ghi</dt>
          <dd className="text-xl font-bold text-success">{okCount}</dd>
        </div>
        <div>
          <dt className="text-muted">Dòng lỗi (bỏ qua)</dt>
          <dd className="text-xl font-bold text-danger">{batch.errorCount}</dd>
        </div>
      </dl>

      {batch.warnings.length > 0 ? (
        <ul role="status" className="space-y-1 rounded-md bg-warning/10 p-4 text-sm text-ink">
          {batch.warnings.map((warning) => (
            <li key={warning}>⚠ {warning}</li>
          ))}
        </ul>
      ) : null}

      {batch.unmappedAliases.length > 0 ? (
        <div role="status" className="rounded-md bg-warning/10 p-4 text-sm text-ink">
          <p className="font-semibold">
            {batch.unmappedAliases.length} nhãn bộ môn chưa có ánh xạ — dòng dùng
            nhãn này sẽ bị bỏ qua:
          </p>
          <p className="mt-1">{batch.unmappedAliases.join(' · ')}</p>
          <p className="mt-2">
            Thêm ánh xạ tại <strong>Đào tạo → Ánh xạ bộ môn</strong> rồi tải lại file.
          </p>
        </div>
      ) : null}

      <DataTable
        headers={['Sheet', 'Dòng', ...columns, 'Ghi chú']}
        isEmpty={visible.length === 0}
        emptyMessage="File không có dòng dữ liệu nào."
      >
        {visible.map((row) => (
          <tr key={row.id} className={row.error ? 'bg-danger/5' : undefined}>
            <Td className="text-muted">{row.sheet}</Td>
            <Td className="text-muted">{row.rowIndex}</Td>
            {columns.map((column) => (
              <Td key={column}>{String(row.payload[column] ?? '—')}</Td>
            ))}
            <Td>
              {row.error ? (
                <Badge tone="danger">{row.error}</Badge>
              ) : (
                <span className="text-success">Hợp lệ</span>
              )}
            </Td>
          </tr>
        ))}
      </DataTable>

      {batch.rows.length > MAX_VISIBLE_ROWS ? (
        <p className="text-sm text-muted">
          Hiển thị {MAX_VISIBLE_ROWS}/{batch.rows.length} dòng đầu. Xác nhận sẽ ghi
          toàn bộ dòng hợp lệ.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={onCommit} disabled={isCommitting || okCount === 0}>
          {isCommitting ? 'Đang ghi…' : `✓ Xác nhận ghi ${okCount} dòng`}
        </Button>
        <Button type="button" variant="secondary" onClick={onDiscard} disabled={isCommitting}>
          Huỷ lô này
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Viết `import-history.tsx`**

```tsx
'use client';

import { Badge } from '@fcare/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { DataTable, Td } from '../ui/data-table';
import { apiFetch } from '../../lib/api';
import { formatDate } from '../../lib/labels';
import { IMPORT_KINDS } from '../../lib/import-kinds';
import type { ImportBatchSummary, ImportStatus } from '../../lib/types';

const STATUS_LABELS: Record<ImportStatus, string> = {
  PENDING: 'Chờ xác nhận',
  COMMITTED: 'Đã ghi',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã huỷ',
};

const STATUS_TONES: Record<ImportStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  COMMITTED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

const KIND_LABELS: Record<string, string> = Object.fromEntries(
  IMPORT_KINDS.map((kind) => [kind.slug.toUpperCase(), kind.label]),
);

export function ImportHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: () => apiFetch<ImportBatchSummary[]>('/imports'),
  });

  return (
    <section aria-labelledby="history-heading" className="mt-10">
      <h2
        id="history-heading"
        className="mb-3 font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900"
      >
        Lịch sử import
      </h2>
      <DataTable
        headers={[
          'Thời điểm',
          'Loại',
          'Học kỳ',
          'File',
          'Dòng',
          'Lỗi',
          'Trạng thái',
          'Người thực hiện',
        ]}
        isEmpty={!isLoading && (data?.length ?? 0) === 0}
        emptyMessage="Chưa có lượt import nào."
      >
        {(data ?? []).map((batch) => (
          <tr key={batch.id} className="transition-colors hover:bg-fpt-orange-50/40">
            <Td className="whitespace-nowrap text-muted">{formatDate(batch.createdAt)}</Td>
            <Td>{KIND_LABELS[batch.kind] ?? batch.kind}</Td>
            <Td>{batch.term}</Td>
            <Td className="max-w-xs truncate">{batch.fileName}</Td>
            <Td>{batch.totalRows}</Td>
            <Td className={batch.errorCount > 0 ? 'text-danger' : undefined}>
              {batch.errorCount}
            </Td>
            <Td>
              <Badge tone={STATUS_TONES[batch.status]}>{STATUS_LABELS[batch.status]}</Badge>
            </Td>
            <Td>{batch.createdBy?.fullName ?? '—'}</Td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
```

- [ ] **Step 5: Viết `import-wizard.tsx`**

```tsx
'use client';

import { Button, SurfaceCard } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ImportPreview } from './import-preview';
import { FormError, FormSuccess, Input, Label } from '../ui/form';
import { ApiError, apiFetch, apiUpload } from '../../lib/api';
import { IMPORT_KINDS, type ImportKindSlug } from '../../lib/import-kinds';
import type { ImportBatchDetail, ImportCommitResult } from '../../lib/types';

const TERM_PATTERN = /^[A-Z]{2}\d{2}$/;
const STEP_LABELS = ['Chọn loại', 'Tải file', 'Xem trước', 'Xác nhận'];

export function ImportWizard() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [slug, setSlug] = useState<ImportKindSlug | null>(null);
  const [term, setTerm] = useState('SU26');
  const [batch, setBatch] = useState<ImportBatchDetail | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  function resetFile() {
    setBatch(null);
    setError('');
    setDone('');
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  }

  const upload = useMutation({
    mutationFn: (file: File) =>
      apiUpload<ImportBatchDetail>(`/imports/${slug}/upload`, file, { term }),
    onSuccess: (result) => {
      setBatch(result);
      setError('');
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Không đọc được file.'),
  });

  const commit = useMutation({
    mutationFn: () =>
      apiFetch<ImportCommitResult>(`/imports/${batch!.id}/commit`, { method: 'POST' }),
    onSuccess: (result) => {
      setDone(
        `Đã ghi: ${result.created} tạo mới, ${result.updated} cập nhật, ${result.skipped} bỏ qua.`,
      );
      setBatch(null);
      queryClient.invalidateQueries();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Ghi dữ liệu thất bại.'),
  });

  const discard = useMutation({
    mutationFn: () =>
      apiFetch<{ discarded: boolean }>(`/imports/${batch!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      resetFile();
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Huỷ lô thất bại.'),
  });

  const termValid = TERM_PATTERN.test(term);
  const currentStep = batch ? 2 : slug ? 1 : 0;

  return (
    <SurfaceCard className="border-t-4 border-t-fpt-blue">
      <ol className="mb-6 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
        {STEP_LABELS.map((label, index) => (
          <li
            key={label}
            aria-current={index === currentStep ? 'step' : undefined}
            className={`rounded-full px-3 py-1.5 ${
              index < currentStep
                ? 'bg-success text-white'
                : index === currentStep
                  ? 'bg-fpt-orange text-white'
                  : 'bg-surface text-muted'
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="mb-4 space-y-2">
        <FormError>{error}</FormError>
        <FormSuccess>{done}</FormSuccess>
      </div>

      {batch ? (
        <ImportPreview
          batch={batch}
          isCommitting={commit.isPending}
          onCommit={() => commit.mutate()}
          onDiscard={() => discard.mutate()}
        />
      ) : (
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">
              1. Chọn loại dữ liệu
            </legend>
            <div className="grid gap-3 md:grid-cols-2">
              {IMPORT_KINDS.map((kind) => (
                <label
                  key={kind.slug}
                  className={`cursor-pointer rounded-md border p-4 transition-colors focus-within:ring-2 focus-within:ring-fpt-orange ${
                    slug === kind.slug
                      ? 'border-fpt-orange bg-fpt-orange-50/50'
                      : 'border-border hover:border-fpt-blue'
                  }`}
                >
                  <input
                    type="radio"
                    name="import-kind"
                    value={kind.slug}
                    checked={slug === kind.slug}
                    onChange={() => {
                      setSlug(kind.slug);
                      resetFile();
                    }}
                    className="sr-only"
                  />
                  <span className="block font-semibold text-ink">{kind.label}</span>
                  <span className="mt-1 block text-sm text-muted">{kind.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="import-term">2. Học kỳ</Label>
              <Input
                id="import-term"
                value={term}
                onChange={(event) => setTerm(event.target.value.toUpperCase())}
                placeholder="SU26"
                aria-invalid={!termValid}
              />
              {!termValid ? (
                <p className="mt-1 text-sm text-danger">
                  Học kỳ gồm 2 chữ cái và 2 chữ số, ví dụ SU26.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="import-file">Chọn file .xlsx</Label>
              <input
                ref={fileRef}
                id="import-file"
                type="file"
                accept=".xlsx"
                className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-fpt-orange-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-fpt-orange"
              />
            </div>
          </div>

          <p className="text-sm text-muted">
            File chứa cột hoặc giá trị CCCD/SĐT/email/địa chỉ sẽ bị{' '}
            <strong>từ chối toàn bộ</strong>. Hãy xoá các cột đó trước khi tải lên.
          </p>

          <Button
            type="button"
            disabled={!slug || !termValid || upload.isPending}
            onClick={() => {
              const file = fileRef.current?.files?.[0];
              if (!file) {
                setError('Chưa chọn file.');
                return;
              }
              upload.mutate(file);
            }}
          >
            {upload.isPending ? 'Đang đọc file…' : '3. Đọc file và xem trước'}
          </Button>
        </div>
      )}
    </SurfaceCard>
  );
}
```

- [ ] **Step 6: Ghép wizard vào trang `/import-export`**

Trong `apps/web/src/app/(dashboard)/import-export/page.tsx`:
- Thêm `import { ImportWizard } from '../../../components/imports/import-wizard';` và `import { ImportHistory } from '../../../components/imports/import-history';`
- Đổi `PageHeader` thành:

```tsx
      <PageHeader
        title="Import / Export dữ liệu"
        description="Nhập dữ liệu từ file Excel của trường theo 4 bước có xem trước. Chỉ Trưởng bộ môn, Cán bộ Đào tạo và CTSV được sử dụng. Mọi thao tác đều ghi audit log."
      />
```

- Ngay dưới `PageHeader`, chèn `<ImportWizard />`.
- Bọc khối `grid lg:grid-cols-2` hiện có trong một `<section>` có tiêu đề riêng để phân biệt với wizard:

```tsx
      <section aria-labelledby="legacy-heading" className="mt-10">
        <h2
          id="legacy-heading"
          className="mb-3 font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900"
        >
          Import/Export mẫu chuẩn FCare
        </h2>
        {/* giữ nguyên grid hai SurfaceCard hiện có */}
      </section>
```

- Đặt `<ImportHistory />` ở cuối trang.

- [ ] **Step 7: Kiểm tra thủ công**

```bash
pnpm dev
```

Mở `http://localhost:3000/import-export`, đăng nhập ADMIN, kiểm:
1. Chọn "Danh mục môn học", học kỳ `SU26`, tải file phân công → hiện bảng xem trước và cảnh báo nhãn bộ môn chưa ánh xạ.
2. Bấm "Huỷ lô này" → quay lại bước chọn file; lô xuất hiện trong lịch sử với trạng thái "Đã huỷ".
3. Tải lại và bấm "Xác nhận ghi" → hiện dòng tổng kết; lịch sử chuyển "Đã ghi".
4. Nhập học kỳ sai `SU2026` → nút bị vô hiệu và có thông báo lỗi dưới ô nhập.

- [ ] **Step 8: Kiểm typecheck, lint và ngân sách bundle**

```bash
pnpm --filter @fcare/web typecheck && pnpm --filter @fcare/web lint && pnpm --filter @fcare/web build
```

Expected: xanh; route `/import-export` trong bảng output của Next < 300 kB First Load JS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat: trinh huong dan import 4 buoc co xem truoc va lich su"
```

---

### Task 13: Màn hình quản trị dữ liệu sau import

Bốn thay đổi UI dùng API của Task 10–11: hai tab ánh xạ mới, trang sửa điểm theo lớp, trang sinh viên (lọc "Chưa gán ngành" + gán ngành hàng loạt, trạng thái lọc nằm trên URL), và cột "Loại GV".

**Files:**
- Create: `apps/web/src/components/master-data/mapping-view.tsx`
- Create: `apps/web/src/components/master-data/section-grades-view.tsx`
- Create: `apps/web/src/app/(dashboard)/class-sections/[id]/grades/page.tsx`
- Modify: `apps/web/src/lib/master-data-tabs.ts`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/app/(dashboard)/master-data/[tab]/page.tsx`
- Modify: `apps/web/src/components/master-data/master-data-view.tsx` (nới `Record<MasterDataTabKey, …>` + link "Bảng điểm")
- Modify: `apps/web/src/app/(dashboard)/students/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/admin/users/page.tsx`

**Interfaces:**
- Consumes: `/department-aliases`, `/class-major-rules` (Task 10); `/class-sections/:id/grades`, `?unassigned=true`, `?missingMajor=true`, `PATCH /students/bulk-assign-major` (Task 11)
- Produces:
  - `MASTER_DATA_TABS` thêm khoá `department-aliases` và `class-major-rules`
  - `MappingTabKey = 'department-aliases' | 'class-major-rules'`; `<MappingView tab={...} />`
  - `<SectionGradesView sectionId={...} />`
  - Types: `DepartmentAlias`, `ClassMajorRule`, `SectionGradeRow`, `SectionGradesResponse`

`master-data-view.tsx` đã 453 dòng và bọc bốn danh mục có hình dạng khác nhau; nhét thêm hai danh mục nữa sẽ vượt ngưỡng dễ đọc. Hai tab ánh xạ đi vào file riêng, chia theo trách nhiệm — `master-data-view` giữ danh mục học vụ, `mapping-view` giữ bảng ánh xạ phục vụ import.

- [ ] **Step 1: Khai báo kiểu mới**

Thêm vào `apps/web/src/lib/types.ts`:

```ts
export interface DepartmentAlias {
  id: string;
  alias: string;
  departmentId: string;
  department?: { id: string; code: string; name: string };
}

export interface ClassMajorRule {
  id: string;
  classPrefix: string;
  majorId: string;
  major?: { id: string; code: string; name: string };
}

export interface SectionGradeRow {
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  totalScore: number | null;
  result: EnrollmentResult;
}

export interface SectionGradesResponse {
  section: {
    id: string;
    code: string;
    term: string;
    subject?: { code: string; name: string };
  };
  rows: SectionGradeRow[];
}
```

Đồng thời cập nhật `StaffMember`, thêm hai trường do Task 2 đưa vào schema:

```ts
  lecturerType: string | null;
  username: string | null;
```

- [ ] **Step 2: Đăng ký hai tab mới**

Thêm vào cuối mảng trong `apps/web/src/lib/master-data-tabs.ts`, trước `] as const;`:

```ts
  {
    key: 'department-aliases',
    label: 'Ánh xạ bộ môn',
    singular: 'ánh xạ bộ môn',
    path: '/department-aliases',
  },
  {
    key: 'class-major-rules',
    label: 'Quy tắc lớp → ngành',
    singular: 'quy tắc lớp → ngành',
    path: '/class-major-rules',
  },
```

- [ ] **Step 3: Nới các `Record<MasterDataTabKey, …>` trong `master-data-view.tsx`**

Thêm hai khoá vào `MasterDataTabKey` làm mọi `Record<MasterDataTabKey, …>` trong file này thành thiếu khoá → typecheck đỏ. Với **mỗi** hằng có kiểu đó (`DELETE_HINTS` và bất kỳ hằng nào khác grep ra được), đổi thành `Partial<Record<MasterDataTabKey, …>>` và chỗ đọc thành `HANG[tab] ?? ''`:

```bash
grep -n 'Record<MasterDataTabKey' apps/web/src/components/master-data/master-data-view.tsx
```

Xử lý hết các dòng grep trả về; đừng chỉ sửa `DELETE_HINTS`.

- [ ] **Step 4: Viết `mapping-view.tsx`**

```tsx
'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { DataTable, Td } from '../ui/data-table';
import { FormError, Input, Label, Select } from '../ui/form';
import { Modal } from '../ui/modal';
import { PageHeader } from '../ui/page-header';
import { ApiError, apiFetch } from '../../lib/api';
import { MASTER_DATA_TABS } from '../../lib/master-data-tabs';
import type {
  ClassMajorRule,
  Department,
  DepartmentAlias,
  Major,
} from '../../lib/types';

export type MappingTabKey = 'department-aliases' | 'class-major-rules';

/** Hàng gộp: chỉ một nửa số trường có giá trị, tuỳ tab đang mở. */
type MappingRow = Partial<DepartmentAlias> & Partial<ClassMajorRule> & { id: string };

const DESCRIPTIONS: Record<MappingTabKey, string> = {
  'department-aliases':
    'Nhãn bộ môn trong file Excel của trường không trùng mã bộ môn trong hệ thống. Mỗi nhãn chưa ánh xạ khiến dòng dữ liệu tương ứng bị bỏ qua khi import.',
  'class-major-rules':
    'Hai chữ cái đầu của mã lớp hành chính xác định ngành học. Thiếu quy tắc thì sinh viên rơi vào hàng chờ gán ngành thủ công.',
};

export function MappingView({ tab }: { tab: MappingTabKey }) {
  const queryClient = useQueryClient();
  const config = MASTER_DATA_TABS.find((item) => item.key === tab)!;
  const isAlias = tab === 'department-aliases';

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MappingRow | null>(null);
  const [deleting, setDeleting] = useState<MappingRow | null>(null);
  const [formError, setFormError] = useState('');

  const items = useQuery({
    queryKey: [tab],
    queryFn: () => apiFetch<MappingRow[]>(config.path),
  });
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiFetch<Department[]>('/departments'),
    enabled: isAlias,
  });
  const majors = useQuery({
    queryKey: ['majors'],
    queryFn: () => apiFetch<Major[]>('/majors'),
    enabled: !isAlias,
  });

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setFormError('');
  }

  const save = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiFetch(editing ? `${config.path}/${editing.id}` : config.path, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [tab] });
      closeForm();
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : 'Lưu thất bại.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${config.path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [tab] });
      setDeleting(null);
      setFormError('');
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : 'Xóa thất bại.'),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate(
      isAlias
        ? {
            alias: String(form.get('alias') ?? '').trim(),
            departmentId: String(form.get('departmentId') ?? ''),
          }
        : {
            classPrefix: String(form.get('classPrefix') ?? '').trim().toUpperCase(),
            majorId: String(form.get('majorId') ?? ''),
          },
    );
  }

  return (
    <>
      <PageHeader
        title={config.label}
        description={DESCRIPTIONS[tab]}
        actions={
          <Button type="button" onClick={() => setCreating(true)}>
            + Thêm {config.singular}
          </Button>
        }
      />

      <nav aria-label="Danh mục đào tạo" className="mb-4 flex flex-wrap gap-2">
        {MASTER_DATA_TABS.map((item) => (
          <Link
            key={item.key}
            href={`/master-data/${item.key}`}
            aria-current={item.key === tab ? 'page' : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              item.key === tab
                ? 'bg-fpt-blue-900 text-white'
                : 'bg-white text-ink hover:bg-fpt-orange-50'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <DataTable
        headers={
          isAlias
            ? ['Nhãn trong file Excel', 'Bộ môn đích', 'Thao tác']
            : ['Tiền tố lớp', 'Ngành đích', 'Thao tác']
        }
        isEmpty={!items.isLoading && (items.data?.length ?? 0) === 0}
        emptyMessage="Chưa có ánh xạ nào."
      >
        {(items.data ?? []).map((row) => (
          <tr key={row.id} className="transition-colors hover:bg-fpt-orange-50/40">
            <Td className="font-semibold text-ink">
              {isAlias ? row.alias : row.classPrefix}
            </Td>
            <Td>
              {isAlias
                ? `${row.department?.code ?? '—'} — ${row.department?.name ?? ''}`
                : `${row.major?.code ?? '—'} — ${row.major?.name ?? ''}`}
            </Td>
            <Td>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setEditing(row)}>
                  Sửa
                </Button>
                <Button type="button" variant="secondary" onClick={() => setDeleting(row)}>
                  Xóa
                </Button>
              </div>
            </Td>
          </tr>
        ))}
      </DataTable>

      <Modal
        title={`${editing ? 'Sửa' : 'Thêm'} ${config.singular}`}
        open={creating || editing !== null}
        onClose={closeForm}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {isAlias ? (
            <>
              <div>
                <Label htmlFor="alias">Nhãn trong file Excel</Label>
                <Input id="alias" name="alias" defaultValue={editing?.alias ?? ''} required />
              </div>
              <div>
                <Label htmlFor="departmentId">Bộ môn đích</Label>
                <Select
                  id="departmentId"
                  name="departmentId"
                  defaultValue={editing?.departmentId ?? ''}
                  required
                >
                  <option value="">Chọn bộ môn…</option>
                  {(departments.data ?? []).map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} — {department.name}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="classPrefix">Tiền tố lớp (2 chữ cái)</Label>
                <Input
                  id="classPrefix"
                  name="classPrefix"
                  defaultValue={editing?.classPrefix ?? ''}
                  pattern="[A-Za-z]{2}"
                  maxLength={2}
                  required
                />
              </div>
              <div>
                <Label htmlFor="majorId">Ngành đích</Label>
                <Select id="majorId" name="majorId" defaultValue={editing?.majorId ?? ''} required>
                  <option value="">Chọn ngành…</option>
                  {(majors.data ?? []).map((major) => (
                    <option key={major.id} value={major.id}>
                      {major.code} — {major.name}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
          <FormError>{formError}</FormError>
          <div className="flex gap-3">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Hủy
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        title={`Xóa ${config.singular}`}
        open={deleting !== null}
        onClose={() => setDeleting(null)}
      >
        <p className="text-sm text-ink">
          Xóa ánh xạ này? Các lần import sau sẽ bỏ qua dòng dùng nhãn tương ứng.
        </p>
        <FormError>{formError}</FormError>
        <div className="mt-4 flex gap-3">
          <Button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate(deleting!.id)}
          >
            {remove.isPending ? 'Đang xóa…' : 'Xóa'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>
            Hủy
          </Button>
        </div>
      </Modal>
    </>
  );
}
```

- [ ] **Step 5: Định tuyến hai tab mới**

Thay toàn bộ `apps/web/src/app/(dashboard)/master-data/[tab]/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import {
  MappingView,
  type MappingTabKey,
} from '../../../../components/master-data/mapping-view';
import { MasterDataView } from '../../../../components/master-data/master-data-view';
import { isMasterDataTabKey } from '../../../../lib/master-data-tabs';

const MAPPING_TABS: readonly string[] = ['department-aliases', 'class-major-rules'];

export default async function MasterDataTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  if (!isMasterDataTabKey(tab)) {
    redirect('/master-data/departments');
  }
  if (MAPPING_TABS.includes(tab)) {
    return <MappingView tab={tab as MappingTabKey} />;
  }
  return <MasterDataView tab={tab} />;
}
```

`MasterDataView` nhận `tab: MasterDataTabKey` nên vẫn hợp kiểu; hai tab ánh xạ đã được chặn trước bởi nhánh `MAPPING_TABS`. Nếu `MasterDataView` `switch` trên `tab` mà không có nhánh mặc định, thêm `default: return null;`.

- [ ] **Step 6: Viết `section-grades-view.tsx`**

```tsx
'use client';

import { Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DataTable, Td } from '../ui/data-table';
import { FormError, FormSuccess, Input, Select } from '../ui/form';
import { PageHeader } from '../ui/page-header';
import { ApiError, apiFetch } from '../../lib/api';
import type {
  EnrollmentResult,
  SectionGradeRow,
  SectionGradesResponse,
} from '../../lib/types';

const RESULT_LABELS: Record<EnrollmentResult, string> = {
  IN_PROGRESS: 'Đang học',
  PASS: 'Đạt',
  FAIL: 'Không đạt',
};

export function SectionGradesView({ sectionId }: { sectionId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SectionGradeRow[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['section-grades', sectionId],
    queryFn: () => apiFetch<SectionGradesResponse>(`/class-sections/${sectionId}/grades`),
  });

  useEffect(() => {
    if (data) {
      setDraft(data.rows);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ updated: number }>(`/class-sections/${sectionId}/grades`, {
        method: 'PATCH',
        body: JSON.stringify({
          rows: draft.map((row) => ({
            enrollmentId: row.enrollmentId,
            totalScore: row.totalScore,
            result: row.result,
          })),
        }),
      }),
    onSuccess: (result) => {
      setSaved(`Đã lưu ${result.updated} dòng điểm.`);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['section-grades', sectionId] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Lưu thất bại.'),
  });

  function patchRow(enrollmentId: string, patch: Partial<SectionGradeRow>) {
    // Bất biến: tạo mảng và object mới, không sửa tại chỗ.
    setDraft((rows) =>
      rows.map((row) =>
        row.enrollmentId === enrollmentId ? { ...row, ...patch } : row,
      ),
    );
    setSaved('');
  }

  return (
    <>
      <PageHeader
        title={`Điểm lớp ${data?.section.code ?? ''}`}
        description={
          data?.section.subject
            ? `${data.section.subject.code} — ${data.section.subject.name} · Học kỳ ${data.section.term}`
            : 'Chỉ nhập điểm tổng kết và kết quả; hệ thống không lưu điểm thành phần.'
        }
        actions={
          <Button
            type="button"
            disabled={save.isPending || draft.length === 0}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Đang lưu…' : 'Lưu bảng điểm'}
          </Button>
        }
      />

      <div className="mb-4 space-y-2">
        <FormError>{error}</FormError>
        <FormSuccess>{saved}</FormSuccess>
      </div>

      <DataTable
        headers={['MSSV', 'Họ tên', 'Điểm tổng kết', 'Kết quả']}
        isEmpty={!isLoading && draft.length === 0}
        emptyMessage="Lớp chưa có sinh viên ghi danh."
      >
        {draft.map((row) => (
          <tr key={row.enrollmentId}>
            <Td className="font-semibold text-ink">{row.studentCode}</Td>
            <Td>{row.fullName}</Td>
            <Td>
              <Input
                type="number"
                min={0}
                max={10}
                step={0.1}
                aria-label={`Điểm tổng kết của ${row.studentCode}`}
                value={row.totalScore ?? ''}
                onChange={(event) =>
                  patchRow(row.enrollmentId, {
                    totalScore:
                      event.target.value === '' ? null : Number(event.target.value),
                  })
                }
                className="max-w-28"
              />
            </Td>
            <Td>
              <Select
                aria-label={`Kết quả của ${row.studentCode}`}
                value={row.result}
                onChange={(event) =>
                  patchRow(row.enrollmentId, {
                    result: event.target.value as EnrollmentResult,
                  })
                }
                className="max-w-40"
              >
                {Object.entries(RESULT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
```

- [ ] **Step 7: Thêm route trang điểm lớp và link vào bảng lớp học phần**

Tạo `apps/web/src/app/(dashboard)/class-sections/[id]/grades/page.tsx`:

```tsx
import { SectionGradesView } from '../../../../../components/master-data/section-grades-view';

export default async function SectionGradesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SectionGradesView sectionId={id} />;
}
```

Trong `master-data-view.tsx`, ở nhánh render hàng của tab `class-sections`, thêm vào cụm nút thao tác (bổ sung `import Link from 'next/link';` nếu chưa có):

```tsx
                  <Link
                    href={`/class-sections/${entity.id}/grades`}
                    className="rounded-md px-3 py-2 text-sm font-semibold text-fpt-blue hover:underline"
                  >
                    Bảng điểm
                  </Link>
```

- [ ] **Step 8: Viết lại trang sinh viên — bộ lọc trên URL + chọn nhiều dòng**

Spec §7 yêu cầu "trạng thái lọc đẩy lên URL search params", nên nguồn sự thật của bộ lọc chuyển từ `useState` sang `useSearchParams`. `useSearchParams` bắt buộc nằm trong `<Suspense>` khi Next 15 prerender, nên tách phần nội dung ra component con.

Thay toàn bộ `apps/web/src/app/(dashboard)/students/page.tsx`:

```tsx
'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { DataTable, Td } from '../../../components/ui/data-table';
import { FormError, FormSuccess, Input, Select } from '../../../components/ui/form';
import { PageHeader } from '../../../components/ui/page-header';
import { apiFetch } from '../../../lib/api';
import {
  formatDate,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_TONES,
} from '../../../lib/labels';
import type { Major, Paginated, Student } from '../../../lib/types';

const PAGE_SIZE = 20;

function StudentsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();

  // URL là nguồn sự thật của bộ lọc: gửi link cho đồng nghiệp là gửi đúng bộ lọc.
  const submittedSearch = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const missingMajor = params.get('missingMajor') === 'true';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const [search, setSearch] = useState(submittedSearch);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [majorId, setMajorId] = useState('');

  /** Ghi bộ lọc vào URL. Mọi thay đổi bộ lọc đều đưa về trang 1. */
  function setFilters(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries({ page: null, ...patch })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setSelected([]);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['students', { search: submittedSearch, status, missingMajor, page }],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (submittedSearch) query.set('search', submittedSearch);
      if (status) query.set('status', status);
      if (missingMajor) query.set('missingMajor', 'true');
      return apiFetch<Paginated<Student>>(`/students?${query.toString()}`);
    },
  });

  const majors = useQuery({
    queryKey: ['majors'],
    queryFn: () => apiFetch<Major[]>('/majors'),
    enabled: missingMajor,
  });

  const assignMajor = useMutation({
    mutationFn: () =>
      apiFetch<{ updated: number }>('/students/bulk-assign-major', {
        method: 'PATCH',
        body: JSON.stringify({ studentIds: [...selected], majorId }),
      }),
    onSuccess: () => {
      setSelected([]);
      setMajorId('');
      void queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });

  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allSelected = items.length > 0 && selected.length === items.length;

  function toggleOne(id: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    );
  }

  return (
    <>
      <PageHeader
        title="Sinh viên"
        description={
          missingMajor
            ? `${total} sinh viên chưa gán ngành — cần bổ sung để thống kê theo ngành chính xác.`
            : `${total} sinh viên trong phạm vi truy cập của bạn.`
        }
      />

      <form
        className="mb-4 flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ search: search.trim() || null });
        }}
      >
        <Input
          aria-label="Tìm theo MSSV hoặc họ tên"
          placeholder="Tìm theo MSSV hoặc họ tên…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        <Select
          aria-label="Lọc theo trạng thái"
          value={status}
          onChange={(event) => setFilters({ status: event.target.value || null })}
          className="max-w-44"
        >
          <option value="">Mọi trạng thái</option>
          {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            checked={missingMajor}
            onChange={(event) =>
              setFilters({ missingMajor: event.target.checked ? 'true' : null })
            }
            className="size-4 accent-fpt-orange"
          />
          Chưa gán ngành
        </label>
        <Button type="submit" variant="secondary">
          Tìm kiếm
        </Button>
      </form>

      {missingMajor ? (
        <section
          aria-label="Gán ngành hàng loạt"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-fpt-orange-50/40 px-4 py-3"
        >
          <p className="text-sm text-muted">
            Đã chọn <strong className="text-ink">{selected.length}</strong> sinh viên.
          </p>
          <Select
            aria-label="Ngành cần gán"
            value={majorId}
            onChange={(event) => setMajorId(event.target.value)}
            className="max-w-64"
          >
            <option value="">Chọn ngành…</option>
            {(majors.data ?? []).map((major) => (
              <option key={major.id} value={major.id}>
                {major.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            disabled={selected.length === 0 || !majorId || assignMajor.isPending}
            onClick={() => assignMajor.mutate()}
          >
            {assignMajor.isPending ? 'Đang gán…' : 'Gán ngành cho sinh viên đã chọn'}
          </Button>
          {assignMajor.isError ? (
            <FormError>{(assignMajor.error as Error).message}</FormError>
          ) : null}
          {assignMajor.isSuccess ? (
            <FormSuccess>
              Đã gán ngành cho {assignMajor.data.updated} sinh viên.
            </FormSuccess>
          ) : null}
        </section>
      ) : null}

      <DataTable
        headers={[
          ...(missingMajor ? ['Chọn'] : []),
          'MSSV',
          'Họ tên',
          'Lớp',
          'Ngành',
          'Bộ môn',
          'Ngày sinh',
          'Trạng thái',
          'Cảnh báo mở',
        ]}
        isEmpty={!isLoading && items.length === 0}
        emptyMessage="Không có sinh viên nào khớp bộ lọc."
      >
        {items.map((student) => (
          <tr key={student.id} className="transition-colors hover:bg-fpt-orange-50/40">
            {missingMajor ? (
              <Td>
                <input
                  type="checkbox"
                  aria-label={`Chọn sinh viên ${student.studentCode}`}
                  checked={selected.includes(student.id)}
                  onChange={(event) => toggleOne(student.id, event.target.checked)}
                  className="size-4 accent-fpt-orange"
                />
              </Td>
            ) : null}
            <Td>
              <Link
                href={`/students/${student.id}`}
                className="font-semibold text-fpt-blue hover:underline"
              >
                {student.studentCode}
              </Link>
            </Td>
            <Td className="font-medium text-ink">{student.fullName}</Td>
            <Td>{student.classCode}</Td>
            <Td>{student.major?.name ?? '—'}</Td>
            <Td>{student.department?.code ?? '—'}</Td>
            <Td>{formatDate(student.dateOfBirth)}</Td>
            <Td>
              <Badge tone={STUDENT_STATUS_TONES[student.status]}>
                {STUDENT_STATUS_LABELS[student.status]}
              </Badge>
            </Td>
            <Td>
              {(student._count?.alerts ?? 0) > 0 ? (
                <Badge tone="danger">{student._count?.alerts}</Badge>
              ) : (
                <span className="text-muted">0</span>
              )}
            </Td>
          </tr>
        ))}
      </DataTable>

      {missingMajor && items.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          className="mt-2"
          onClick={() => setSelected(allSelected ? [] : items.map((item) => item.id))}
        >
          {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả trên trang này'}
        </Button>
      ) : null}

      <nav aria-label="Phân trang" className="mt-4 flex items-center justify-between text-sm">
        <p className="text-muted">
          Trang {page}/{totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            type="button"
            disabled={page <= 1}
            onClick={() => setFilters({ page: String(page - 1) })}
          >
            ← Trước
          </Button>
          <Button
            variant="ghost"
            type="button"
            disabled={page >= totalPages}
            onClick={() => setFilters({ page: String(page + 1) })}
          >
            Sau →
          </Button>
        </div>
      </nav>
    </>
  );
}

export default function StudentsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Đang tải danh sách sinh viên…</p>}>
      <StudentsPageContent />
    </Suspense>
  );
}
```

`FormError` (`role="alert"`, nền `bg-danger/10`) và `FormSuccess` (`role="status"`, nền `bg-success/10`) đã có sẵn trong `components/ui/form.tsx` — dùng lại, đừng dựng component báo lỗi/báo thành công mới. Màu lấy từ token `--color-danger` / `--color-success`, không hardcode.

- [ ] **Step 9: Kiểm tay trang sinh viên**

```bash
pnpm --filter @fcare/web dev
```

- Mở `/students`, tick "Chưa gán ngành" → URL phải thành `/students?missingMajor=true`, cột "Chọn" xuất hiện.
- Tải lại trang bằng chính URL đó → bộ lọc vẫn giữ nguyên (đây là điều `useState` không làm được).
- Chọn 2 sinh viên, chọn một ngành, bấm "Gán ngành…" → danh sách tự làm mới và hai sinh viên đó biến mất khỏi bộ lọc.
- Bỏ tick → URL sạch tham số, cột "Chọn" biến mất.

- [ ] **Step 10: Thêm cột "Loại GV" vào trang người dùng**

Trong `apps/web/src/app/(dashboard)/admin/users/page.tsx`:
- Đổi `headers` (dòng ~115) thành `['Mã NV', 'Họ tên', 'Bộ môn', 'Loại GV', 'Vai trò', 'Trạng thái', 'Thao tác']`.
- Thêm ô ngay sau ô Bộ môn:

```tsx
            <Td>
              {member.lecturerType === 'FULL'
                ? 'Cơ hữu'
                : member.lecturerType === 'PART'
                  ? 'Thỉnh giảng'
                  : '—'}
            </Td>
```

- [ ] **Step 11: Kiểm tra thủ công**

Với `pnpm dev` đang chạy và đã đăng nhập ADMIN:
1. `/master-data/department-aliases` — 19 bản ghi; thêm `THUC-TAP-TN` → bộ môn CNTT thành công; thêm lại lần nữa → báo lỗi trùng bằng tiếng Việt.
2. `/master-data/class-major-rules` — nhập tiền tố `lo` chữ thường → lưu thành `LO`.
3. `/master-data/class-sections` → bấm "Bảng điểm" một lớp có sinh viên → sửa điểm, bấm Lưu → tải lại trang thấy điểm mới.
4. `/students` tích "Chưa gán ngành" → danh sách ngắn lại, mô tả đầu trang đổi theo.
5. `/admin/users` → cột "Loại GV" hiện "Cơ hữu"/"Thỉnh giảng" cho giảng viên import từ `T.Kê`.

- [ ] **Step 12: Kiểm tra bàn phím và responsive**

Trên `/master-data/department-aliases`: Tab đi hết nav → nút Thêm → các nút Sửa/Xóa; Enter mở modal; Escape đóng modal; vòng focus nhìn thấy rõ trên mọi control. Ở bề rộng 320px, bảng cuộn ngang trong khung riêng còn trang không cuộn ngang.

- [ ] **Step 13: Kiểm typecheck, lint, build**

```bash
pnpm --filter @fcare/web typecheck && pnpm --filter @fcare/web lint && pnpm --filter @fcare/web build
```

Expected: xanh; các route mới < 300 kB First Load JS.

- [ ] **Step 14: Commit**

```bash
git add apps/web/src
git commit -m "feat: man hinh anh xa import, sua diem theo lop va loc du lieu thieu"
```

---

## P4 — Kiểm thử đầu-cuối

### Task 14: Playwright và luồng E2E của quản trị viên

`apps/web` chưa có hạ tầng test nào — task này dựng Playwright từ đầu rồi phủ đúng luồng chính: đăng nhập → import → dọn dữ liệu → sửa điểm, cộng một lưới an toàn cho RULE 1.

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/fixtures/auth.ts`
- Create: `apps/web/e2e/admin-import-flow.spec.ts`
- Create: `apps/web/e2e/pii-rejection.spec.ts`
- Modify: `apps/web/package.json`
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- Consumes: toàn bộ UI của Task 12–13; tài khoản demo ghi trong `README.md`
- Produces: script `pnpm --filter @fcare/web test:e2e`; fixture `loginAsAdmin(page: Page): Promise<void>`

- [ ] **Step 1: Cài Playwright**

```bash
pnpm --filter @fcare/web add -D @playwright/test
pnpm --filter @fcare/web exec playwright install chromium firefox webkit
```

- [ ] **Step 2: Viết `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // Các test dùng chung một DB — chạy tuần tự để không giẫm chân nhau.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'vi-VN',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
```

- [ ] **Step 3: Viết fixture đăng nhập**

Tạo `apps/web/e2e/fixtures/auth.ts`:

```ts
import { expect, type Page } from '@playwright/test';

const ADMIN_CODE = process.env.E2E_ADMIN_CODE ?? 'ADMIN001';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@123';

/**
 * Đăng nhập ADMIN và vượt consent gate. Mỗi phiên đều phải ký cam kết
 * (ConsentGuard), nên đây là bước bắt buộc trước bất kỳ màn hình nào.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/mã nhân viên/i).fill(ADMIN_CODE);
  await page.getByLabel(/mật khẩu/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /đăng nhập/i }).click();

  await page.waitForURL(/\/(consent|dashboard)/);
  if (page.url().includes('/consent')) {
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /xác nhận|đồng ý/i }).click();
    await page.waitForURL(/\/dashboard/);
  }
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}
```

Trước khi chạy, mở `/login` và `/consent` xác nhận nhãn thật khớp các selector trên. Nếu khác, sửa fixture theo markup thật — không sửa markup cho vừa test.

- [ ] **Step 4: Viết test luồng chính**

Tạo `apps/web/e2e/admin-import-flow.spec.ts`:

```ts
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

const ASSIGNMENT_FILE = path.resolve(
  __dirname,
  '../../../docs/FPLTN-KH Phân công GV HK Summer 2026.xlsx',
);
const GRADEBOOK_FILE = path.resolve(
  __dirname,
  '../../../docs/gradebook_20260504174543_hoactm_64_119_all_ (1).xlsx',
);

test.describe('Quản trị viên import và dọn dữ liệu', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('import danh mục môn học có bước xem trước rồi mới ghi', async ({ page }) => {
    await page.goto('/import-export');
    await page.getByRole('radio', { name: /danh mục môn học/i }).check();
    await page.getByLabel(/học kỳ/i).fill('SU26');
    await page.getByLabel(/chọn file/i).setInputFiles(ASSIGNMENT_FILE);
    await page.getByRole('button', { name: /đọc file và xem trước/i }).click();

    await expect(page.getByRole('heading', { name: /xem trước/i })).toBeVisible();
    await page.getByRole('button', { name: /xác nhận ghi/i }).click();
    await expect(page.getByText(/đã ghi:/i)).toBeVisible();
  });

  test('xem trước nêu rõ nhãn bộ môn chưa ánh xạ rồi huỷ được lô', async ({ page }) => {
    await page.goto('/import-export');
    await page.getByRole('radio', { name: /danh mục môn học/i }).check();
    await page.getByLabel(/học kỳ/i).fill('SU26');
    await page.getByLabel(/chọn file/i).setInputFiles(ASSIGNMENT_FILE);
    await page.getByRole('button', { name: /đọc file và xem trước/i }).click();

    await expect(page.getByText(/chưa có ánh xạ/i)).toBeVisible();
    await page.getByRole('button', { name: /huỷ lô này/i }).click();
    await expect(page.getByRole('heading', { name: /xem trước/i })).toBeHidden();
  });

  test('import lịch nêu rõ số lớp chưa phân công giảng viên', async ({ page }) => {
    await page.goto('/import-export');
    await page.getByRole('radio', { name: /lịch và phân công lớp/i }).check();
    await page.getByLabel(/học kỳ/i).fill('SU26');
    await page.getByLabel(/chọn file/i).setInputFiles(ASSIGNMENT_FILE);
    await page.getByRole('button', { name: /đọc file và xem trước/i }).click();

    await expect(page.getByText(/chưa phân công giảng viên/i)).toBeVisible();
    await page.getByRole('button', { name: /xác nhận ghi/i }).click();
    await expect(page.getByText(/đã ghi:/i)).toBeVisible();
  });

  test('import bảng điểm rồi sửa được điểm một sinh viên', async ({ page }) => {
    await page.goto('/import-export');
    await page.getByRole('radio', { name: /^bảng điểm$/i }).check();
    await page.getByLabel(/học kỳ/i).fill('SU26');
    await page.getByLabel(/chọn file/i).setInputFiles(GRADEBOOK_FILE);
    await page.getByRole('button', { name: /đọc file và xem trước/i }).click();
    await page.getByRole('button', { name: /xác nhận ghi/i }).click();
    await expect(page.getByText(/đã ghi:/i)).toBeVisible();

    await page.goto('/master-data/class-sections');
    await page.getByRole('link', { name: /bảng điểm/i }).first().click();
    await page.getByLabel(/điểm tổng kết của/i).first().fill('9.1');
    await page.getByRole('button', { name: /lưu bảng điểm/i }).click();
    await expect(page.getByText(/đã lưu \d+ dòng điểm/i)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/điểm tổng kết của/i).first()).toHaveValue('9.1');
  });

  test('thêm ánh xạ bộ môn rồi thấy nó trong danh sách', async ({ page }) => {
    await page.goto('/master-data/department-aliases');
    await page.getByRole('button', { name: /thêm ánh xạ bộ môn/i }).click();
    await page.getByLabel(/nhãn trong file excel/i).fill('THUC-TAP-TN');
    await page.getByLabel(/bộ môn đích/i).selectOption({ index: 1 });
    await page.getByRole('button', { name: /^lưu$/i }).click();
    await expect(page.getByRole('cell', { name: 'THUC-TAP-TN' })).toBeVisible();
  });

  test('gán giảng viên cho một lớp chưa phân công', async ({ page }) => {
    await page.goto('/master-data/class-sections');
    // Import lịch để lại ~76 lớp trống GV; ô "Giảng viên" của chúng hiển thị "—".
    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: '—', exact: true }) })
      .first();
    await expect(row).toBeVisible();
    const sectionCode = (await row.getByRole('cell').first().innerText()).trim();

    await row.getByRole('button', { name: /^sửa$/i }).click();
    const lecturerSelect = page.getByLabel(/^giảng viên$/i);
    await lecturerSelect.selectOption({ index: 1 });
    const lecturerName = (
      await lecturerSelect.locator('option:checked').innerText()
    ).trim();
    // Form sửa dùng nhãn "Cập nhật"; chỉ form thêm mới mới là "Lưu".
    await page.getByRole('button', { name: /^cập nhật$/i }).click();

    await expect(
      page.getByRole('row').filter({ hasText: sectionCode }),
    ).toContainText(lecturerName);
  });

  test('lọc sinh viên chưa gán ngành rồi gán ngành hàng loạt', async ({ page }) => {
    await page.goto('/students');
    await page.getByLabel(/chưa gán ngành/i).check();
    await expect(page.getByText(/sinh viên chưa gán ngành/i)).toBeVisible();
    // Bộ lọc nằm trên URL nên tải lại trang vẫn giữ nguyên (spec §7).
    await expect(page).toHaveURL(/missingMajor=true/);

    const before = await page.getByLabel(/^chọn sinh viên /i).count();
    test.skip(before === 0, 'Dữ liệu import không còn sinh viên thiếu ngành.');

    await page.getByLabel(/^chọn sinh viên /i).first().check();
    await page.getByLabel(/ngành cần gán/i).selectOption({ index: 1 });
    await page.getByRole('button', { name: /gán ngành cho sinh viên đã chọn/i }).click();
    await expect(page.getByText(/đã gán ngành cho \d+ sinh viên/i)).toBeVisible();
    await expect(page.getByLabel(/^chọn sinh viên /i)).toHaveCount(before - 1);
  });

  test('lịch sử import ghi lại mọi lượt', async ({ page }) => {
    await page.goto('/import-export');
    await expect(page.getByRole('heading', { name: /lịch sử import/i })).toBeVisible();
    await expect(page.getByRole('cell', { name: /đã ghi/i }).first()).toBeVisible();
  });
});
```

- [ ] **Step 5: Viết test từ chối PII**

Tạo `apps/web/e2e/pii-rejection.spec.ts`:

```ts
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

/**
 * File nguồn thật có cột email ở sheet "T.Kê". RULE 1 bắt từ chối TOÀN BỘ file.
 * Đây là lưới an toàn cho ràng buộc bảo mật, không phải test giao diện.
 */
const FILE_WITH_EMAIL = path.resolve(
  __dirname,
  '../../../docs/FPLTN-KH Phân công GV HK Summer 2026.xlsx',
);

test('file chứa email bị từ chối toàn bộ, không ghi dòng nào', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/import-export');
  await page.getByRole('radio', { name: /danh sách giảng viên/i }).check();
  await page.getByLabel(/học kỳ/i).fill('SU26');
  await page.getByLabel(/chọn file/i).setInputFiles(FILE_WITH_EMAIL);
  await page.getByRole('button', { name: /đọc file và xem trước/i }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText(/từ chối/i);
  await expect(alert).toContainText(/email/i);
  // Thông báo nêu vị trí nhưng KHÔNG in ra giá trị PII.
  await expect(alert).not.toContainText('@');
  await expect(page.getByRole('heading', { name: /xem trước/i })).toBeHidden();
});
```

`FormError` trong `apps/web/src/components/ui/form.tsx` đã render `role="alert"` sẵn, nên selector này chạy được ngay — chỉ cần bảo đảm bước 3 của wizard hiển thị lỗi upload qua `FormError` chứ không phải một thẻ `<p>` tự chế.

- [ ] **Step 6: Thêm script npm**

Trong `apps/web/package.json`, thêm vào `scripts`:

```json
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 7: Bỏ qua artifact trong git**

Thêm vào `.gitignore`:

```
# Playwright
apps/web/test-results/
apps/web/playwright-report/
apps/web/blob-report/
apps/web/.playwright/
```

- [ ] **Step 8: Chạy E2E trên Chromium**

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
pnpm --filter @fcare/api db:migrate:dev && pnpm --filter @fcare/api db:seed
pnpm --filter @fcare/web test:e2e -- --project=chromium
```

Expected: 10 test PASS. Test sửa điểm, gán GV và gán ngành hàng loạt đều phụ thuộc các test import chạy trước — `fullyParallel: false` + `workers: 1` bảo đảm thứ tự trong file.

- [ ] **Step 9: Chạy chéo trình duyệt**

```bash
pnpm --filter @fcare/web test:e2e
```

Expected: 30 test PASS (10 × 3 trình duyệt). Nếu WebKit trượt ở bước tải file, kiểm lại `setInputFiles` dùng đường dẫn tuyệt đối — đừng nới lỏng `expect` để test xanh.

- [ ] **Step 10: Ghi tài liệu**

Thêm vào `README.md`, ngay dưới phần lệnh test:

````markdown
### Kiểm thử E2E

```bash
pnpm --filter @fcare/web test:e2e                        # cả 3 trình duyệt
pnpm --filter @fcare/web test:e2e -- --project=chromium  # nhanh, một trình duyệt
pnpm --filter @fcare/web test:e2e:ui                     # chế độ gỡ lỗi có giao diện
```

E2E cần Postgres + Redis đang chạy và DB đã seed. Đặt `E2E_BASE_URL` để chạy với
server có sẵn thay vì để Playwright tự khởi động `pnpm dev`. Tài khoản dùng trong
test lấy từ `E2E_ADMIN_CODE` / `E2E_ADMIN_PASSWORD`, mặc định là tài khoản demo ADMIN.

### Thứ tự import bắt buộc

1. Danh mục môn học → 2. Danh sách giảng viên → 3. Lịch và phân công lớp → 4. Bảng điểm.

Chạy sai thứ tự sẽ khiến nhiều dòng bị bỏ qua vì môn học hoặc giảng viên chưa tồn tại.
````

- [ ] **Step 11: Kiểm tra toàn repo lần cuối**

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```

Expected: xanh toàn bộ. Đây là điều kiện bắt buộc trước khi báo hoàn thành (CLAUDE.md).

- [ ] **Step 12: Commit**

```bash
git add apps/web .gitignore README.md
git commit -m "test: dung Playwright va phu luong import cua quan tri vien"
```

---

## Kiểm tra cuối cùng trước khi báo hoàn thành

- [ ] `pnpm typecheck && pnpm lint && pnpm build && pnpm test` xanh toàn repo.
- [ ] Coverage thư mục `apps/api/src/modules/imports` đạt ≥ 80%:
  ```bash
  pnpm --filter @fcare/api test -- --coverage --collectCoverageFrom='src/modules/imports/**/*.ts'
  ```
- [ ] Truy vấn kiểm PII trả về 0 dòng:
  ```sql
  SELECT COUNT(*) FROM students WHERE "fullName" ~ '@' OR "studentCode" ~ '[0-9]{12}';
  SELECT COUNT(*) FROM staff WHERE "fullName" ~ '@' OR "username" ~ '@';
  ```
- [ ] Không có cột PII nào trong schema:
  ```bash
  grep -inE '(email|phone|address|cccd|cmnd)' apps/api/prisma/schema.prisma
  ```
  Expected: chỉ khớp dòng bình luận nêu điều cấm, không khớp định nghĩa cột nào.
- [ ] Mọi endpoint mới đều có `@CheckPolicies`; đăng nhập bằng tài khoản demo LECTURER và gọi `/imports` → 403.
- [ ] `PiiGuardInterceptor` phủ mọi endpoint mới: nó đăng ký bằng `APP_INTERCEPTOR` trong `apps/api/src/app.module.ts:86` nên phủ toàn cục — xác nhận không có controller mới nào tự ghi đè interceptor:
  ```bash
  grep -rn '@UseInterceptors' apps/api/src/modules/imports apps/api/src/modules/master-data apps/api/src/modules/students
  ```
  Expected: không in ra gì (hoặc chỉ interceptor không liên quan tới response body).
- [ ] Bundle `/import-export`, `/master-data/[tab]`, `/class-sections/[id]/grades`, `/students` đều < 300 kB First Load JS.
- [ ] **Không push lên remote và không tạo PR khi user chưa yêu cầu.**
