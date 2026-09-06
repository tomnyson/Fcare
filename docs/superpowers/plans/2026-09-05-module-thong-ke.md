# Kế hoạch triển khai — Giai đoạn 1: Module thống kê

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bổ sung hai chiều thống kê mới (theo môn học, theo giáo viên) và một trang `/statistics` bốn tab có lọc học kỳ, trên nền module `statistics` đã có.

**Architecture:** Tách `statistics.service.ts` thành các service theo chiều (mỗi file một trách nhiệm), thêm hai service mới, thêm helper phạm vi `lecturerStatsScope` vào `dept-scope.ts`. Phía web thêm một trang App Router giữ tab + học kỳ trên URL, tái dùng `FilterBar` và `DataTable` sẵn có.

**Tech Stack:** NestJS 11 + Prisma 6 + Jest (api) · Next.js 15 App Router + TanStack Query + Tailwind 4 + Vitest (web) · pnpm + Turborepo.

**Spec:** `docs/superpowers/specs/2026-09-05-thong-ke-va-chat-noi-bo-design.md` (mục 3 — Phần 1)

## Global Constraints

- **RULE 2 (bắt buộc):** mọi truy vấn chạm sinh viên đi qua `studentScope(user)`; lớp học phần đi qua `sectionScope(user)` từ `apps/api/src/common/utils/dept-scope.ts`. KHÔNG so `departmentId` bằng tay.
- **RULE 1:** không thêm cột/field CCCD, SĐT, email, địa chỉ ở bất kỳ đâu.
- Envelope `{ success, data, error }` là mặc định toàn cục — controller chỉ `return` dữ liệu thô, không tự bọc.
- Prisma **pin v6**, không nâng v7.
- Màu sắc lấy từ `apps/web/src/styles/tokens.css`, không hardcode. Token brand hợp lệ: `fpt-orange`, `fpt-orange-600`, `fpt-orange-50`, `fpt-blue`, `fpt-blue-700`, `fpt-blue-900`, `fpt-green`. **Không có** `fpt-orange-300` hay `fpt-blue-600` — dùng sẽ im lặng không ăn.
- Toàn bộ nội dung hiển thị và comment viết bằng tiếng Việt, theo giọng các file quanh nó.
- **Không tự commit.** `CLAUDE.md` quy định chỉ commit khi người dùng yêu cầu. Bước "Commit" cuối mỗi task chỉ chạy sau khi người dùng cho phép; nếu chưa, bỏ qua bước đó và đi tiếp.
- Cổng hoàn thành: `pnpm typecheck && pnpm lint && pnpm test` phải xanh. **Không chạy `pnpm build`** khi `next dev` đang giữ cổng 3000 (kiểm tra bằng `lsof -ti :3000`).

---

### Task 1: Tách service theo chiều (không đổi hành vi)

Mục đích duy nhất là dọn chỗ: `statistics.service.ts` đang ~200 dòng, thêm hai chiều nữa sẽ quá tải. Logic **không được sửa một dòng nào** — test cũ giữ nguyên nội dung assert chính là bằng chứng.

**Files:**
- Create: `apps/api/src/modules/statistics/dimensions/class-stats.service.ts`
- Create: `apps/api/src/modules/statistics/dimensions/department-stats.service.ts`
- Modify: `apps/api/src/modules/statistics/statistics.service.ts` (bỏ `classes` và `departments`, giữ `overview`)
- Modify: `apps/api/src/modules/statistics/statistics.controller.ts`
- Modify: `apps/api/src/modules/statistics/statistics.module.ts`
- Test: `apps/api/src/modules/statistics/dimensions/department-stats.service.spec.ts` (chuyển từ `statistics.service.spec.ts`)

**Interfaces:**
- Consumes: `studentScope`, `sectionScope`, `isDeptScoped`, `seesWholeDepartment` từ `../../common/utils/dept-scope`.
- Produces: `ClassStatsService.list(user: AuthUser, term?: string)` và `DepartmentStatsService.list(user: AuthUser)` — hai method này là `classes`/`departments` cũ đổi tên thành `list`. `StatisticsService.overview(user)` giữ nguyên tên.

- [ ] **Step 1: Tạo `class-stats.service.ts` bằng cách chuyển nguyên hàm `classes`**

Copy nguyên văn thân hàm `classes` từ `statistics.service.ts` (kể cả comment tiếng Việt) vào file mới, đổi tên method thành `list`:

```ts
import { Injectable } from '@nestjs/common';
import { EnrollmentResult } from '@prisma/client';
import type { AuthUser } from '../../../common/types/auth-user';
import { sectionScope } from '../../../common/utils/dept-scope';
import { PrismaService } from '../../../prisma/prisma.service';

/** Thống kê theo lớp học phần: đạt / trượt / cấm thi / tỷ lệ đạt (tài liệu mục thống kê). */
@Injectable()
export class ClassStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, term?: string) {
    // ...thân hàm `classes` cũ, copy nguyên văn, không sửa gì...
  }
}
```

- [ ] **Step 2: Tạo `department-stats.service.ts` bằng cách chuyển nguyên hàm `departments`**

Tương tự: copy nguyên văn thân hàm `departments` (kể cả khối JSDoc dài giải thích vì sao `totalStaff` có thể `null`) vào `DepartmentStatsService.list(user)`. Hằng `NO_DEPARTMENT = '__no_department__'` đang khai báo trong `statistics.service.ts` phải đi theo sang file này.

- [ ] **Step 3: Gỡ hai hàm khỏi `statistics.service.ts`**

Chỉ còn `overview` và hằng `THIRTY_DAYS_MS`. Xóa các import không còn dùng (`EnrollmentResult`, `sectionScope`, `isDeptScoped`, `seesWholeDepartment`, `NO_DEPARTMENT`) — ESLint sẽ báo nếu sót.

- [ ] **Step 4: Nối dây controller và module**

`statistics.controller.ts` inject thêm hai service, ba route giữ nguyên đường dẫn:

```ts
  constructor(
    private readonly statisticsService: StatisticsService,
    private readonly classStats: ClassStatsService,
    private readonly departmentStats: DepartmentStatsService,
  ) {}

  @Get('classes')
  classes(@CurrentUser() user: AuthUser, @Query('term') term?: string) {
    return this.classStats.list(user, term || undefined);
  }

  @Get('departments')
  departments(@CurrentUser() user: AuthUser) {
    return this.departmentStats.list(user);
  }
```

