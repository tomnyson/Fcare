# Teacher Classes Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm mục "Lớp học" (tab Lớp) vào thanh điều hướng chính của Dashboard và xây dựng màn hình hiển thị danh sách các lớp học phần giảng viên đang giảng dạy trong học kỳ đang active (mặc định), hỗ trợ tìm kiếm, lọc theo kỳ/block, thống kê sinh viên/cảnh báo, và điều hướng nhanh tới Bảng điểm (`/class-sections/:id/grades`) cùng danh sách sinh viên (`/students?sectionId=...`).

**Architecture:**
- **Backend**: Nâng cấp `ClassSectionsService.findAll` và `ClassSectionsController.findAll` để nhận `@CurrentUser() user: AuthUser`. Áp dụng `sectionScope(user)` tuân thủ nghiêm ngặt **RULE 2** (giảng viên chỉ xem lớp mình dạy; trưởng bộ môn xem lớp mình dạy + lớp thuộc môn của bộ môn; cán bộ toàn trường xem tất cả). Bổ sung thống kê `openAlertCount` (số sinh viên có cảnh báo đang mở trong lớp) bằng một truy vấn gom hiệu năng cao không gây N+1.
- **Frontend Navigation**: Bổ sung leaf `{ kind: 'leaf', href: '/class-sections', label: 'Lớp học', icon: IconSections }` vào nhóm `main` trong `nav-tree.ts` để hiển thị trên sidebar cho giảng viên và người dùng.
- **Frontend Page**: Tạo trang `/class-sections` (`page.tsx` + component `ClassesView`): tự động chọn học kỳ active hiện tại (`useCurrentTerm()`), hiển thị thống kê tổng quan (tổng số lớp, tổng SV, SV có cảnh báo), danh sách lớp học dạng thẻ thông tin trực quan (mã lớp, môn học, số tín chỉ, phòng, ca học, thứ, sĩ số, cảnh báo) kèm các nút thao tác nhanh (Bảng điểm, Danh sách SV).

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query, TailwindCSS, `@fcare/ui-kit`, NestJS 11, Prisma 6, PostgreSQL.

## Global Constraints
- **RULE BẢO MẬT 1 (Tuyệt đối không vi phạm)**: CẤM hiển thị/truy vấn CCCD/CMND, số điện thoại, email, địa chỉ.
- **RULE BẢO MẬT 2**: Phải áp dụng `sectionScope(user)` từ `apps/api/src/common/utils/dept-scope.ts`. Giảng viên thuần (`LECTURER`) CHỈ ĐƯỢC THẤY các lớp học phần do chính mình phụ trách (`lecturerId: user.id`).
- Tự động lấy kỳ active từ `/api/terms/current` làm mặc định khi vào trang nếu URL chưa có tham số `term`.
- Đồng bộ bộ lọc qua URL search params (`term`, `search`, `block`).
- Không phá vỡ các tính năng hiện có: `/master-data/class-sections` và `/class-sections/:id/grades` phải tiếp tục hoạt động bình thường.
- Đảm bảo `pnpm typecheck && pnpm lint && pnpm test` đều xanh.

---

### Task 1: Backend Scoping & Open Alerts Count for Class Sections

**Files:**
- Modify: `apps/api/src/modules/master-data/class-sections.service.ts`
- Modify: `apps/api/src/modules/master-data/master-data.controller.ts`
- Modify: `apps/api/src/modules/master-data/class-sections.service.spec.ts`

**Interfaces:**
- Consumes: `sectionScope(user)` from `src/common/utils/dept-scope.ts`, `AlertStatus` from `@prisma/client`
- Produces: `ClassSectionsService.findAll(user?: AuthUser, query?: ListClassSectionsQuery)` returning list of `ClassSection` with `openAlertCount`

- [ ] **Step 1: Viết failing tests trong `class-sections.service.spec.ts`**

