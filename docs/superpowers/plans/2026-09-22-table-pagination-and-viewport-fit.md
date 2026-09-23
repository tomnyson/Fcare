# Bổ Sung Phân Trang Chuẩn Thiết Kế & Khớp Kích Thước Màn Hình Cho Mọi Bảng Dữ Liệu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp component `Pagination` theo đúng thiết kế (bên trái hiện "Đang hiển thị 1 đến 10 của 249 mục", bên phải là cụm nút phân trang nối liền `[Trước] [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ] [ ... ] [ 25 ] [ Sau ]` với số trang đang chọn màu xanh), đồng thời chuẩn hoá kích thước mọi bảng dữ liệu trong hệ thống vừa vặn với kích thước màn hình (viewport-fit, sticky header, không bị trôi thanh phân trang) và bổ sung phân trang cho tất cả các bảng dữ liệu còn thiếu.

**Architecture:**
- **Pagination Core (`apps/web/src/lib/pagination.ts`)**: Bổ sung hàm tính toán cửa sổ số trang `paginationWindow(currentPage, totalPages, maxVisible)` hỗ trợ rút gọn bằng dấu chấm lửng `...` theo chuẩn UX (ví dụ: `1 2 3 4 5 ... 25`), và hàm sinh nhãn đếm `pageDisplayLabel(page, limit, total)` ("Đang hiển thị X đến Y của Z mục").
- **UI Component (`apps/web/src/components/ui/pagination.tsx`)**: Thiết kế lại thanh phân trang thành cụm button nối liền (segmented button group) với border xám, nút trang đang chọn phủ màu xanh FPT/Primary (`bg-fpt-blue-900 text-white`), nút trước/sau có bo góc hai đầu, và nhãn hiển thị bên trái.
- **Viewport Fitting & DataTable (`apps/web/src/styles/tokens.css`, `apps/web/src/components/ui/data-table.tsx`)**: Hiệu chỉnh `--table-fit-height: max(20rem, calc(100dvh - 16.5rem))` để tính toán trừ đúng chiều cao của Topbar + Page Header + Filter bar + Pagination bar, đảm bảo toàn bộ bảng và thanh phân trang nằm trọn vẹn trong một khung nhìn màn hình máy tính mà không làm vỡ layout hay phát sinh thanh cuộn kép. Tích hợp thanh phân trang gắn liền chân bảng (docked footer).
- **Phân trang toàn diện**: Áp dụng phân trang (10 mục/trang theo thiết kế mẫu) cho mọi bảng: Sinh viên, Cảnh báo, Lớp học phần, Danh mục Master Data (Môn, Ngành, Phòng, Bộ môn, Học kỳ), Ánh xạ, Bảng điểm, Quản lý người dùng/nhân viên (`admin/users`), và Lịch sử sao lưu (`admin/backups`).

**Tech Stack:** Next.js (App Router), React 19, TypeScript, TailwindCSS, Vitest, Testing Library.

## Global Constraints
- Không làm vỡ các tính năng lọc (FilterBar) và chọn hàng loạt (Bulk selection) hiện có.
- Tuân thủ nguyên tắc accessibility (ARIA labels, `aria-current="page"`, `aria-disabled`).
- Đảm bảo 100% test coverage cho logic tính toán phân trang mới.

---

### Task 1: Bổ sung logic tính toán số trang và nhãn phân trang (`apps/web/src/lib/pagination.ts`)

**Files:**
- Modify: `apps/web/src/lib/pagination.ts`
- Modify: `apps/web/src/lib/pagination.test.ts`

**Interfaces:**
- Produces:
  - `paginationWindow(currentPage: number, totalPages: number): (number | 'ellipsis')[]`
  - `pageDisplayLabel(page: number, limit: number, total: number): string`

- [ ] **Step 1: Viết failing test trong `pagination.test.ts`**