`statistics.module.ts` thêm hai service vào `providers`.

- [ ] **Step 5: Chuyển test cũ sang file mới**

`statistics.service.spec.ts` hiện chỉ kiểm `departments`. Chuyển toàn bộ file sang `dimensions/department-stats.service.spec.ts`, đổi `new StatisticsService(prisma)` thành `new DepartmentStatsService(prisma)` và `service.departments(...)` thành `service.list(...)`. **Mọi assert giữ nguyên** — đó là bằng chứng hành vi không đổi. Sửa đường dẫn import (thêm một cấp `../`).

- [ ] **Step 6: Chạy test, phải xanh y như trước**

Run: `pnpm --filter @fcare/api test`
Expected: PASS, số test không giảm.

- [ ] **Step 7: Kiểm tra kiểu và lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sạch.

- [ ] **Step 8: Commit** *(chỉ khi người dùng đã cho phép)*

```bash
git add apps/api/src/modules/statistics
git commit -m "refactor: tach statistics service theo tung chieu thong ke"
```

---

### Task 2: Thống kê theo môn học

**Files:**
- Create: `apps/api/src/modules/statistics/dimensions/subject-stats.service.ts`
- Test: `apps/api/src/modules/statistics/dimensions/subject-stats.service.spec.ts`
- Modify: `apps/api/src/modules/statistics/statistics.controller.ts`, `statistics.module.ts`

**Interfaces:**
- Consumes: `sectionScope(user)` từ `dept-scope`.
- Produces: `SubjectStatsService.list(user: AuthUser, term?: string)` trả `Promise<SubjectStatRow[]>` với

```ts
interface SubjectStatRow {
  id: string; code: string; name: string; credits: number;
  department: { code: string; name: string };
  sectionCount: number; total: number;
  pass: number; fail: number; inProgress: number; examBanned: number;
  passRate: number | null;   // %, 1 chữ số thập phân; null khi chưa có kết quả
  avgScore: number | null;   // 0..10, 1 chữ số thập phân; null khi chưa có điểm
}
```
Route: `GET /statistics/subjects?term=`.

- [ ] **Step 1: Viết test thất bại**

Tạo `subject-stats.service.spec.ts`. `Enrollment` không có `subjectId`, nên service phải gom qua lớp học phần — test khóa đúng cách gom đó và khóa RULE 2.

```ts
import type { AuthUser } from '../../../common/types/auth-user';
import type { PrismaService } from '../../../prisma/prisma.service';
import { SubjectStatsService } from './subject-stats.service';

const adminUser = {
  id: 'ad', staffCode: 'AD', fullName: 'Quản trị', roles: ['ADMIN'],
  departmentId: null, consented: true, mustChangePassword: false,
} as AuthUser;

const lecturerUser = {
  id: 'gv-1', staffCode: 'GV1', fullName: 'Giảng viên', roles: ['LECTURER'],
  departmentId: 'dept-1', consented: true, mustChangePassword: false,
} as AuthUser;

/** Hai lớp học phần của cùng môn PRF192 — số liệu phải cộng dồn về một dòng. */
const SECTIONS = [
  {
    id: 'cs-1',
    subject: {
      id: 'sub-1', code: 'PRF192', name: 'Lập trình cơ bản', credits: 3,
      department: { code: 'SE', name: 'Kỹ thuật phần mềm' },
    },
  },
  {
    id: 'cs-2',
    subject: {
      id: 'sub-1', code: 'PRF192', name: 'Lập trình cơ bản', credits: 3,
      department: { code: 'SE', name: 'Kỹ thuật phần mềm' },
    },
  },
];

function setup() {
  const sectionFindMany = jest.fn().mockResolvedValue(SECTIONS);
  const enrollmentGroupBy = jest.fn();
  // 1: kết quả theo lớp · 2: cấm thi · 3: điểm trung bình
  enrollmentGroupBy
    .mockResolvedValueOnce([
      { classSectionId: 'cs-1', result: 'PASS', _count: { _all: 8 } },
      { classSectionId: 'cs-1', result: 'FAIL', _count: { _all: 2 } },
      { classSectionId: 'cs-2', result: 'PASS', _count: { _all: 6 } },
      { classSectionId: 'cs-2', result: 'IN_PROGRESS', _count: { _all: 4 } },
    ])
    .mockResolvedValueOnce([{ classSectionId: 'cs-1', _count: { _all: 1 } }])
    .mockResolvedValueOnce([
      { classSectionId: 'cs-1', _avg: { totalScore: 7 }, _count: { totalScore: 10 } },
      { classSectionId: 'cs-2', _avg: { totalScore: 8 }, _count: { totalScore: 10 } },
    ]);
  const prisma = {
    classSection: { findMany: sectionFindMany },
    enrollment: { groupBy: enrollmentGroupBy },
  } as unknown as PrismaService;
  return {
    service: new SubjectStatsService(prisma),
    sectionFindMany,
    enrollmentGroupBy,
  };
}

describe('SubjectStatsService.list', () => {
  it('cộng dồn nhiều lớp học phần về một dòng môn học', async () => {
    const { service } = setup();
    const [row] = await service.list(adminUser);
    expect(row).toMatchObject({
      code: 'PRF192', sectionCount: 2, total: 20,
      pass: 14, fail: 2, inProgress: 4, examBanned: 1,
    });
  });

  it('tỷ lệ đạt chỉ tính trên số đã có kết quả, không tính đang học', async () => {
    const { service } = setup();
    const [row] = await service.list(adminUser);
    // 14 đạt / (14 đạt + 2 trượt) = 87.5%
    expect(row.passRate).toBe(87.5);
  });

  it('điểm trung bình là bình quân có trọng số theo số bài có điểm', async () => {
    const { service } = setup();
    const [row] = await service.list(adminUser);
    // (7*10 + 8*10) / 20 = 7.5
    expect(row.avgScore).toBe(7.5);
  });

  it('RULE 2: mọi truy vấn đều mang phạm vi lớp học phần của người xem', async () => {
    const { service, sectionFindMany, enrollmentGroupBy } = setup();
    await service.list(lecturerUser, 'SU25');
    const scoped = { term: 'SU25', AND: [{ lecturerId: 'gv-1' }] };
    expect(sectionFindMany.mock.calls[0][0].where).toEqual(scoped);
    for (const call of enrollmentGroupBy.mock.calls) {
      expect(call[0].where.classSection).toEqual(scoped);
    }
  });

  it('không lọc kỳ thì term là undefined chứ không phải chuỗi rỗng', async () => {
    const { service, sectionFindMany } = setup();
    await service.list(adminUser);
    expect(sectionFindMany.mock.calls[0][0].where.term).toBeUndefined();
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `pnpm --filter @fcare/api test -- subject-stats`
Expected: FAIL — `Cannot find module './subject-stats.service'`.

- [ ] **Step 3: Viết service**

```ts
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EnrollmentResult } from '@prisma/client';
import type { AuthUser } from '../../../common/types/auth-user';
import { sectionScope } from '../../../common/utils/dept-scope';
import { PrismaService } from '../../../prisma/prisma.service';