Bổ sung test suite kiểm tra:
1. Giảng viên gọi `findAll(lecturerUser, { term: 'SU25' })` được giới hạn theo `sectionScope(lecturerUser)` (chỉ lấy lớp mình dạy).
2. Trưởng bộ môn gọi `findAll(hodUser, {})` thấy lớp thuộc bộ môn mình hoặc mình dạy.
3. Bản ghi trả về có trường `openAlertCount` đếm số sinh viên có cảnh báo `OPEN` hoặc `ACKNOWLEDGED` trong lớp.
4. Lời gọi cũ không truyền `user` vẫn tương thích ngược.

File: `apps/api/src/modules/master-data/class-sections.service.spec.ts`
```typescript
describe('ClassSectionsService — phạm vi lớp học phần & cảnh báo', () => {
  it('giảng viên chỉ thấy lớp học phần do chính mình dạy', async () => {
    const { prisma, findMany } = makePrisma();
    const lecturerUser = { id: 'gv-1', roles: ['LECTURER'], departmentId: 'dept-1' } as AuthUser;
    await new ClassSectionsService(prisma, audit).findAll(lecturerUser, { term: 'SU25' });
    const [args] = findMany.mock.calls[0];
    expect(args.where.AND).toBeDefined();
    // Scope của giảng viên chứa lecturerId: 'gv-1'
    expect(args.where.AND).toEqual(
      expect.arrayContaining([
        { AND: [{ lecturerId: 'gv-1' }] },
        expect.objectContaining({ term: 'SU25' }),
      ]),
    );
  });

  it('gắn openAlertCount vào từng lớp học phần', async () => {
    const { prisma, findMany } = makePrisma();
    findMany.mockResolvedValueOnce([
      { id: 'cs-1', code: 'PRF192-SE1901-SU25', enrollments: [] },
      { id: 'cs-2', code: 'PRN211-SE1901-SU25', enrollments: [] },
    ]);
    // Mock enrollments có open alert
    (prisma.enrollment.findMany as jest.Mock) = jest.fn().mockResolvedValueOnce([
      { classSectionId: 'cs-1' },
      { classSectionId: 'cs-1' },
      { classSectionId: 'cs-2' },
    ]);

    const result = await new ClassSectionsService(prisma, audit).findAll({} as AuthUser, {});
    expect(result[0].openAlertCount).toBe(2);
    expect(result[1].openAlertCount).toBe(1);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
pnpm --filter @fcare/api test -- src/modules/master-data/class-sections.service.spec.ts
```
Expected: FAIL (phương thức chưa nhận user và chưa tính `openAlertCount`).

- [ ] **Step 3: Cập nhật `class-sections.service.ts`**

Chỉnh sửa `apps/api/src/modules/master-data/class-sections.service.ts`:
```typescript
  async findAll(
    userOrQuery?: AuthUser | ListClassSectionsQuery,
    maybeQuery?: ListClassSectionsQuery,
  ) {
    const user = userOrQuery && 'roles' in userOrQuery ? userOrQuery : undefined;
    const query = (user ? maybeQuery : (userOrQuery as ListClassSectionsQuery)) ?? {};

    const scope = user ? sectionScope(user) : {};

    const sections = await this.prisma.classSection.findMany({
      where: {
        AND: [
          scope,
          {
            ...(query.term ? { term: query.term } : {}),
            ...(query.unassigned
              ? { lecturerId: null }
              : query.lecturerId
              ? { lecturerId: query.lecturerId }
              : {}),
          },
        ],
      },
      orderBy: [{ term: 'desc' }, { code: 'asc' }],
      include: {
        subject: true,
        lecturer: { select: { id: true, staffCode: true, fullName: true } },
        _count: { select: { enrollments: true } },
      },
    });

    if (sections.length === 0) {
      return [];
    }

    const sectionIds = sections.map((s) => s.id);
    const enrollmentsWithAlerts = await this.prisma.enrollment.findMany({
      where: {
        classSectionId: { in: sectionIds },
        student: {
          alerts: {
            some: {
              status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
            },
          },
        },
      },
      select: { classSectionId: true },
    });

    const alertCountBySectionId = new Map<string, number>();
    for (const e of enrollmentsWithAlerts) {
      alertCountBySectionId.set(
        e.classSectionId,
        (alertCountBySectionId.get(e.classSectionId) ?? 0) + 1,
      );
    }

    return sections.map((section) => ({
      ...section,
      openAlertCount: alertCountBySectionId.get(section.id) ?? 0,
    }));
  }
```

