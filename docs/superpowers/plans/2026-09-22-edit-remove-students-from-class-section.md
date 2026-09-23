# Quản Lý Sinh Viên Lớp Học Phần: Thêm, Xóa, Sửa (Class Section Student Management: Add, Edit, Remove) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép cán bộ Đào tạo (`TRAINING_OFFICER`) và Quản trị viên (`ADMIN`) thực hiện đầy đủ các thao tác Thêm, Sửa, Xóa sinh viên ra khỏi lớp học phần đã phân công tại trang `http://localhost:3000/master-data/class-sections` và trang Bảng điểm chi tiết `http://localhost:3000/class-sections/:id/grades`.

**Architecture:**
- **Backend NestJS**:
  - `DELETE /class-sections/:id/enrollments/:enrollmentId`: Xóa bản ghi ghi danh (`Enrollment`) của sinh viên khỏi lớp học phần. Ghi nhận `AuditLog` (`SECTION_STUDENT_REMOVE`), giảm sĩ số lớp. Không xóa hồ sơ sinh viên gốc (`Student`) để bảo toàn dữ liệu nếu sinh viên đang học các môn khác.
  - `PATCH /class-sections/:id/enrollments/:enrollmentId`: Chỉnh sửa thông tin sinh viên/ghi danh trong lớp (họ và tên sinh viên `fullName`, điểm tổng kết `totalScore`, kết quả `result: IN_PROGRESS | PASS | FAIL`). Ghi nhận `AuditLog` (`SECTION_STUDENT_UPDATE`).
- **Frontend Next.js**:
  - `SectionGradesView` (`/class-sections/:id/grades`): Bổ sung cột "Thao tác" với 2 nút: `Sửa` (mở modal chỉnh sửa họ tên, điểm, kết quả) và `Xóa` (mở modal xác nhận xóa sinh viên khỏi lớp học phần).
  - `SectionStudentsRosterModal` (tại `/master-data/class-sections`): Nhấp vào cột "Sĩ số" hoặc nút "DS Sinh viên" sẽ mở modal danh sách sinh viên hiện có trong lớp, cho phép tìm kiếm nhanh, xem điểm, gọi chức năng `+ Thêm SV`, `Sửa` hoặc `Xóa khỏi lớp` ngay tại chỗ mà không cần chuyển trang.
  - Tự động invalidate các cache query `['class-sections']` và `['section-grades', sectionId]` để cập nhật sĩ số và bảng danh sách ngay tức thì.

**Tech Stack:** NestJS, Prisma ORM, Next.js 15, React 19, @tanstack/react-query, TailwindCSS 4, @fcare/ui-kit, Jest, Vitest.

## Global Constraints

- Tuân thủ RULE 1: Không xử lý thông tin cá nhân PII (CCCD, SĐT, Email, Địa chỉ).
- Tuân thủ RULE 2: Phân quyền chặt chẽ (`canManage` -> `ADMIN` và `TRAINING_OFFICER`).
- Khi xóa sinh viên khỏi lớp học phần: Chỉ xóa quan hệ `Enrollment`, tuyệt đối không `DELETE` bản ghi `Student` trong bảng `students`.
- Mọi thao tác Xóa và Sửa đều phải ghi log qua `AuditService`.

---

### Task 1: DTO Cho Cập Nhật Sinh Viên / Ghi Danh Trong Lớp Học Phần

**Files:**
- Create: `apps/api/src/modules/master-data/dto/update-section-student.dto.ts`
- Test: `apps/api/src/modules/master-data/dto/update-section-student.dto.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export class UpdateSectionStudentDto {
    fullName?: string;
    totalScore?: number | null;
    result?: EnrollmentResult;
  }
  ```

- [ ] **Step 1: Viết failing test cho `UpdateSectionStudentDto`**

Tạo file `apps/api/src/modules/master-data/dto/update-section-student.dto.spec.ts`:
```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EnrollmentResult } from '@prisma/client';
import { UpdateSectionStudentDto } from './update-section-student.dto';

describe('UpdateSectionStudentDto', () => {
  it('hợp lệ khi truyền họ tên hoặc điểm hợp lệ', async () => {
    const dto = plainToInstance(UpdateSectionStudentDto, {
      fullName: 'Hoàng Lê Minh Sang',
      totalScore: 8.5,
      result: EnrollmentResult.PASS,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('báo lỗi khi điểm tổng kết vượt quá thang điểm 0..10', async () => {
    const dto = plainToInstance(UpdateSectionStudentDto, {
      totalScore: 12,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/dto/update-section-student.dto.spec.ts`
