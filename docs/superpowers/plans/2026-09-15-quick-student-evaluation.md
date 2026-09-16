# Quick Student Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm nút "Nhận xét" trực tiếp trên giao diện danh sách sinh viên (`/students?term=...&sectionId=...`) giúp giảng viên nhanh chóng đánh giá DRS / ghi chú sinh viên mà không cần rời khỏi trang.

**Architecture:** Mở rộng API `GET /evaluations` nhận thêm tham số lọc `classSectionId` để trang danh sách sinh viên có thể lấy trạng thái nhận xét của cả lớp trong 1 request. Cập nhật `EvaluationForm` hỗ trợ `initialSectionId`. Xây dựng `QuickEvaluationModal` tải dữ liệu lớp/nhận xét của sinh viên và nhúng `EvaluationForm`. Thêm cột "Thao tác" với nút "Nhận xét" / "Sửa nhận xét" trên bảng sinh viên tại `apps/web/src/app/(dashboard)/students/page.tsx`.

**Tech Stack:** Next.js (App Router), React Query (@tanstack/react-query), NestJS, Prisma, TailwindCSS, @fcare/ui-kit, @fcare/shared-types.

## Global Constraints

- Không tự ý commit git khi người dùng chưa yêu cầu (CLAUDE.md: "Không commit khi user chưa yêu cầu").
- Tuân thủ RULE 1 (Bảo vệ thông tin cá nhân): Không ghi hoặc hiển thị thông tin liên hệ riêng tư (SĐT, email cá nhân) trong ghi chú nhận xét.
- Tuân thủ RULE 2 (Phạm vi dữ liệu): Giảng viên chỉ được đánh giá sinh viên thuộc lớp học phần mà mình phụ trách; Trưởng bộ môn và Admin có quyền đánh giá theo phạm vi quy định.
- Giữ nguyên các hàm, props hiện có của `EvaluationForm` và `EvaluationsTab` để tránh phá vỡ giao diện chi tiết sinh viên (`/students/[id]`).

---

### Task 1: Backend API Support for Filtering Evaluations by ClassSection

**Files:**
- Modify: `apps/api/src/modules/evaluations/dto/evaluation.dto.ts:85-97`
- Modify: `apps/api/src/modules/evaluations/evaluations.service.ts:33-42`
- Test: `apps/api/src/modules/evaluations/evaluations.service.spec.ts`

**Interfaces:**
- Consumes: `ListEvaluationsQuery` dto, `PrismaService.evaluation.findMany`
- Produces: `ListEvaluationsQuery.classSectionId?: string`, `EvaluationsService.list(user, query)` filters by `classSectionId`

- [ ] **Step 1: Write the failing unit test**

Thêm test case vào `apps/api/src/modules/evaluations/evaluations.service.spec.ts`:

```typescript
describe('EvaluationsService.list', () => {
  it('lọc theo classSectionId khi được cung cấp', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      evaluation: { findMany },
    });
    const service = new EvaluationsService(prisma, makeAnalyses().service);
    await service.list(lecturer, {
      term: 'FA26',
      classSectionId: 'sec-123',
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          term: 'FA26',
          classSectionId: 'sec-123',
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fcare/api test evaluations.service.spec.ts`
Expected: FAIL do `classSectionId` chưa được đưa vào `where` của `findMany`.

- [ ] **Step 3: Update `evaluation.dto.ts` and `evaluations.service.ts`**

Trong `apps/api/src/modules/evaluations/dto/evaluation.dto.ts`:
```typescript
export class ListEvaluationsQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classSectionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  term?: string;
}
```

Trong `apps/api/src/modules/evaluations/evaluations.service.ts`:
```typescript
  list(user: AuthUser, query: ListEvaluationsQuery) {
    return this.prisma.evaluation.findMany({
      where: {
        studentId: query.studentId,
        term: query.term,
        ...(query.classSectionId ? { classSectionId: query.classSectionId } : {}),
        student: studentScope(user),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        criteria: { select: { criterion: true } },
        classSection: {
          select: {
            id: true,
            code: true,
            term: true,
            subject: { select: { code: true, name: true } },
          },
        },
        lecturer: { select: { id: true, staffCode: true, fullName: true } },
        student: {
          select: {
            id: true,
            studentCode: true,
            fullName: true,
            classCode: true,
          },
        },
      },
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fcare/api test evaluations.service.spec.ts`
Expected: PASS

---

### Task 2: Align Mock Registry in `imports.service.spec.ts`

**Files:**
- Modify: `apps/api/src/modules/imports/imports.service.spec.ts:143-146`