- [ ] **Step 4: Cập nhật `master-data.controller.ts`**

Truyền `@CurrentUser() user: AuthUser` vào `findAll`:
```typescript
  @Get()
  @CheckPolicies(canRead)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListClassSectionsQuery,
  ) {
    return this.service.findAll(user, query);
  }
```

- [ ] **Step 5: Chạy test xác minh pass**

```bash
pnpm --filter @fcare/api test -- src/modules/master-data/class-sections.service.spec.ts
```
Expected: PASS toàn bộ test suites.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/master-data/class-sections.service.ts apps/api/src/modules/master-data/master-data.controller.ts apps/api/src/modules/master-data/class-sections.service.spec.ts
git commit -m "feat(api): enforce sectionScope and compute openAlertCount in class-sections findAll"
```

---

### Task 2: Frontend Types & Navigation Tree Integration

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/components/dashboard/nav-tree.ts`
- Modify: `apps/web/src/components/dashboard/nav-tree.test.ts`

**Interfaces:**
- Consumes: `IconSections` from `nav-icons.tsx`
- Produces: `ClassSection.openAlertCount?: number`, nav item `Lớp học` (`/class-sections`) in `main` section.

- [ ] **Step 1: Viết test failing trong `nav-tree.test.ts`**

Thêm test kiểm tra mục `Lớp học` xuất hiện trong khu vực Chính:
```typescript
  it('khu vực Chính chứa mục Lớp học dẫn đến /class-sections', () => {
    const main = buildNavSections(user(['LECTURER']))[0].items;
    const classLeaf = main.find((node) => node.kind === 'leaf' && node.href === '/class-sections');
    expect(classLeaf).toBeDefined();
    expect(classLeaf?.label).toBe('Lớp học');
  });
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
pnpm --filter @fcare/web test -- run src/components/dashboard/nav-tree.test.ts
```
Expected: FAIL (chưa có `/class-sections` trong `main`).

- [ ] **Step 3: Cập nhật `types.ts` và `nav-tree.ts`**

Trong `apps/web/src/lib/types.ts`:
Bổ sung `openAlertCount?: number;` vào interface `ClassSection`.

Trong `apps/web/src/components/dashboard/nav-tree.ts`:
Cập nhật `buildNavSections`:
```typescript
export function buildNavSections(user: AuthUser): NavSection[] {
  const sections: NavSection[] = [
    {
      id: 'main',
      label: 'Chính',
      items: [
        { kind: 'leaf', href: '/dashboard', label: 'Tổng quan', icon: IconOverview },
        { kind: 'leaf', href: '/students', label: 'Sinh viên', icon: IconStudents },
        { kind: 'leaf', href: '/class-sections', label: 'Lớp học', icon: IconSections },
        { kind: 'leaf', href: '/alerts', label: 'Cảnh báo', icon: IconAlerts, badge: 'openAlerts' },
        { kind: 'leaf', href: '/statistics', label: 'Thống kê', icon: IconStatistics },
      ],
    },
  ];
  ...
```

- [ ] **Step 4: Chạy test xác minh pass**

```bash
pnpm --filter @fcare/web test -- run src/components/dashboard/nav-tree.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/components/dashboard/nav-tree.ts apps/web/src/components/dashboard/nav-tree.test.ts
git commit -m "feat(web): add Lớp học tab to main navigation tree"
```

---

### Task 3: Classes View Component & Page Implementation