Expected: FAIL với lỗi "Cannot find module './update-section-student.dto'".

- [ ] **Step 3: Triển khai DTO**

Tạo file `apps/api/src/modules/master-data/dto/update-section-student.dto.ts`:
```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EnrollmentResult } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSectionStudentDto {
  @ApiPropertyOptional({
    example: 'Hoàng Lê Minh Sang',
    description: 'Họ và tên sinh viên (cập nhật nếu sai sót)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({
    example: 8.5,
    description: 'Điểm tổng kết (thang điểm 0..10)',
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10)
  totalScore?: number | null;

  @ApiPropertyOptional({
    enum: EnrollmentResult,
    example: EnrollmentResult.PASS,
    description: 'Kết quả học phần',
  })
  @IsOptional()
  @IsEnum(EnrollmentResult)
  result?: EnrollmentResult;
}
```

- [ ] **Step 4: Chạy test để xác nhận test thành công**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/dto/update-section-student.dto.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit task 1**

```bash
git add apps/api/src/modules/master-data/dto/update-section-student.dto.ts apps/api/src/modules/master-data/dto/update-section-student.dto.spec.ts
git commit -m "feat(master-data): add UpdateSectionStudentDto for class section student updates"
```

---

### Task 2: Nghiệp Vụ Xóa & Sửa Sinh Viên Trong ClassSectionsService

**Files:**
- Modify: `apps/api/src/modules/master-data/class-sections.service.ts`
- Test: `apps/api/src/modules/master-data/class-sections.service.spec.ts`

**Interfaces:**
- Consumes: `UpdateSectionStudentDto`, `AuthUser`, `PrismaService`, `AuditService`
- Produces:
  ```ts
  removeStudentFromSection(
    user: AuthUser,
    sectionId: string,
    enrollmentId: string,
  ): Promise<{ success: boolean; removed: boolean; studentCode: string; fullName: string }>;

  updateStudentInSection(
    user: AuthUser,
    sectionId: string,
    enrollmentId: string,
    dto: UpdateSectionStudentDto,
  ): Promise<{ success: boolean; updated: boolean; studentCode: string; fullName: string }>;
  ```

- [ ] **Step 1: Viết failing test trong `class-sections.service.spec.ts`**

Mở `apps/api/src/modules/master-data/class-sections.service.spec.ts` và thêm describe:
```ts
describe('ClassSectionsService — xóa & sửa sinh viên trong lớp học phần', () => {
  beforeEach(() => jest.clearAllMocks());

  it('xóa sinh viên ra khỏi lớp: xóa enrollment và ghi audit log', async () => {
    const { prisma, findUnique } = makePrisma();
    const enrollmentDelete = jest.fn().mockResolvedValue({});
    findUnique.mockResolvedValueOnce({
      id: 'sec-1',
      code: 'AI21301-ITA106',
    });
    prisma.enrollment.findFirst = jest.fn().mockResolvedValue({
      id: 'enr-1',
      studentId: 'std-1',
      classSectionId: 'sec-1',
      student: { studentCode: 'PK04346', fullName: 'Hoàng Lê Minh Sang' },
    });
    prisma.enrollment.delete = enrollmentDelete;

    const service = new ClassSectionsService(prisma, audit);
    const result = await service.removeStudentFromSection(user, 'sec-1', 'enr-1');

    expect(result.removed).toBe(true);
    expect(result.studentCode).toBe('PK04346');
    expect(enrollmentDelete).toHaveBeenCalledWith({ where: { id: 'enr-1' } });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SECTION_STUDENT_REMOVE',
        entityId: 'sec-1',
      }),
    );
  });

  it('sửa thông tin sinh viên và điểm trong lớp', async () => {
    const { prisma, findUnique } = makePrisma();
    findUnique.mockResolvedValueOnce({
      id: 'sec-1',
      code: 'AI21301-ITA106',
    });
    prisma.enrollment.findFirst = jest.fn().mockResolvedValue({
      id: 'enr-1',
      studentId: 'std-1',
      classSectionId: 'sec-1',
      totalScore: 5,
      result: EnrollmentResult.IN_PROGRESS,
      student: { id: 'std-1', studentCode: 'PK04346', fullName: 'Cũ' },
    });
    const studentUpdate = jest.fn().mockResolvedValue({});
    const enrollmentUpdate = jest.fn().mockResolvedValue({});
    (prisma as unknown as Record<string, unknown>).student = { update: studentUpdate };
    prisma.enrollment.update = enrollmentUpdate;

    const service = new ClassSectionsService(prisma, audit);
    const result = await service.updateStudentInSection(user, 'sec-1', 'enr-1', {
      fullName: 'Hoàng Lê Minh Sang Mới',
      totalScore: 9,
      result: EnrollmentResult.PASS,
    });

    expect(result.updated).toBe(true);
    expect(studentUpdate).toHaveBeenCalledWith({
      where: { id: 'std-1' },
      data: { fullName: 'Hoàng Lê Minh Sang Mới' },
    });
    expect(enrollmentUpdate).toHaveBeenCalledWith({
      where: { id: 'enr-1' },
      data: expect.objectContaining({ totalScore: 9, result: EnrollmentResult.PASS }),
    });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/class-sections.service.spec.ts`