**Interfaces:**
- Consumes: `ImportsService.register`
- Produces: Registration of `ImportKind.SECTION_LIST` with mock parser/committer so unmapped subjects test runs cleanly.

- [ ] **Step 1: Update `beforeEach` in `imports.service.spec.ts`**

Trong `apps/api/src/modules/imports/imports.service.spec.ts`:
```typescript
    service = new ImportsService(prisma as never, audit as never);
    service.register(ImportKind.CATALOG, parser, committer);
    service.register(ImportKind.SECTION_LIST, parser, committer);
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @fcare/api test imports.service.spec.ts`
Expected: PASS all tests in `imports.service.spec.ts`.

---

### Task 3: Support `initialSectionId` in `EvaluationForm`

**Files:**
- Modify: `apps/web/src/components/students/evaluation-form.tsx:131-205`

**Interfaces:**
- Consumes: `EvaluationFormProps.initialSectionId?: string`
- Produces: Pre-selected class section on form mount, automatic loading of existing evaluation when `initialSectionId` is provided or when only 1 section is available.

- [ ] **Step 1: Update `EvaluationFormProps` and initial state logic**

Cập nhật `EvaluationFormProps`:
```typescript
interface EvaluationFormProps {
  studentId: string;
  term: string;
  /** Lớp học phần người dùng được nhận xét trong kỳ (đã lọc ở tầng gọi). */
  sections: ClassSection[];
  /**
   * Nhận xét của chính người dùng trong kỳ. Mỗi lớp học phần chỉ có một bản
   * (@@unique ở API): chọn lớp đã nhận xét thì form chuyển sang sửa bản cũ,
   * không tạo thêm — trước đây gửi lại là dính lỗi trùng.
   */
  ownEvaluations: Evaluation[];
  onSaved: (term: string) => void;
  onCancel: () => void;
  /** ID lớp học phần chọn sẵn khi mở modal từ danh sách lớp. */
  initialSectionId?: string;
}
```

Cập nhật khởi tạo state trong `EvaluationForm`:
```typescript
export function EvaluationForm({
  studentId,
  term,
  sections,
  ownEvaluations,
  onSaved,
  onCancel,
  initialSectionId,
}: EvaluationFormProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const defaultSectionId =
    (initialSectionId && sections.some((s) => s.id === initialSectionId)
      ? initialSectionId
      : '') ||
    (sections.length === 1 ? sections[0]?.id ?? '' : '');

  const existingInitial = defaultSectionId
    ? ownEvaluations.find((evaluation) => evaluation.classSectionId === defaultSectionId)
    : undefined;

  const [classSectionId, setClassSectionId] = useState(defaultSectionId);
  const [academicBand, setAcademicBand] = useState<ScoreBand>(
    existingInitial ? scoreBand(existingInitial.academicScore) : DEFAULT_BAND,
  );
  const [attitudeBand, setAttitudeBand] = useState<ScoreBand>(
    existingInitial ? scoreBand(existingInitial.attitudeScore) : DEFAULT_BAND,
  );
  const [criteria, setCriteria] = useState<ReadonlySet<EvaluationCriterion>>(
    new Set(existingInitial ? existingInitial.criteria.map((mark) => mark.criterion) : []),
  );
```

Cập nhật input keys để đảm bảo form re-render giá trị đúng khi `classSectionId` thay đổi:
```typescript
        <Input
          key={`absent-${classSectionId}-${existing?.id ?? 'moi'}`}
          id="absentSessions"
          name="absentSessions"
          type="number"
          min={0}
          max={100}
          defaultValue={existing?.absentSessions ?? ''}
        />
...
        <Textarea
          key={`note-${classSectionId}-${existing?.id ?? 'moi'}`}
          id="note"
          name="note"
          placeholder="Mô tả tình huống cụ thể…"
          defaultValue={existing?.note ?? ''}
        />
```

- [ ] **Step 2: Verify component builds cleanly**

Run: `pnpm --filter @fcare/web typecheck` (hoặc build)
Expected: No type errors.

---

### Task 4: Create `QuickEvaluationModal` Component

**Files:**
- Create: `apps/web/src/components/students/quick-evaluation-modal.tsx`

**Interfaces:**
- Consumes: `Student`, `term`, `sectionId`, `open`, `onClose`, `onSaved`
- Produces: Reusable quick evaluation popup modal with data fetching and `EvaluationForm`.

- [ ] **Step 1: Implement `QuickEvaluationModal`**