Thêm các test case kiểm tra `paginationWindow` và `pageDisplayLabel`:
```typescript
describe('pageDisplayLabel', () => {
  it('định dạng đúng mẫu: Đang hiển thị X đến Y của Z mục', () => {
    expect(pageDisplayLabel(1, 10, 249)).toBe('Đang hiển thị 1 đến 10 của 249 mục');
    expect(pageDisplayLabel(2, 10, 249)).toBe('Đang hiển thị 11 đến 20 của 249 mục');
    expect(pageDisplayLabel(25, 10, 249)).toBe('Đang hiển thị 241 đến 249 của 249 mục');
  });

  it('xử lý danh sách rỗng', () => {
    expect(pageDisplayLabel(1, 10, 0)).toBe('Không có mục nào');
  });
});

describe('paginationWindow', () => {
  it('tổng số trang <= 7 → hiện đầy đủ các trang', () => {
    expect(paginationWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('đang ở đầu danh sách (page <= 4, total = 25) → hiện 1 2 3 4 5 ... 25 đúng ảnh mẫu', () => {
    expect(paginationWindow(1, 25)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 25]);
    expect(paginationWindow(4, 25)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 25]);
  });

  it('đang ở cuối danh sách (page >= total - 3) → hiện 1 ... 21 22 23 24 25', () => {
    expect(paginationWindow(23, 25)).toEqual([1, 'ellipsis', 21, 22, 23, 24, 25]);
    expect(paginationWindow(25, 25)).toEqual([1, 'ellipsis', 21, 22, 23, 24, 25]);
  });

  it('đang ở giữa danh sách → hiện 1 ... 9 10 11 ... 25', () => {
    expect(paginationWindow(10, 25)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 25]);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `pnpm --filter @fcare/web test src/lib/pagination.test.ts`
Expected: FAIL với lỗi "paginationWindow is not a function"

- [ ] **Step 3: Cài đặt hàm trong `pagination.ts`**

```typescript
export type PaginationItem = number | 'ellipsis';

/**
 * Tính danh sách các nút số trang hiển thị với dấu chấm lửng 'ellipsis'.
 * Khi ở các trang đầu: 1 2 3 4 5 ... 25 (khớp chính xác ảnh thiết kế).
 */