Expected: FAIL với lỗi "service.removeStudentFromSection is not a function".

- [ ] **Step 3: Triển khai trong `class-sections.service.ts`**

Mở `apps/api/src/modules/master-data/class-sections.service.ts`:
1. Import `UpdateSectionStudentDto` từ `./dto/update-section-student.dto`.
2. Bổ sung 2 phương thức:
```ts
  async removeStudentFromSection(
    user: AuthUser,
    sectionId: string,
    enrollmentId: string,
  ) {
    const section = await this.prisma.classSection.findUnique({
      where: { id: sectionId },
      select: { id: true, code: true },
    });
    if (!section) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, classSectionId: sectionId },
      include: {
        student: { select: { id: true, studentCode: true, fullName: true } },
      },
    });

    if (!enrollment) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong lớp học phần này.',
      );
    }

    await this.prisma.enrollment.delete({
      where: { id: enrollmentId },
    });

    await this.audit.log({
      staffId: user.id,
      action: 'SECTION_STUDENT_REMOVE',
      entity: 'ClassSection',
      entityId: sectionId,
      metadata: {
        enrollmentId,
        studentId: enrollment.student.id,
        studentCode: enrollment.student.studentCode,
        fullName: enrollment.student.fullName,
        sectionCode: section.code,
      },
    });

    return {
      success: true,
      removed: true,
      studentCode: enrollment.student.studentCode,
      fullName: enrollment.student.fullName,
    };
  }

  async updateStudentInSection(
    user: AuthUser,
    sectionId: string,
    enrollmentId: string,
    dto: UpdateSectionStudentDto,
  ) {
    const section = await this.prisma.classSection.findUnique({
      where: { id: sectionId },
      select: { id: true, code: true },
    });
    if (!section) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, classSectionId: sectionId },
      include: {
        student: { select: { id: true, studentCode: true, fullName: true } },
      },
    });

    if (!enrollment) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong lớp học phần này.',
      );
    }

    // Nếu có họ tên mới và khác họ tên cũ -> cập nhật Student
    let updatedFullName = enrollment.student.fullName;
    if (dto.fullName && dto.fullName.trim() && dto.fullName.trim() !== enrollment.student.fullName) {
      updatedFullName = dto.fullName.trim();
      await this.prisma.student.update({
        where: { id: enrollment.student.id },
        data: { fullName: updatedFullName },
      });
    }

    // Cập nhật Enrollment
    const enrollmentData: { totalScore?: number | null; result?: EnrollmentResult } = {};
    if (dto.totalScore !== undefined) {
      enrollmentData.totalScore = dto.totalScore;
    }
    if (dto.result !== undefined) {
      enrollmentData.result = dto.result;
    }

    if (Object.keys(enrollmentData).length > 0) {
      await this.prisma.enrollment.update({
        where: { id: enrollmentId },
        data: enrollmentData,
      });
    }

    await this.audit.log({
      staffId: user.id,
      action: 'SECTION_STUDENT_UPDATE',
      entity: 'ClassSection',
      entityId: sectionId,
      metadata: {
        enrollmentId,
        studentId: enrollment.student.id,
        studentCode: enrollment.student.studentCode,
        changes: dto,
      },
    });

    return {
      success: true,
      updated: true,
      studentCode: enrollment.student.studentCode,
      fullName: updatedFullName,
    };
  }
```