Tạo file `apps/web/src/components/students/quick-evaluation-modal.tsx`:
```tsx
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useMe } from '../../lib/hooks';
import type { ClassSection, Enrollment, Evaluation, Student } from '../../lib/types';
import { Modal } from '../ui/modal';
import { EvaluationForm } from './evaluation-form';

interface QuickEvaluationModalProps {
  student: Student | null;
  term: string;
  sectionId?: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (student: Student) => void;
}

export function QuickEvaluationModal({
  student,
  term,
  sectionId,
  open,
  onClose,
  onSaved,
}: QuickEvaluationModalProps) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const studentId = student?.id ?? '';

  const { data: evaluations, isLoading: evaluationsLoading } = useQuery({
    queryKey: ['evaluations', studentId],
    queryFn: () => apiFetch<Evaluation[]>(`/evaluations?studentId=${studentId}`),
    enabled: Boolean(studentId) && open,
  });

  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery({
    queryKey: ['enrollments', studentId],
    queryFn: () => apiFetch<Enrollment[]>(`/enrollments?studentId=${studentId}`),
    enabled: Boolean(studentId) && open,
  });

  if (!student || !open) {
    return null;
  }

  const isLoading = evaluationsLoading || enrollmentsLoading;

  const seesAllSections = me?.user.roles.some((role) =>
    ['HEAD_OF_DEPT', 'ADMIN'].includes(role),
  );

  const sections: ClassSection[] = (enrollments ?? [])
    .map((enrollment) => enrollment.classSection)
    .filter((sec): sec is ClassSection => Boolean(sec))
    .filter((sec) => !term || sec.term === term)
    .filter((sec) => seesAllSections || sec.lecturerId === me?.user.id);

  const ownEvaluations = (evaluations ?? []).filter(
    (evaluation) =>
      (!term || evaluation.term === term) && evaluation.lecturer?.id === me?.user.id,
  );

  return (
    <Modal
      title={`Nhận xét sinh viên: ${student.fullName} (${student.studentCode})`}
      size="lg"
      open={open}
      onClose={onClose}
    >
      <div className="mb-4 rounded-md bg-fpt-blue-50/50 p-3 text-xs text-muted">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <span className="text-ink font-semibold">MSSV:</span> {student.studentCode}
          </div>
          <div>
            <span className="text-ink font-semibold">Lớp:</span> {student.classCode}
          </div>
          <div>
            <span className="text-ink font-semibold">Bộ môn:</span>{' '}
            {student.department?.code ?? '—'}
          </div>
          <div>
            <span className="text-ink font-semibold">Học kỳ:</span> {term || 'Hiện tại'}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted">
          Đang tải dữ liệu lớp học phần và nhận xét…
        </div>
      ) : sections.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted">
          <p className="font-semibold text-ink">Không tìm thấy lớp học phần phù hợp</p>
          <p className="mt-1 text-xs">
            Sinh viên này không có lớp học phần nào do bạn phụ trách trong học kỳ {term || 'này'}.
          </p>
        </div>
      ) : (
        <EvaluationForm
          studentId={student.id}
          term={term}
          sections={sections}
          ownEvaluations={ownEvaluations}
          initialSectionId={sectionId}
          onSaved={async (savedTerm) => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['evaluations'] }),
              queryClient.invalidateQueries({ queryKey: ['students'] }),
            ]);
            onSaved?.(student);
            onClose();
          }}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Verify component builds cleanly**

Run: `pnpm --filter @fcare/web typecheck`
Expected: PASS

---

### Task 5: Add Action Column & Quick Evaluation Button in Students Page

**Files:**
- Modify: `apps/web/src/app/(dashboard)/students/page.tsx`

**Interfaces:**
- Consumes: `canEvaluate`, `QuickEvaluationModal`, `filters.sectionId`, `filters.term`
- Produces: Interactive "Nhận xét" / "Sửa nhận xét" button in student table and instant evaluation modal flow.

- [ ] **Step 1: Update `apps/web/src/app/(dashboard)/students/page.tsx`**

1. Import `QuickEvaluationModal`:
```typescript
import { QuickEvaluationModal } from '../../../components/students/quick-evaluation-modal';
import type { Evaluation } from '../../../lib/types';
```

2. Thêm state và query theo dõi nhận xét của lớp học phần:
```typescript
  const EVALUATION_ROLES = ['LECTURER', 'HEAD_OF_DEPT', 'ADMIN'];
  const canEvaluate = me?.user.roles.some((role) => EVALUATION_ROLES.includes(role)) ?? false;
  const [evaluatingStudent, setEvaluatingStudent] = useState<Student | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Khi đang lọc theo lớp học phần, truy vấn danh sách nhận xét của lớp đó để đánh dấu sinh viên nào đã nhận xét
  const sectionEvaluations = useQuery({
    queryKey: ['evaluations', { classSectionId: filters.sectionId, term: filters.term }],
    queryFn: () =>
      apiFetch<Evaluation[]>(
        `/evaluations?classSectionId=${filters.sectionId}${filters.term ? `&term=${filters.term}` : ''}`,
      ),
    enabled: Boolean(filters.sectionId) && canEvaluate,
  });