**Files:**
- Create: `apps/web/src/components/class-sections/classes-view.tsx`
- Create: `apps/web/src/app/(dashboard)/class-sections/page.tsx`

**Interfaces:**
- Consumes: `apiFetch<ClassSection[]>('/class-sections?term=...')`, `useCurrentTerm()`, `useTerms()`, `useMe()`
- Produces: Màn hình danh sách lớp học phần của giảng viên trong học kỳ active hiện tại, kèm thẻ thống kê, bộ lọc, card hiển thị lớp học và liên kết nhanh.

- [ ] **Step 1: Tạo component `ClassesView`**

Tạo file `apps/web/src/components/class-sections/classes-view.tsx`:
- Sử dụng `useSearchParams`, `useRouter`, `usePathname` để quản lý state URL (`term`, `search`, `block`).
- Sử dụng `useCurrentTerm()` để tự động nhận diện và thiết lập kỳ active làm mặc định nếu URL chưa có `term`.
- Dropdown chọn học kỳ hiển thị tất cả các kỳ lấy từ `useTerms()`, đánh dấu rõ `(Kỳ hiện tại)`.
- Các chỉ số KPI tổng hợp đầu trang:
  - Tổng số lớp học
  - Tổng số sinh viên phụ trách
  - Số sinh viên có cảnh báo cần chú ý
- Bộ lọc:
  - Tìm kiếm theo mã lớp học phần hoặc mã/tên môn học
  - Chọn Block (Tất cả / Block 1 / Block 2)
  - Chips hiển thị các điều kiện đang lọc kèm nút Xóa bộ lọc
- Grid thẻ lớp học (Class Cards) thiết kế hiện đại, cao cấp:
  - Mã lớp học phần (vd: `PRF192-SE1901-SU25`)
  - Tên môn học, mã môn học, số tín chỉ
  - Khối thông tin thời khóa biểu: Phòng (`room`), Ca học (`slot`), Thứ (`weekdays`), Block (`block 1/2`)
  - Sĩ số: Số sinh viên đăng ký (`_count.enrollments`)
  - Huy hiệu cảnh báo: nếu `openAlertCount > 0`, hiển thị nổi bật dạng `X sinh viên có cảnh báo`
  - Hành động nhanh:
    - Nút "Bảng điểm" dẫn sang `/class-sections/${section.id}/grades`
    - Nút "Sinh viên" dẫn sang `/students?term=${term}&sectionId=${section.id}`

- [ ] **Step 2: Tạo trang `apps/web/src/app/(dashboard)/class-sections/page.tsx`**

```tsx
import { Suspense } from 'react';
import { ClassesView } from '../../../components/class-sections/classes-view';

export default function ClassSectionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-text-muted">Đang tải danh sách lớp học...</div>}>
      <ClassesView />
    </Suspense>
  );
}
```

- [ ] **Step 3: Kiểm tra hiển thị và tương tác**

Chạy typecheck và lint để đảm bảo mã nguồn chuẩn xác:
```bash
pnpm --filter @fcare/web typecheck
pnpm --filter @fcare/web lint
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/class-sections/classes-view.tsx apps/web/src/app/(dashboard)/class-sections/page.tsx
git commit -m "feat(web): add ClassesView page for teacher's current term classes"
```

---

### Task 4: End-to-End Verification & Quality Gate

**Files:**
- Test verification across both apps.

- [ ] **Step 1: Chạy toàn bộ test suites**

```bash
pnpm test
```
Expected: Toàn bộ test của cả API và Web đều pass 100%.

- [ ] **Step 2: Chạy typecheck toàn repo**

```bash
pnpm typecheck
```
Expected: Không có lỗi TypeScript.

- [ ] **Step 3: Chạy build toàn repo**

```bash
pnpm build
```
Expected: Build thành công, bundle size trang mới < 300kB.

- [ ] **Step 4: Commit và hoàn tất**

```bash
git add .
git commit -m "chore: verify and finalize teacher classes tab feature"
```