export function paginationWindow(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 1) return [1];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // Ở đầu: 1, 2, 3, 4, 5, ..., totalPages
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }

  // Ở cuối: 1, ..., totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages
  if (currentPage >= totalPages - 3) {
    return [
      1,
      'ellipsis',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  // Ở giữa: 1, ..., currentPage - 1, currentPage, currentPage + 1, ..., totalPages
  return [
    1,
    'ellipsis',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'ellipsis',
    totalPages,
  ];
}

/** Chuỗi hiển thị: "Đang hiển thị 1 đến 10 của 249 mục", rỗng thì "Không có mục nào". */
export function pageDisplayLabel(page: number, limit: number, total: number): string {
  if (total <= 0) return 'Không có mục nào';
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return `Đang hiển thị ${start} đến ${end} của ${total} mục`;
}
```

- [ ] **Step 4: Chạy lại test để xác nhận PASS**

Run: `pnpm --filter @fcare/web test src/lib/pagination.test.ts`
Expected: PASS toàn bộ test suite.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pagination.ts apps/web/src/lib/pagination.test.ts
git commit -m "feat(web): add pagination windowing and display label helpers"
```

---

### Task 2: Cập nhật giao diện component `Pagination` theo thiết kế mẫu (`apps/web/src/components/ui/pagination.tsx`)

**Files:**
- Modify: `apps/web/src/components/ui/pagination.tsx`
- Create: `apps/web/src/components/ui/pagination.test.tsx`

**Interfaces:**
- Props:
  - `page: number`
  - `totalPages: number`
  - `onPageChange: (page: number) => void`
  - `isLoading?: boolean`
  - `total?: number`
  - `limit?: number`
  - `label?: string`
  - `className?: string`
  - `docked?: boolean` (nếu gắn trực tiếp dưới chân card bảng)

- [ ] **Step 1: Viết test cho `Pagination` trong `pagination.test.tsx`**

Test component hiển thị đúng text "Đang hiển thị 1 đến 10 của 249 mục", các nút số trang 1, 2, 3, 4, 5, ..., 25, và kích hoạt `onPageChange` khi bấm.

- [ ] **Step 2: Cài đặt giao diện mới cho `Pagination`**

```tsx
'use client';

import { pageDisplayLabel, paginationWindow } from '../../lib/pagination';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  total?: number;
  limit?: number;
  label?: string;
  className?: string;
  docked?: boolean;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  isLoading = false,
  total,
  limit = 10,
  label = 'Phân trang',
  className = '',
  docked = false,
}: PaginationProps) {
  if (totalPages <= 1 && (!total || total <= 0)) return null;

  const hasRange = typeof total === 'number' && typeof limit === 'number';
  const labelText = hasRange ? pageDisplayLabel(page, limit, total) : `Trang ${page}/${totalPages}`;
  const pages = paginationWindow(page, Math.max(1, totalPages));

  return (
    <nav
      aria-label={label}
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 text-sm ${
        docked
          ? 'border-t border-border bg-white px-5 py-3.5 rounded-b-[var(--radius-card)]'
          : 'mt-4 px-1 py-1'
      } ${className}`}
    >
      <div className="text-muted tabular-nums text-xs sm:text-sm font-medium" aria-live="polite">
        {isLoading ? 'Đang tải dữ liệu…' : labelText}
      </div>

      <div className="inline-flex items-center -space-x-px rounded-md shadow-xs isolate text-sm" role="group">
        {/* Nút Trước */}
        <button
          type="button"
          disabled={isLoading || page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="relative inline-flex items-center px-3 py-1.5 rounded-l-md border border-gray-300 bg-white text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-fpt-blue disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
        >
          Trước
        </button>

        {/* Danh sách nút số trang & ellipsis */}
        {pages.map((p, idx) =>
          p === 'ellipsis' ? (
            <span
              key={`ellipsis-${idx}`}
              className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 bg-white text-xs sm:text-sm text-gray-400 select-none"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              disabled={isLoading}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`relative inline-flex items-center px-3.5 py-1.5 border text-xs sm:text-sm font-medium transition-colors focus:z-10 focus:outline-none focus:ring-1 focus:ring-fpt-blue ${
                p === page
                  ? 'z-10 bg-fpt-blue-900 border-fpt-blue-900 text-white font-semibold'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-fpt-blue'
              }`}
            >
              {p}
            </button>
          )
        )}

        {/* Nút Sau */}
        <button
          type="button"
          disabled={isLoading || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="relative inline-flex items-center px-3 py-1.5 rounded-r-md border border-gray-300 bg-white text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-fpt-blue disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
        >
          Sau
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Chạy test kiểm thử component**

Run: `pnpm --filter @fcare/web test src/components/ui/pagination.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/pagination.tsx apps/web/src/components/ui/pagination.test.tsx
git commit -m "feat(web): redesign pagination component with segmented numbered buttons"
```

---

### Task 3: Tối ưu độ dài bảng khớp kích thước màn hình (`tokens.css`, `data-table.tsx`)

**Files:**
- Modify: `apps/web/src/styles/tokens.css:35-37`
- Modify: `apps/web/src/components/ui/data-table.tsx`

- [ ] **Step 1: Cập nhật CSS Token chiều cao viewport**

Trong `tokens.css`:
```css
  /* Chiều cao tối đa của bảng fitViewport: tính toán trừ Topbar (~4rem), Header (~4rem), FilterBar (~4.5rem), Pagination (~3.5rem) */
  --table-fit-height: max(20rem, calc(100dvh - 16.5rem));
```

- [ ] **Step 2: Nâng cấp `DataTable` hỗ trợ prop `footer` / `pagination` docked**

Trong `data-table.tsx`:
- Nhận thêm prop `footer?: ReactNode` hoặc `pagination?: ReactNode`.
- Bọc toàn bộ bảng và thanh phân trang trong cùng một khối thẻ card thống nhất (`border border-border rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] overflow-hidden`).
- Phần thân bảng cuộn độc lập với `max-h-[var(--table-fit-height)]` và `sticky top-0 z-10` cho thẻ `thead`.
- Thanh phân trang gắn liền ở đáy card bảng (docked footer), luôn luôn nằm trong tầm mắt người dùng mà không bị trôi xuống dưới nếp gấp màn hình.

- [ ] **Step 3: Kiểm thử hiển thị không làm vỡ các bảng hiện tại**

Run: `pnpm --filter @fcare/web test`
Expected: 356/356 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/styles/tokens.css apps/web/src/components/ui/data-table.tsx
git commit -m "feat(web): update table fit-viewport height calculation and docked footer support"
```

---

### Task 4: Bổ sung phân trang và fit viewport cho trang Quản lý Nhân viên (`apps/web/src/app/(dashboard)/admin/users/page.tsx`)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/admin/users/page.tsx`

- [ ] **Step 1: Thêm hook `usePagedList` vào trang Admin Users**

- Import `usePagedList` và `Pagination` từ `@fcare/web/components/ui/pagination`.
- Cấu hình cắt trang `pageSize: 10` cho danh sách `rows`:
  ```tsx
  const paged = usePagedList(rows, { pageSize: 10, resetKey: [filterDept, filterRole, search] });
  ```
- Chuyển `DataTable` render qua `paged.pageItems`.
- Cung cấp prop `pagination` cho `DataTable` hoặc gắn `<Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} limit={10} onPageChange={paged.setPage} />`.

- [ ] **Step 2: Cập nhật cơ chế chọn tất cả (Bulk select)**

- Đảm bảo tùy chọn "Chọn tất cả 10 người trên trang này" hoặc "Chọn tất cả {paged.total} người".

- [ ] **Step 3: Chạy test xác nhận không lỗi type/logic**

Run: `pnpm --filter @fcare/web test src/app/login/login-view.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(dashboard)/admin/users/page.tsx
git commit -m "feat(web): add pagination and viewport fit to admin users table"
```

---

### Task 5: Bổ sung phân trang cho Master Data, Điểm, và Sao lưu dữ liệu

**Files:**
- Modify: `apps/web/src/components/master-data/master-data-view.tsx`
- Modify: `apps/web/src/components/master-data/mapping-view.tsx`
- Modify: `apps/web/src/components/master-data/section-grades-view.tsx`
- Modify: `apps/web/src/app/(dashboard)/admin/backups/components/backup-table.tsx`
- Modify: `apps/web/src/components/statistics/departments-table.tsx`
- Modify: `apps/web/src/components/statistics/lecturers-table.tsx`
- Modify: `apps/web/src/components/statistics/classes-table.tsx`
- Modify: `apps/web/src/components/statistics/subjects-table.tsx`

- [ ] **Step 1: Áp dụng phân trang cho tab Bộ môn (Departments) & Học kỳ (Terms) trong `master-data-view.tsx`**
  - Dùng `usePagedList` cắt trang 10 mục/trang và render `Pagination`.

- [ ] **Step 2: Áp dụng phân trang cho `mapping-view.tsx` và `section-grades-view.tsx`**
  - Cắt trang 10 mục/trang cho danh sách ánh xạ và danh sách điểm sinh viên trong lớp học phần.

- [ ] **Step 3: Áp dụng phân trang cho `backup-table.tsx`**
  - Thêm `usePagedList` và `Pagination` cho bảng sao lưu.

- [ ] **Step 4: Áp dụng phân trang cho các bảng thống kê**
  - Thêm `usePagedList` cho `departments-table.tsx`, `lecturers-table.tsx`, `classes-table.tsx`, `subjects-table.tsx`.

- [ ] **Step 5: Kiểm tra toàn bộ test suites**

Run: `pnpm --filter @fcare/web test`
Expected: 100% tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/master-data apps/web/src/app/(dashboard)/admin/backups apps/web/src/components/statistics
git commit -m "feat(web): apply pagination and viewport fit to master-data, grades, backups and statistics tables"
```

---

### Task 6: Kiểm thử E2E giao diện trên trình duyệt

**Files:**
- Test: Trình duyệt nội bộ kiểm tra hiển thị thực tế các bảng dữ liệu

- [ ] **Step 1: Mở trình duyệt kiểm tra trang Sinh viên (`/students`)**
  - Xác nhận bên trái hiện: "Đang hiển thị 1 đến 10 của ... mục".
  - Xác nhận bên phải là cụm nút số trang nối liền với trang 1 màu xanh FPT.
  - Xác nhận chiều cao của bảng vừa khít màn hình, thanh phân trang ghim ở chân bảng.

- [ ] **Step 2: Kiểm tra trang Quản lý Nhân viên (`/admin/users`) và Cảnh báo (`/alerts`)**
  - Xác nhận phân trang 10 mục/trang hoạt động trơn tru khi bấm đổi trang 1, 2, 3, Sau, Trước.

- [ ] **Step 3: Hoàn tất kiểm tra và báo cáo walkthrough**