```

3. Thêm cột 'Thao tác' vào headers của `DataTable`:
```typescript
      <DataTable
        headers={[
          ...(showSelectColumn ? ['Chọn'] : []),
          'MSSV',
          'Họ tên',
          'Lớp',
          'Ngành',
          'Bộ môn',
          'Ngày sinh',
          'Trạng thái',
          'Cảnh báo mở',
          ...(canEvaluate ? ['Thao tác'] : []),
        ]}
...
```

4. Render nút trong mỗi dòng sinh viên:
```tsx
            {canEvaluate ? (
              <Td>
                {(() => {
                  const existingEval = (sectionEvaluations.data ?? []).find(
                    (ev) =>
                      ev.studentId === student.id &&
                      (me?.user.roles.includes('ADMIN') ||
                        me?.user.roles.includes('HEAD_OF_DEPT') ||
                        ev.lecturer?.id === me?.user.id),
                  );

                  return (
                    <Button
                      type="button"
                      variant="ghost"
                      className={`h-8 px-2.5 text-xs font-semibold transition-colors ${
                        existingEval
                          ? 'border border-emerald-500/30 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border border-fpt-orange/40 bg-fpt-orange-50 text-fpt-orange-700 hover:bg-fpt-orange-100'
                      }`}
                      onClick={() => setEvaluatingStudent(student)}
                      title={existingEval ? 'Chỉnh sửa nhận xét' : 'Thêm nhận xét cho sinh viên'}
                    >
                      {existingEval ? '✓ Sửa nhận xét' : '+ Nhận xét'}
                    </Button>
                  );
                })()}
              </Td>
            ) : null}
```

5. Thêm `QuickEvaluationModal` và thông báo thành công:
```tsx
      {savedNotice ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-opacity animate-in fade-in duration-300">
          {savedNotice}
        </div>
      ) : null}

      <QuickEvaluationModal
        student={evaluatingStudent}
        term={filters.term || currentTerm?.code || ''}
        sectionId={filters.sectionId || undefined}
        open={Boolean(evaluatingStudent)}
        onClose={() => setEvaluatingStudent(null)}
        onSaved={(std) => {
          setSavedNotice(`Đã lưu nhận xét cho sinh viên ${std.fullName} (${std.studentCode})`);
          setTimeout(() => setSavedNotice(null), 4000);
        }}
      />
```

- [ ] **Step 2: Run typecheck and linting**

Run: `pnpm --filter @fcare/web typecheck`
Expected: PASS with 0 errors.

---

### Task 6: Verification and Integration Testing

**Files:**
- Target URL: `http://localhost:3000/students?term=FA26&sectionId=86ae8751-eae9-45e5-901d-0bc7a5d20e30`

- [ ] **Step 1: Verify API endpoint with curl**

Kiểm tra API `GET /evaluations?classSectionId=86ae8751-eae9-45e5-901d-0bc7a5d20e30`:
Run: `curl -s "http://localhost:3001/evaluations?classSectionId=86ae8751-eae9-45e5-901d-0bc7a5d20e30" -H "Authorization: Bearer <TOKEN>"`
Expected: 200 OK với danh sách nhận xét.

- [ ] **Step 2: Browser Verification**

Sử dụng browser subagent điều hướng tới `http://localhost:3000/students?term=FA26&sectionId=86ae8751-eae9-45e5-901d-0bc7a5d20e30`:
1. Kiểm tra cột "Thao tác" hiển thị nút "+ Nhận xét" trên các dòng sinh viên.
2. Click nút "+ Nhận xét" trên sinh viên `PK04913` (Mai Nhữ Như Quỳnh).
3. Modal mở ra với tên sinh viên, mã số, học kỳ `FA26`, và lớp `CH22301-COM109` được chọn mặc định.
4. Chọn thang điểm và nhập ghi chú nhận xét ngắn, click "Lưu nhận xét".
5. Modal đóng, nút trên dòng chuyển thành "✓ Sửa nhận xét" màu xanh ngọc.
6. Click lại nút "✓ Sửa nhận xét", form mở lại với dữ liệu đã nhập chính xác.

- [ ] **Step 3: Run full test suite and detect_changes**

1. Chạy test toàn dự án:
   `pnpm test`
2. Chạy `gitnexus` detect_changes để kiểm tra phạm vi thay đổi:
   `detect_changes()`