/** Gộp số liệu của tất cả lớp học phần cùng một môn. */
interface SubjectAccumulator {
  id: string;
  code: string;
  name: string;
  credits: number;
  department: { code: string; name: string };
  sectionCount: number;
  pass: number;
  fail: number;
  inProgress: number;
  examBanned: number;
  scoreSum: number;
  scoreCount: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Thống kê theo môn học. `Enrollment` không có `subjectId` nên phải gom qua
 * lớp học phần — cũng chính là chỗ RULE 2 bám vào: chỉ những lớp nằm trong
 * `sectionScope` mới được đếm, nên môn nào người xem không dạy/không quản thì
 * không xuất hiện, chứ không hiện một dòng toàn số 0 (số 0 đó cũng là thông
 * tin ngoài phạm vi).
 */
@Injectable()
export class SubjectStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, term?: string) {
    const sectionWhere: Prisma.ClassSectionWhereInput = {
      term,
      ...sectionScope(user),
    };

    const [sections, resultGroups, bannedGroups, scoreGroups] =
      await Promise.all([
        this.prisma.classSection.findMany({
          where: sectionWhere,
          select: {
            id: true,
            subject: {
              select: {
                id: true,
                code: true,
                name: true,
                credits: true,
                department: { select: { code: true, name: true } },
              },
            },
          },
        }),
        this.prisma.enrollment.groupBy({
          by: ['classSectionId', 'result'],
          _count: { _all: true },
          where: { classSection: sectionWhere },
        }),
        this.prisma.enrollment.groupBy({
          by: ['classSectionId'],
          _count: { _all: true },
          where: { isExamBanned: true, classSection: sectionWhere },
        }),
        this.prisma.enrollment.groupBy({
          by: ['classSectionId'],
          _avg: { totalScore: true },
          _count: { totalScore: true },
          where: { totalScore: { not: null }, classSection: sectionWhere },
        }),
      ]);

    const subjectIdBySection = new Map<string, string>();
    const bySubject = new Map<string, SubjectAccumulator>();

    for (const section of sections) {
      const subject = section.subject;
      subjectIdBySection.set(section.id, subject.id);
      const existing = bySubject.get(subject.id);
      if (existing) {
        existing.sectionCount += 1;
        continue;
      }
      bySubject.set(subject.id, {
        id: subject.id,
        code: subject.code,
        name: subject.name,
        credits: subject.credits,
        department: subject.department,
        sectionCount: 1,
        pass: 0,
        fail: 0,
        inProgress: 0,
        examBanned: 0,
        scoreSum: 0,
        scoreCount: 0,
      });
    }

    const entryFor = (sectionId: string): SubjectAccumulator | undefined => {
      const subjectId = subjectIdBySection.get(sectionId);
      return subjectId ? bySubject.get(subjectId) : undefined;
    };

    for (const group of resultGroups) {
      const entry = entryFor(group.classSectionId);
      if (!entry) continue;
      const count = group._count._all;
      if (group.result === EnrollmentResult.PASS) entry.pass += count;
      else if (group.result === EnrollmentResult.FAIL) entry.fail += count;
      else entry.inProgress += count;
    }

    for (const group of bannedGroups) {
      const entry = entryFor(group.classSectionId);
      if (entry) entry.examBanned += group._count._all;
    }

    // Bình quân có trọng số: mỗi lớp góp theo số bài thực sự có điểm, chứ
    // không lấy trung bình của các trung bình (lớp 5 người sẽ nặng bằng lớp 40).
    for (const group of scoreGroups) {
      const entry = entryFor(group.classSectionId);
      const avg = group._avg.totalScore;
      const count = group._count.totalScore;
      if (!entry || avg === null || count === 0) continue;
      entry.scoreSum += avg * count;
      entry.scoreCount += count;
    }

    return [...bySubject.values()]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(({ scoreSum, scoreCount, ...subject }) => {
        const decided = subject.pass + subject.fail;
        return {
          ...subject,
          total: subject.pass + subject.fail + subject.inProgress,
          passRate: decided > 0 ? round1((subject.pass / decided) * 100) : null,
          avgScore: scoreCount > 0 ? round1(scoreSum / scoreCount) : null,
        };
      });
  }
}
```

- [ ] **Step 4: Chạy test, phải xanh**

Run: `pnpm --filter @fcare/api test -- subject-stats`
Expected: PASS, 5 test.

- [ ] **Step 5: Nối route**

`statistics.controller.ts`:

```ts
  @Get('subjects')
  subjects(@CurrentUser() user: AuthUser, @Query('term') term?: string) {
    return this.subjectStats.list(user, term || undefined);
  }