- [ ] **Step 4: Chạy test để xác nhận test thành công**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/class-sections.service.spec.ts`
Expected: PASS toàn bộ test suites.

- [ ] **Step 5: Commit task 2**

```bash
git add apps/api/src/modules/master-data/class-sections.service.ts apps/api/src/modules/master-data/class-sections.service.spec.ts
git commit -m "feat(master-data): implement removeStudentFromSection and updateStudentInSection"
```

---

### Task 3: Endpoints Trong ClassSectionsController

**Files:**
- Modify: `apps/api/src/modules/master-data/master-data.controller.ts`
- Test: `apps/api/src/modules/master-data/class-sections.controller.spec.ts`

**Interfaces:**
- Produces:
  - `DELETE /class-sections/:id/enrollments/:enrollmentId`
  - `PATCH /class-sections/:id/enrollments/:enrollmentId`

- [ ] **Step 1: Viết failing test trong `class-sections.controller.spec.ts`**

Mở `apps/api/src/modules/master-data/class-sections.controller.spec.ts`:
Thêm test case cho `removeStudentFromSection` và `updateStudentInSection`.

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/class-sections.controller.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Thêm các endpoint vào `ClassSectionsController`**

Mở `apps/api/src/modules/master-data/master-data.controller.ts`:
```ts
  @Delete(':id/enrollments/:enrollmentId')
  @CheckPolicies(canManage)
  removeStudentFromSection(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
  ) {
    return this.service.removeStudentFromSection(user, id, enrollmentId);
  }

  @Patch(':id/enrollments/:enrollmentId')
  @CheckPolicies(canManage)
  updateStudentInSection(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: UpdateSectionStudentDto,
  ) {
    return this.service.updateStudentInSection(user, id, enrollmentId, dto);
  }
```

- [ ] **Step 4: Chạy test để xác nhận test thành công**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/class-sections.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit task 3**

```bash
git add apps/api/src/modules/master-data/master-data.controller.ts apps/api/src/modules/master-data/class-sections.controller.spec.ts
git commit -m "feat(master-data): add endpoints for deleting and editing students in class sections"
```

---

### Task 4: Frontend Modals: Sửa & Xóa Sinh Viên Khỏi Lớp

**Files:**
- Create: `apps/web/src/components/master-data/edit-section-student-modal.tsx`
- Create: `apps/web/src/components/master-data/confirm-remove-student-modal.tsx`
- Test: `apps/web/src/components/master-data/edit-section-student-modal.test.ts`
- Test: `apps/web/src/components/master-data/confirm-remove-student-modal.test.ts`

**Interfaces:**
- Produces:
  ```tsx
  export interface EditSectionStudentModalProps {
    open: boolean;
    sectionId: string;
    student: SectionGradeRow | null;
    onClose: () => void;
    onSuccess: () => void;
  }
  export function EditSectionStudentModal(props: EditSectionStudentModalProps): React.JSX.Element | null;

  export interface ConfirmRemoveStudentModalProps {
    open: boolean;
    sectionId: string;
    sectionCode?: string;
    student: SectionGradeRow | null;
    onClose: () => void;
    onSuccess: () => void;
  }
  export function ConfirmRemoveStudentModal(props: ConfirmRemoveStudentModalProps): React.JSX.Element | null;
  ```

- [ ] **Step 1: Viết test cho các modal**

Tạo `edit-section-student-modal.test.ts` và `confirm-remove-student-modal.test.ts`.

- [ ] **Step 2: Cài đặt `EditSectionStudentModal`**

Tạo `apps/web/src/components/master-data/edit-section-student-modal.tsx`:
- Hộp thoại sửa: MSSV (disabled), Họ và tên (input text), Điểm tổng kết (input number 0..10), Kết quả (Select: Đang học, Đạt, Không đạt).
- Nút "Lưu thay đổi", xử lý gọi API `PATCH /class-sections/:id/enrollments/:enrollmentId`.

- [ ] **Step 3: Cài đặt `ConfirmRemoveStudentModal`**

Tạo `apps/web/src/components/master-data/confirm-remove-student-modal.tsx`:
- Hộp thoại cảnh báo: "Bạn có chắc chắn muốn xóa sinh viên [MSSV] - [Họ tên] ra khỏi lớp học phần [Mã lớp] không? Sinh viên sẽ không còn trong danh sách lớp này, nhưng hồ sơ sinh viên trong hệ thống vẫn được lưu trữ."
- Nút "Hủy" và nút "Xóa khỏi lớp" (variant danger), gọi API `DELETE /class-sections/:id/enrollments/:enrollmentId`.

- [ ] **Step 4: Chạy test kiểm tra modal**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/web test`
Expected: PASS.

- [ ] **Step 5: Commit task 4**

```bash
git add apps/web/src/components/master-data/edit-section-student-modal.tsx apps/web/src/components/master-data/confirm-remove-student-modal.tsx apps/web/src/components/master-data/edit-section-student-modal.test.ts apps/web/src/components/master-data/confirm-remove-student-modal.test.ts
git commit -m "feat(web): add EditSectionStudentModal and ConfirmRemoveStudentModal components"
```

---

### Task 5: Modal Quản Lý Danh Sách Sinh Viên Cho Lớp Học Phần (SectionStudentsRosterModal)