```

Inject `private readonly subjectStats: SubjectStatsService` và thêm vào `providers` của module.

- [ ] **Step 6: Chạy toàn bộ test + typecheck + lint**

Run: `pnpm --filter @fcare/api test && pnpm typecheck && pnpm lint`
Expected: sạch.

- [ ] **Step 7: Commit** *(chỉ khi người dùng đã cho phép)*

```bash
git add apps/api/src/modules/statistics
git commit -m "feat: them thong ke theo mon hoc"
```

---

### Task 3: Helper phạm vi `lecturerStatsScope`

Tách riêng khỏi Task 4 vì đây là quyết định phân quyền — nó đáng được đọc và duyệt độc lập với phần tính toán số liệu.

**Files:**
- Modify: `apps/api/src/common/utils/dept-scope.ts` (thêm hàm ở cuối, cạnh `sectionScope`)
- Test: `apps/api/src/common/utils/dept-scope.spec.ts` — **file này ĐÃ TỒN TẠI** và đã có sẵn helper `makeUser` (id `staff-1`, departmentId `dept-se`). Chỉ thêm một khối `describe` mới ở cuối và dùng lại `makeUser` đó; KHÔNG khai báo helper thứ hai, KHÔNG sửa các khối `describe` đang có. Nhớ thêm `lecturerStatsScope` vào danh sách import ở đầu file.

**Interfaces:**
- Produces: `lecturerStatsScope(user: AuthUser): Prisma.StaffWhereInput`

- [ ] **Step 1: Viết test thất bại**

Thêm `lecturerStatsScope` vào khối import sẵn có ở đầu file, rồi thêm khối này vào cuối file — dùng lại `makeUser` đã có trong file, không khai báo helper mới:

```ts
describe('lecturerStatsScope', () => {
  it('giảng viên thuần chỉ thấy đúng dòng của chính mình', () => {
    expect(lecturerStatsScope(makeUser({ roles: ['LECTURER'] }))).toEqual({
      id: 'staff-1',
    });
  });

  it('trưởng bộ môn thấy giảng viên bộ môn mình', () => {
    expect(lecturerStatsScope(makeUser({ roles: ['HEAD_OF_DEPT'] }))).toEqual({
      departmentId: 'dept-se',
    });
  });

  it('trưởng bộ môn chưa gán bộ môn thì không thấy ai', () => {
    expect(
      lecturerStatsScope(
        makeUser({ roles: ['HEAD_OF_DEPT'], departmentId: null }),
      ),
    ).toEqual({ departmentId: '__no_department__' });
  });

  it('vai trò toàn trường thấy tất cả', () => {
    for (const role of [
      'ADMIN',
      'TRAINING_OFFICER',
      'SA_OFFICER',
      'SA_HEAD',
    ] as const) {
      expect(lecturerStatsScope(makeUser({ roles: [role] }))).toEqual({});
    }
  });

  it('giảng viên kiêm trưởng bộ môn được tính theo vai rộng hơn', () => {
    expect(
      lecturerStatsScope(makeUser({ roles: ['LECTURER', 'HEAD_OF_DEPT'] })),
    ).toEqual({ departmentId: 'dept-se' });
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `pnpm --filter @fcare/api test -- dept-scope`
Expected: FAIL — `lecturerStatsScope is not a function`.

- [ ] **Step 3: Viết hàm**

Thêm vào cuối `dept-scope.ts`:

```ts
/**
 * Phạm vi giảng viên cho bảng thống kê theo giáo viên.
 *
 * Cố ý CHẶT hơn `sectionScope`: giảng viên thuần chỉ thấy đúng dòng của chính
 * mình, để bảng số liệu không biến thành bảng xếp hạng đồng nghiệp. Trưởng bộ
 * môn và các vai trò toàn trường vẫn cần so sánh giữa các giảng viên nên được
 * nhìn rộng — đây là công việc quản lý của họ.
 */
export function lecturerStatsScope(user: AuthUser): Prisma.StaffWhereInput {
  if (!isDeptScoped(user)) {
    return {};
  }
  if (seesWholeDepartment(user)) {
    return { departmentId: user.departmentId ?? NO_DEPARTMENT };
  }
  return { id: user.id };
}
```

- [ ] **Step 4: Chạy test, phải xanh**

Run: `pnpm --filter @fcare/api test -- dept-scope`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit** *(chỉ khi người dùng đã cho phép)*

```bash
git add apps/api/src/common/utils
git commit -m "feat: them lecturerStatsScope cho thong ke theo giao vien"
```

---

### Task 4: Thống kê theo giáo viên

**Files:**
- Create: `apps/api/src/modules/statistics/dimensions/lecturer-stats.service.ts`
- Test: `apps/api/src/modules/statistics/dimensions/lecturer-stats.service.spec.ts`
- Modify: `apps/api/src/modules/statistics/statistics.controller.ts`, `statistics.module.ts`

**Interfaces:**
- Consumes: `sectionScope(user)` và `lecturerStatsScope(user)` (Task 3).
- Produces: `LecturerStatsService.list(user: AuthUser, term?: string)` trả `Promise<LecturerStatRow[]>`:

```ts
interface LecturerStatRow {
  id: string; staffCode: string; fullName: string;
  department: { code: string; name: string } | null;
  sectionCount: number; total: number;
  pass: number; fail: number; inProgress: number; examBanned: number;
  passRate: number | null;
  evaluationCount: number;
}
```
Route: `GET /statistics/lecturers?term=`.

- [ ] **Step 1: Viết test thất bại**

```ts
import type { AuthUser } from '../../../common/types/auth-user';
import type { PrismaService } from '../../../prisma/prisma.service';
import { LecturerStatsService } from './lecturer-stats.service';

const adminUser = {
  id: 'ad', staffCode: 'AD', fullName: 'Quản trị', roles: ['ADMIN'],
  departmentId: null, consented: true, mustChangePassword: false,
} as AuthUser;

const lecturerUser = {
  id: 'gv-1', staffCode: 'GV1', fullName: 'Giảng viên', roles: ['LECTURER'],
  departmentId: 'dept-1', consented: true, mustChangePassword: false,
} as AuthUser;

function setup() {
  const staffFindMany = jest.fn().mockResolvedValue([
    {
      id: 'gv-1', staffCode: 'GV1', fullName: 'Trần Minh Hoạt',
      department: { code: 'SE', name: 'Kỹ thuật phần mềm' },
    },
  ]);
  const sectionFindMany = jest.fn().mockResolvedValue([
    { id: 'cs-1', lecturerId: 'gv-1' },
    { id: 'cs-2', lecturerId: 'gv-1' },
    { id: 'cs-3', lecturerId: null }, // lớp chưa phân công GV — phải bị bỏ qua
  ]);
  const enrollmentGroupBy = jest.fn();
  enrollmentGroupBy
    .mockResolvedValueOnce([
      { classSectionId: 'cs-1', result: 'PASS', _count: { _all: 9 } },
      { classSectionId: 'cs-2', result: 'FAIL', _count: { _all: 1 } },
      { classSectionId: 'cs-3', result: 'PASS', _count: { _all: 5 } },
    ])
    .mockResolvedValueOnce([{ classSectionId: 'cs-1', _count: { _all: 2 } }]);
  const evaluationGroupBy = jest
    .fn()
    .mockResolvedValue([{ lecturerId: 'gv-1', _count: { _all: 4 } }]);
  const prisma = {
    staff: { findMany: staffFindMany },
    classSection: { findMany: sectionFindMany },
    enrollment: { groupBy: enrollmentGroupBy },
    evaluation: { groupBy: evaluationGroupBy },
  } as unknown as PrismaService;
  return {
    service: new LecturerStatsService(prisma),
    staffFindMany,
    evaluationGroupBy,
  };
}

describe('LecturerStatsService.list', () => {
  it('cộng dồn các lớp của cùng giảng viên', async () => {
    const { service } = setup();
    const [row] = await service.list(adminUser);
    expect(row).toMatchObject({
      staffCode: 'GV1', sectionCount: 2, total: 10,
      pass: 9, fail: 1, examBanned: 2, passRate: 90, evaluationCount: 4,
    });
  });

  it('lớp chưa phân công giảng viên không rơi vào dòng của ai', async () => {
    const { service } = setup();
    const rows = await service.list(adminUser);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(10); // không cộng 5 của cs-3
  });

  it('RULE 2: giảng viên thuần chỉ truy vấn đúng dòng của mình', async () => {
    const { service, staffFindMany } = setup();
    await service.list(lecturerUser);
    expect(staffFindMany.mock.calls[0][0].where.AND).toContainEqual({ id: 'gv-1' });
  });

  it('lọc kỳ áp cho cả số đánh giá đã nhập', async () => {
    const { service, evaluationGroupBy } = setup();
    await service.list(adminUser, 'SU25');
    expect(evaluationGroupBy.mock.calls[0][0].where.term).toBe('SU25');
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `pnpm --filter @fcare/api test -- lecturer-stats`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Viết service**

```ts
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EnrollmentResult } from '@prisma/client';
import type { AuthUser } from '../../../common/types/auth-user';
import {
  lecturerStatsScope,
  sectionScope,
} from '../../../common/utils/dept-scope';
import { PrismaService } from '../../../prisma/prisma.service';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Thống kê theo giáo viên. Hai phạm vi khác nhau chồng lên nhau và cả hai đều
 * cần: `lecturerStatsScope` quyết định được thấy dòng của AI, `sectionScope`
 * quyết định lớp nào được tính vào dòng đó.
 */
@Injectable()
export class LecturerStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, term?: string) {
    const sectionWhere: Prisma.ClassSectionWhereInput = {
      term,
      ...sectionScope(user),
    };

    const [lecturers, sections, resultGroups, bannedGroups, evaluationGroups] =
      await Promise.all([
        this.prisma.staff.findMany({
          where: {
            AND: [
              lecturerStatsScope(user),
              { classSections: { some: sectionWhere } },
            ],
          },
          orderBy: { staffCode: 'asc' },
          select: {
            id: true,
            staffCode: true,
            fullName: true,
            department: { select: { code: true, name: true } },
          },
        }),
        this.prisma.classSection.findMany({
          where: sectionWhere,
          select: { id: true, lecturerId: true },
        }),
        this.prisma.enrollment.groupBy({
          by: ['classSectionId', 'result'],
          _count: { _all: true },
          where: { classSection: sectionWhere },
        }),
        this.prisma.enrollment.groupBy({
          by: ['classSectionId'],
          _count: { _all: true },
          where: { isExamBanned: true, classSection: sectionWhere },
        }),
        // Không kèm phạm vi sinh viên ở đây: con số này đếm việc GIẢNG VIÊN đã
        // làm, không phơi bày sinh viên nào. Giảng viên ngoài phạm vi vẫn bị
        // loại vì kết quả chỉ được tra cứu cho các dòng đã qua `lecturerStatsScope`.
        this.prisma.evaluation.groupBy({
          by: ['lecturerId'],
          _count: { _all: true },
          where: { term },
        }),
      ]);

    const lecturerBySection = new Map<string, string>();
    for (const section of sections) {
      // Lớp chưa phân công giảng viên (76/94 lớp trong file nguồn) không thuộc
      // về ai — bỏ qua thay vì gán bừa.
      if (section.lecturerId) {
        lecturerBySection.set(section.id, section.lecturerId);
      }
    }

    const evaluationCountByLecturer = new Map(
      evaluationGroups.map((group) => [group.lecturerId, group._count._all]),
    );

    const totals = new Map(
      lecturers.map((lecturer) => [
        lecturer.id,
        { pass: 0, fail: 0, inProgress: 0, examBanned: 0, sectionCount: 0 },
      ]),
    );

    for (const section of sections) {
      const entry = section.lecturerId
        ? totals.get(section.lecturerId)
        : undefined;
      if (entry) entry.sectionCount += 1;
    }

    for (const group of resultGroups) {
      const lecturerId = lecturerBySection.get(group.classSectionId);
      const entry = lecturerId ? totals.get(lecturerId) : undefined;
      if (!entry) continue;
      const count = group._count._all;
      if (group.result === EnrollmentResult.PASS) entry.pass += count;
      else if (group.result === EnrollmentResult.FAIL) entry.fail += count;
      else entry.inProgress += count;
    }

    for (const group of bannedGroups) {
      const lecturerId = lecturerBySection.get(group.classSectionId);
      const entry = lecturerId ? totals.get(lecturerId) : undefined;
      if (entry) entry.examBanned += group._count._all;
    }

    return lecturers.map((lecturer) => {
      const entry = totals.get(lecturer.id) ?? {
        pass: 0, fail: 0, inProgress: 0, examBanned: 0, sectionCount: 0,
      };
      const decided = entry.pass + entry.fail;
      return {
        id: lecturer.id,
        staffCode: lecturer.staffCode,
        fullName: lecturer.fullName,
        department: lecturer.department,
        sectionCount: entry.sectionCount,
        total: entry.pass + entry.fail + entry.inProgress,
        pass: entry.pass,
        fail: entry.fail,
        inProgress: entry.inProgress,
        examBanned: entry.examBanned,
        passRate: decided > 0 ? round1((entry.pass / decided) * 100) : null,
        evaluationCount: evaluationCountByLecturer.get(lecturer.id) ?? 0,
      };
    });
  }
}
```

- [ ] **Step 4: Chạy test, phải xanh**

Run: `pnpm --filter @fcare/api test -- lecturer-stats`
Expected: PASS, 4 test.

- [ ] **Step 5: Nối route**

```ts
  @Get('lecturers')
  lecturers(@CurrentUser() user: AuthUser, @Query('term') term?: string) {
    return this.lecturerStats.list(user, term || undefined);
  }
```

Inject `private readonly lecturerStats: LecturerStatsService`, thêm vào `providers`.

- [ ] **Step 6: Chạy toàn bộ kiểm tra phía API**

Run: `pnpm --filter @fcare/api test && pnpm typecheck && pnpm lint`
Expected: sạch.

- [ ] **Step 7: Commit** *(chỉ khi người dùng đã cho phép)*

```bash
git add apps/api/src
git commit -m "feat: them thong ke theo giao vien"
```

---

### Task 5: Kiểu và trạng thái URL phía web

Tách khỏi Task 6 vì đây là phần thuần logic, test được không cần dựng component — đúng cách `alert-filters.ts` và `master-data-tabs.ts` đang làm.

**Files:**
- Create: `apps/web/src/lib/statistics-view.ts`
- Test: `apps/web/src/lib/statistics-view.test.ts`
- Modify: `apps/web/src/lib/types.ts` (thêm hai interface, đặt cạnh `ClassStatistics`/`DepartmentStatistics` ở khoảng dòng 328)

**Interfaces:**
- Produces: `STATISTICS_TABS`, `StatisticsTabKey`, `isStatisticsTabKey(value: string)`, `parseStatisticsView(params: URLSearchParams): { tab: StatisticsTabKey; term: string }`, `buildStatisticsQuery(term: string): string`. Và trong `types.ts`: `SubjectStatistics`, `LecturerStatistics` khớp đúng hình dạng service ở Task 2 và Task 4.

- [ ] **Step 1: Viết test thất bại**

`apps/web/src/lib/statistics-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildStatisticsQuery,
  isStatisticsTabKey,
  parseStatisticsView,
} from './statistics-view';