**Files:**
- Create: `apps/web/src/components/master-data/section-students-roster-modal.tsx`
- Test: `apps/web/src/components/master-data/section-students-roster-modal.test.ts`

**Interfaces:**
- Consumes: `ClassSection`, `DataTable`, `useQuery(['section-grades', sectionId])`, `AddStudentsModal`, `EditSectionStudentModal`, `ConfirmRemoveStudentModal`
- Produces:
  ```tsx
  export interface SectionStudentsRosterModalProps {
    open: boolean;
    section: ClassSection | null;
    onClose: () => void;
  }
  export function SectionStudentsRosterModal(props: SectionStudentsRosterModalProps): React.JSX.Element | null;
  ```

- [ ] **Step 1: Viết test cho `SectionStudentsRosterModal`**

- [ ] **Step 2: Cài đặt `SectionStudentsRosterModal`**

Modal hiển thị danh sách toàn bộ sinh viên trong lớp học phần với:
- Header: Mã lớp, Môn học, Học kỳ, Tổng sĩ số hiện tại.
- Nút bấm: `+ Thêm sinh viên` (mở `AddStudentsModal`).
- Ô tìm kiếm nhanh sinh viên (theo MSSV hoặc Họ tên).
- Bảng danh sách sinh viên: `STT | MSSV | Họ tên | Điểm tổng kết | Kết quả | Thao tác`.
- Cột thao tác gồm:
  - Nút `Sửa`: kích hoạt `EditSectionStudentModal`.
  - Nút `Xóa`: kích hoạt `ConfirmRemoveStudentModal`.
- Phân trang 10 sinh viên / trang.

- [ ] **Step 3: Chạy test để xác nhận test thành công**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/web test src/components/master-data/section-students-roster-modal.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit task 5**

```bash
git add apps/web/src/components/master-data/section-students-roster-modal.tsx apps/web/src/components/master-data/section-students-roster-modal.test.ts
git commit -m "feat(web): create SectionStudentsRosterModal for managing section students in master data"
```

---

### Task 6: Tích Hợp Vào Bảng Điểm & Bảng Danh Mục Lớp Học Phần

**Files:**
- Modify: `apps/web/src/components/master-data/section-grades-view.tsx`
- Modify: `apps/web/src/components/master-data/catalog-tables.tsx`
- Modify: `apps/web/src/components/master-data/master-data-view.tsx`

**Interfaces:**
- Cột "Sĩ số" tại `catalog-tables.tsx` có thể nhấp chuột hoặc thêm nút "DS Sinh viên" tại `master-data-view.tsx`.
- Cột "Thao tác" tại `section-grades-view.tsx` bổ sung nút `Sửa` và `Xóa khỏi lớp` cho từng sinh viên.

- [ ] **Step 1: Cập nhật `section-grades-view.tsx`**

Thêm cột `Thao tác` vào bảng điểm khi `canManage`:
- Nút `Sửa`: mở `EditSectionStudentModal`.
- Nút `Xóa`: mở `ConfirmRemoveStudentModal`.
Sau khi sửa hoặc xóa thành công, query `['section-grades', sectionId]` và `['class-sections']` được tự động invalidate.

- [ ] **Step 2: Cập nhật `catalog-tables.tsx` và `master-data-view.tsx`**

Biến ô hiển thị `Sĩ số` thành nút bấm tương tác (hoặc thêm nút `DS SV` trong cột Thao tác) mở `SectionStudentsRosterModal`.

- [ ] **Step 3: Chạy toàn bộ test suites của web**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/web test`
Expected: PASS toàn bộ test files.

- [ ] **Step 4: Commit task 6**

```bash
git add apps/web/src/components/master-data/section-grades-view.tsx apps/web/src/components/master-data/catalog-tables.tsx apps/web/src/components/master-data/master-data-view.tsx
git commit -m "feat(web): integrate student edit and remove actions into section grades view and catalog tables"
```

---

### Task 7: Kiểm Tra Tích Hợp Toàn Diện & Typecheck

**Files:**
- Test all components and monorepo typecheck

- [ ] **Step 1: Chạy test API**
`export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test`

- [ ] **Step 2: Chạy test Web**
`export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/web test`

- [ ] **Step 3: Chạy Typecheck Monorepo**
`export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm run typecheck`

- [ ] **Step 4: Cập nhật GitNexus Index**
`export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && node .gitnexus/run.cjs analyze`

- [ ] **Step 5: Commit hoàn tất**
```bash
git add .
git commit -m "chore: verify tests and typecheck for class section student management (add, edit, remove)"
```