function params(init: Record<string, string> = {}) {
  return new URLSearchParams(init);
}

describe('parseStatisticsView', () => {
  it('đọc tab và học kỳ từ URL', () => {
    expect(parseStatisticsView(params({ tab: 'subjects', term: 'SU25' }))).toEqual({
      tab: 'subjects',
      term: 'SU25',
    });
  });

  it('URL trống thì mở tab lớp học phần', () => {
    expect(parseStatisticsView(params())).toEqual({ tab: 'classes', term: '' });
  });

  it('tab lạ trong URL không làm vỡ trang mà quay về mặc định', () => {
    expect(parseStatisticsView(params({ tab: 'khong-ton-tai' })).tab).toBe('classes');
  });
});

describe('buildStatisticsQuery', () => {
  it('không gửi tham số khi không lọc kỳ', () => {
    expect(buildStatisticsQuery('')).toBe('');
  });

  it('gửi kỳ khi có lọc', () => {
    expect(buildStatisticsQuery('SU25')).toBe('?term=SU25');
  });
});

describe('isStatisticsTabKey', () => {
  it('nhận đúng bốn tab', () => {
    for (const key of ['classes', 'departments', 'subjects', 'lecturers']) {
      expect(isStatisticsTabKey(key)).toBe(true);
    }
    expect(isStatisticsTabKey('students')).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `pnpm --filter @fcare/web test -- statistics-view`
Expected: FAIL — không resolve được `./statistics-view`.

- [ ] **Step 3: Viết module**

```ts
/**
 * Trạng thái của trang thống kê. Tab và học kỳ nằm trên URL để gửi link
 * "tỷ lệ đạt theo môn kỳ SU25" là gửi đúng thứ mình đang nhìn — cùng triết lý
 * với `alert-filters` và `student-filters`.
 */
export const STATISTICS_TABS = [
  { key: 'classes', label: 'Lớp học phần', endpoint: '/statistics/classes' },
  { key: 'departments', label: 'Bộ môn', endpoint: '/statistics/departments' },
  { key: 'subjects', label: 'Môn học', endpoint: '/statistics/subjects' },
  { key: 'lecturers', label: 'Giáo viên', endpoint: '/statistics/lecturers' },
] as const;

export type StatisticsTab = (typeof STATISTICS_TABS)[number];
export type StatisticsTabKey = StatisticsTab['key'];

const DEFAULT_TAB: StatisticsTabKey = 'classes';

export function isStatisticsTabKey(value: string): value is StatisticsTabKey {
  return STATISTICS_TABS.some((tab) => tab.key === value);
}

export function parseStatisticsView(params: URLSearchParams): {
  tab: StatisticsTabKey;
  term: string;
} {
  const tab = params.get('tab') ?? '';
  return {
    tab: isStatisticsTabKey(tab) ? tab : DEFAULT_TAB,
    term: params.get('term') ?? '',
  };
}

/** Chuỗi query gắn vào endpoint; rỗng khi không lọc kỳ. */
export function buildStatisticsQuery(term: string): string {
  return term ? `?term=${encodeURIComponent(term)}` : '';
}
```

- [ ] **Step 4: Chạy test, phải xanh**

Run: `pnpm --filter @fcare/web test -- statistics-view`
Expected: PASS, 6 test.

- [ ] **Step 5: Thêm kiểu dữ liệu**

Vào `apps/web/src/lib/types.ts`, ngay sau `DepartmentStatistics`:

```ts
export interface SubjectStatistics {
  id: string;
  code: string;
  name: string;
  credits: number;
  department: { code: string; name: string };
  sectionCount: number;
  total: number;
  pass: number;
  fail: number;
  inProgress: number;
  examBanned: number;
  /** `null` khi chưa lớp nào có kết quả — hiển thị "—" chứ không phải 0%. */
  passRate: number | null;
  /** `null` khi chưa có bài nào có điểm. */
  avgScore: number | null;
}

export interface LecturerStatistics {
  id: string;
  staffCode: string;
  fullName: string;
  department: { code: string; name: string } | null;
  sectionCount: number;
  total: number;
  pass: number;
  fail: number;
  inProgress: number;
  examBanned: number;
  passRate: number | null;
  evaluationCount: number;
}
```

- [ ] **Step 6: Kiểm tra kiểu**

Run: `pnpm typecheck`
Expected: sạch.

- [ ] **Step 7: Commit** *(chỉ khi người dùng đã cho phép)*

```bash
git add apps/web/src/lib
git commit -m "feat: them kieu va trang thai URL cho trang thong ke"
```

---

### Task 6: Trang `/statistics`

**Files:**
- Create: `apps/web/src/app/(dashboard)/statistics/page.tsx`
- Create: `apps/web/src/components/statistics/subjects-table.tsx`
- Create: `apps/web/src/components/statistics/lecturers-table.tsx`

**Interfaces:**
- Consumes: `STATISTICS_TABS`, `parseStatisticsView`, `buildStatisticsQuery` (Task 5); `SubjectStatistics`, `LecturerStatistics`, `ClassStatistics`, `DepartmentStatistics` từ `lib/types`; `DataTable`/`Td` từ `components/ui/data-table`; `FilterBar`/`FilterField` từ `components/ui/filter-bar`; `PageHeader`; `apiFetch`.
- Produces: route `/statistics`.

- [ ] **Step 1: Tạo hai bảng mới**

`subjects-table.tsx` — bảng thuần trình bày, nhận `rows` và cờ tải:

```tsx
'use client';

import { DataTable, Td } from '../ui/data-table';
import type { SubjectStatistics } from '../../lib/types';

const HEADERS = [
  'Mã môn', 'Tên môn', 'TC', 'Bộ môn', 'Số lớp',
  'Lượt ĐK', 'Đạt', 'Trượt', 'Đang học', 'Cấm thi', 'Tỷ lệ đạt', 'Điểm TB',
];

export function SubjectsTable({
  rows,
  isLoading,
}: {
  rows: SubjectStatistics[];
  isLoading: boolean;
}) {
  return (
    <DataTable
      headers={HEADERS}
      isLoading={isLoading}
      isEmpty={rows.length === 0}
      emptyMessage="Chưa có môn học nào trong phạm vi của bạn ở kỳ này."
    >
      {rows.map((row) => (
        <tr key={row.id}>
          <Td className="font-semibold">{row.code}</Td>
          <Td>{row.name}</Td>
          {/* Số liệu dùng chữ số đều bề ngang để các cột thẳng hàng khi đọc dọc. */}
          <Td className="tabular-nums">{row.credits}</Td>
          <Td>{row.department.name}</Td>
          <Td className="tabular-nums">{row.sectionCount}</Td>
          <Td className="tabular-nums">{row.total}</Td>
          <Td className="tabular-nums">{row.pass}</Td>
          <Td className="tabular-nums">{row.fail}</Td>
          <Td className="tabular-nums">{row.inProgress}</Td>
          <Td className="tabular-nums">{row.examBanned}</Td>
          <Td className="tabular-nums">
            {row.passRate === null ? '—' : `${row.passRate}%`}
          </Td>
          <Td className="tabular-nums">{row.avgScore ?? '—'}</Td>
        </tr>
      ))}
    </DataTable>
  );
}
```

`lecturers-table.tsx` theo đúng khuôn đó với headers `['Mã NV', 'Họ tên', 'Bộ môn', 'Số lớp', 'Lượt ĐK', 'Đạt', 'Trượt', 'Đang học', 'Cấm thi', 'Tỷ lệ đạt', 'Đã đánh giá']`, `emptyMessage="Chưa có giảng viên nào có lớp trong phạm vi của bạn ở kỳ này."`, và `{row.department?.name ?? '—'}`.

`Td` đã nhận `className` (`data-table.tsx:77`) nên `tabular-nums` cắm thẳng được, không phải sửa `Td` — sửa `Td` sẽ đụng mọi bảng khác.

- [ ] **Step 2: Tạo trang**

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { FilterBar, FilterField, FilterGrid } from '../../../components/ui/filter-bar';
import { Select } from '../../../components/ui/form';
import { PageHeader } from '../../../components/ui/page-header';
import { LecturersTable } from '../../../components/statistics/lecturers-table';
import { SubjectsTable } from '../../../components/statistics/subjects-table';
import { apiFetch } from '../../../lib/api';
import {
  buildStatisticsQuery,
  parseStatisticsView,
  STATISTICS_TABS,
  type StatisticsTabKey,
} from '../../../lib/statistics-view';
import type {
  ClassStatistics,
  DepartmentStatistics,
  LecturerStatistics,
  StudentFilterOptions,
  SubjectStatistics,
} from '../../../lib/types';

// Dùng chung queryKey với /students và /alerts nên danh mục kỳ chỉ tải một lần.
const FILTER_OPTIONS_STALE_MS = 5 * 60_000;

function StatisticsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { tab, term } = parseStatisticsView(params);

  function setView(patch: { tab?: StatisticsTabKey; term?: string | null }) {
    const next = new URLSearchParams(params.toString());
    if (patch.tab) next.set('tab', patch.tab);
    if (patch.term !== undefined) {
      if (patch.term) next.set('term', patch.term);
      else next.delete('term');
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const options = useQuery({
    queryKey: ['student-filter-options'],
    queryFn: () => apiFetch<StudentFilterOptions>('/students/filter-options'),
    staleTime: FILTER_OPTIONS_STALE_MS,
  });

  const active = STATISTICS_TABS.find((item) => item.key === tab) ?? STATISTICS_TABS[0];

  // Một truy vấn duy nhất theo tab đang mở: đổi tab không tải lại ba bảng kia.
  const stats = useQuery({
    queryKey: ['statistics', tab, term],
    queryFn: () =>
      apiFetch<
        ClassStatistics[] | DepartmentStatistics[] | SubjectStatistics[] | LecturerStatistics[]
      >(`${active.endpoint}${buildStatisticsQuery(term)}`),
  });

  return (
    <>
      <PageHeader
        title="Thống kê"
        description="Số liệu học vụ theo lớp học phần, bộ môn, môn học và giáo viên — trong phạm vi bạn được phép truy cập."
      />

      <FilterBar label="Bộ lọc thống kê" onSubmit={(event) => event.preventDefault()}>
        <FilterGrid>
          <FilterField label="Học kỳ" htmlFor="stats-term">
            <Select
              id="stats-term"
              value={term}
              onChange={(event) => setView({ term: event.target.value || null })}
            >
              <option value="">Tất cả học kỳ</option>
              {(options.data?.terms ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </FilterField>
        </FilterGrid>
      </FilterBar>

      <div role="tablist" aria-label="Chiều thống kê" className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {STATISTICS_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setView({ tab: item.key })}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-[var(--duration-fast)] ${
              tab === item.key
                ? 'border-fpt-orange text-fpt-orange-600'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'subjects' ? (
        <SubjectsTable
          rows={(stats.data as SubjectStatistics[]) ?? []}
          isLoading={stats.isLoading}
        />
      ) : null}
      {tab === 'lecturers' ? (
        <LecturersTable
          rows={(stats.data as LecturerStatistics[]) ?? []}
          isLoading={stats.isLoading}
        />
      ) : null}
      {/* Hai tab lớp học phần và bộ môn: dựng bảng theo đúng khuôn hai bảng
          đang có trong dashboard/page.tsx — mở file đó ra copy phần <DataTable>
          tương ứng, đừng phát minh cột mới. */}
    </>
  );
}

export default function StatisticsPage() {
  // useSearchParams bắt buộc phải nằm trong Suspense ở App Router.
  return (
    <Suspense fallback={null}>
      <StatisticsPageContent />
    </Suspense>
  );
}
```

Ở bước này mở `apps/web/src/app/(dashboard)/dashboard/page.tsx` lấy nguyên hai khối `<DataTable>` cho lớp học phần và bộ môn, đưa vào hai component `classes-table.tsx` và `departments-table.tsx` cùng thư mục `components/statistics/`, rồi cắm vào chỗ comment. Dashboard vẫn giữ bản của nó — Task 7 mới đụng tới dashboard.

- [ ] **Step 3: Kiểm tra kiểu và lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sạch. Lỗi hay gặp: `Select` nằm ở `components/ui/form`, không phải `@fcare/ui-kit`.

- [ ] **Step 4: Xem thật trên trình duyệt**

Dev server thường đã chạy sẵn; kiểm tra bằng `lsof -ti :3000` trước, chỉ chạy `pnpm dev` nếu chưa có. Đăng nhập `admin` / `Fcare@123`, ký cam kết, mở `/statistics`. Xác nhận: bốn tab đổi được, đổi tab và đổi kỳ đều ghi vào URL, tải lại trang giữ nguyên thứ đang xem, bảng rỗng hiện thông điệp chứ không phải khoảng trắng.

- [ ] **Step 5: Kiểm tra bằng tài khoản giảng viên (RULE 2)**

Đăng nhập bằng một tài khoản LECTURER, mở `/statistics?tab=lecturers`. **Phải chỉ thấy đúng một dòng của chính họ.** Thấy nhiều hơn một dòng nghĩa là `lecturerStatsScope` bị bỏ qua ở đâu đó — dừng lại và sửa trước khi đi tiếp.

- [ ] **Step 6: Commit** *(chỉ khi người dùng đã cho phép)*

```bash
git add apps/web/src/app apps/web/src/components/statistics
git commit -m "feat: them trang thong ke 4 chieu"
```

---

### Task 7: Đường vào trang thống kê

**Files:**
- Modify: `apps/web/src/components/dashboard/sidebar.tsx` (mảng `TOP_ITEMS`, khoảng dòng 17-21)
- Modify: `apps/web/src/app/(dashboard)/dashboard/page.tsx` (thêm liên kết)

- [ ] **Step 1: Thêm mục sidebar**

Vào `TOP_ITEMS`, sau mục Cảnh báo:

```ts
  { href: '/statistics', label: 'Thống kê', icon: '◈', visible: () => true },
```

`visible: () => true` là đúng: cả sáu vai trò đều đã `can('read', 'Statistics')` trong `apps/api/src/casl/ability.factory.ts`, nội dung từng người thấy do phạm vi phía service cắt.

- [ ] **Step 2: Thêm liên kết từ dashboard**

Dưới hai bảng nhúng sẵn trong `dashboard/page.tsx`, thêm một liên kết sang trang đầy đủ. Dùng đúng khuôn liên kết đã có ở dòng 99 của file đó (`decoration-fpt-orange`, `outline-fpt-blue`) — **không** dùng `fpt-orange-300` hay `fpt-blue-600`, hai token này không tồn tại và sẽ im lặng không ăn:

```tsx
<Link
  href="/statistics"
  className="rounded-sm underline decoration-fpt-orange decoration-2 underline-offset-4 transition-colors hover:text-fpt-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue"
>
  Xem thống kê chi tiết →
</Link>
```

Không xóa hay sửa hai bảng đang có trong dashboard.

- [ ] **Step 3: Chạy toàn bộ cổng hoàn thành**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: tất cả xanh. **Bỏ qua `pnpm build`** nếu `lsof -ti :3000` cho thấy `next dev` đang chạy; nếu không có gì giữ cổng thì chạy thêm `pnpm build`.

- [ ] **Step 4: Kiểm lại trên trình duyệt**

Mục "Thống kê" hiện trên sidebar và đang được tô sáng khi đứng ở `/statistics`; liên kết từ dashboard sang được.

- [ ] **Step 5: Commit** *(chỉ khi người dùng đã cho phép)*

```bash
git add apps/web/src
git commit -m "feat: them loi vao trang thong ke tu sidebar va dashboard"
```

---

## Sau khi xong

Giai đoạn 1 hoàn tất và dùng được độc lập. Giai đoạn 2 (chat nội bộ, mục 4 của spec) sẽ có kế hoạch riêng — không bắt đầu khi giai đoạn 1 chưa qua cổng `pnpm typecheck && pnpm lint && pnpm test`.
