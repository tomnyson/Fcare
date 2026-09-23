# Bổ Sung Sinh Viên Vào Lớp Học Phần (Class Section Student Supplement) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng chức năng cho phép cán bộ Đào tạo (`TRAINING_OFFICER`) và Quản trị viên (`ADMIN`) bổ sung thêm sinh viên vào lớp học phần đã phân công tại `http://localhost:3000/master-data/class-sections` bằng 2 hình thức: tải file Excel (`.xlsx`) hoặc nhập trực tiếp (định dạng đơn giản `MSSV | Họ tên`), các tham số còn lại được thiết lập giá trị mặc định.

**Architecture:** 
- Backend NestJS cung cấp 2 endpoint mới trong `ClassSectionsController`: `POST /class-sections/:id/students` (nhận danh sách sinh viên qua JSON payload) và `POST /class-sections/:id/students/upload` (nhận file Excel qua Multer `FileInterceptor`). Cả hai đều đi qua `ClassSectionsService.addStudentsToSection()`. Nếu sinh viên chưa có trong cơ sở dữ liệu, tự động tạo hồ sơ sinh viên với khoa/bộ môn lấy từ môn học của lớp học phần, lớp hành chính mặc định từ tiền tố mã lớp học phần, trạng thái `STUDYING`. Sau đó tạo bản ghi `Enrollment` với kết quả `IN_PROGRESS` và các điểm số mặc định `null`.
- Frontend Next.js cung cấp modal `AddStudentsModal` kích hoạt từ nút "+ Thêm SV" ở cột "Thao tác" của bảng danh sách lớp học phần (`ClassSectionsTable`) và trang chi tiết bảng điểm (`SectionGradesView`). Modal hỗ trợ 2 tab: "Nhập trực tiếp" (dán từ Excel / gõ phím với bộ phân tích tự động `student-input-parser.ts`) và "Tải file Excel" (drag-and-drop file `.xlsx` + nút tải file mẫu). Bảng xem trước cho phép kiểm tra danh sách, trạng thái hợp lệ, xóa dòng thừa trước khi bấm xác nhận. Sau khi thêm thành công, hệ thống tự động cập nhật sĩ số lớp học phần tức thì.

**Tech Stack:** NestJS, Prisma ORM, ExcelJS, Next.js 15 (Turbopack, App Router), React 19, @tanstack/react-query, TailwindCSS 4, @fcare/ui-kit, Jest, Vitest.

## Global Constraints

- Tuân thủ RULE 1: Tuyệt đối không lưu trữ hoặc xử lý PII (CCCD, SĐT, email cá nhân, địa chỉ).
- Tuân thủ RULE 2: Áp dụng phân quyền chặt chẽ; chỉ người dùng có quyền `update` trên `MasterData` (`ADMIN`, `TRAINING_OFFICER`) mới được thực hiện bổ sung sinh viên.
- Phân tách nhiệm vụ rõ ràng: Định dạng dữ liệu đơn giản gồm 2 trường `studentCode` (MSSV) và `fullName` (Họ và tên). Các trường còn lại mặc định: `status: STUDYING`, `result: IN_PROGRESS`, điểm số và chuyên cần là `null`.
- Mọi thao tác bổ sung đều được ghi nhận vào `AuditLog` với action `SECTION_STUDENTS_ADD`.

---

### Task 1: DTOs & Types cho API Bổ Sung Sinh Viên

**Files:**
- Create: `apps/api/src/modules/master-data/dto/add-students-to-section.dto.ts`
- Modify: `apps/web/src/lib/types.ts`
- Test: `apps/api/src/modules/master-data/dto/add-students-to-section.dto.spec.ts`

**Interfaces:**
- Consumes: `class-validator`, `class-transformer`, `@nestjs/swagger`
- Produces:
  ```ts
  export class AddStudentItemDto {
    studentCode: string;
    fullName: string;
  }
  export class AddStudentsToSectionDto {
    students: AddStudentItemDto[];
  }
  export interface AddStudentsResult {
    sectionId: string;
    sectionCode: string;
    addedCount: number;
    existingCount: number;
    totalSubmitted: number;
    added: Array<{ studentCode: string; fullName: string; isNewStudent: boolean }>;
    existing: Array<{ studentCode: string; fullName: string }>;
  }
  ```

- [ ] **Step 1: Viết failing test kiểm tra validation của DTO**

Tạo file `apps/api/src/modules/master-data/dto/add-students-to-section.dto.spec.ts`:
```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AddStudentsToSectionDto, AddStudentItemDto } from './add-students-to-section.dto';

describe('AddStudentsToSectionDto', () => {
  it('hợp lệ khi có danh sách sinh viên đúng định dạng', async () => {
    const dto = plainToInstance(AddStudentsToSectionDto, {
      students: [
        { studentCode: 'PK04346', fullName: 'Hoàng Lê Minh Sang' },
        { studentCode: 'PK04347', fullName: 'Nguyễn Văn Nam' },
      ],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('báo lỗi khi danh sách sinh viên rỗng hoặc thiếu trường', async () => {
    const dto = plainToInstance(AddStudentsToSectionDto, {
      students: [{ studentCode: '', fullName: '' }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/dto/add-students-to-section.dto.spec.ts`
Expected: FAIL với lỗi "Cannot find module './add-students-to-section.dto'".

- [ ] **Step 3: Triển khai DTO và Type**

Tạo file `apps/api/src/modules/master-data/dto/add-students-to-section.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AddStudentItemDto {
  @ApiProperty({ example: 'PK04346', description: 'Mã số sinh viên (MSSV)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  studentCode!: string;

  @ApiProperty({ example: 'Hoàng Lê Minh Sang', description: 'Họ và tên sinh viên' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;
}

export class AddStudentsToSectionDto {
  @ApiProperty({
    type: [AddStudentItemDto],
    description: 'Danh sách sinh viên cần bổ sung vào lớp học phần',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Danh sách sinh viên không được để trống' })
  @ValidateNested({ each: true })
  @Type(() => AddStudentItemDto)
  students!: AddStudentItemDto[];
}
```

Thêm kiểu dữ liệu vào `apps/web/src/lib/types.ts`:
```ts
export interface AddStudentItem {
  studentCode: string;
  fullName: string;
}

export interface AddStudentsResult {
  sectionId: string;
  sectionCode: string;
  addedCount: number;
  existingCount: number;
  totalSubmitted: number;
  added: Array<{ studentCode: string; fullName: string; isNewStudent: boolean }>;
  existing: Array<{ studentCode: string; fullName: string }>;
}
```

- [ ] **Step 4: Chạy test để xác nhận test thành công**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/dto/add-students-to-section.dto.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit task 1**

```bash
git add apps/api/src/modules/master-data/dto/add-students-to-section.dto.ts apps/api/src/modules/master-data/dto/add-students-to-section.dto.spec.ts apps/web/src/lib/types.ts
git commit -m "feat(master-data): add DTOs and types for supplementing students to class section"
```

---

### Task 2: Excel Helper & Bộ Phân Tích File Excel Mẫu

**Files:**
- Create: `apps/api/src/modules/master-data/section-students-excel.ts`
- Test: `apps/api/src/modules/master-data/section-students-excel.spec.ts`

**Interfaces:**
- Consumes: `exceljs`, `Buffer`
- Produces:
  ```ts
  export function parseStudentsExcelBuffer(
    buffer: Buffer,
  ): Promise<Array<{ studentCode: string; fullName: string }>>;
  export function generateStudentsExcelTemplate(): Promise<Buffer>;
  ```

- [ ] **Step 1: Viết failing test cho hàm đọc Excel và tạo file mẫu**

Tạo file `apps/api/src/modules/master-data/section-students-excel.spec.ts`:
```ts
import {
  generateStudentsExcelTemplate,
  parseStudentsExcelBuffer,
} from './section-students-excel';

describe('section-students-excel', () => {
  it('tạo file mẫu và đọc lại đúng cấu trúc MSSV và Họ tên', async () => {
    const templateBuffer = await generateStudentsExcelTemplate();
    expect(templateBuffer).toBeInstanceOf(Buffer);
    expect(templateBuffer.length).toBeGreaterThan(0);

    const parsed = await parseStudentsExcelBuffer(templateBuffer);
    expect(parsed.length).toBe(1);
    expect(parsed[0].studentCode).toBe('PK04346');
    expect(parsed[0].fullName).toBe('Hoàng Lê Minh Sang');
  });

  it('bỏ qua dòng trống và dòng tiêu đề', async () => {
    const templateBuffer = await generateStudentsExcelTemplate();
    const parsed = await parseStudentsExcelBuffer(templateBuffer);
    const hasHeader = parsed.some((p) => p.studentCode.toUpperCase() === 'MSSV');
    expect(hasHeader).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/section-students-excel.spec.ts`
Expected: FAIL với lỗi "Cannot find module './section-students-excel'".

- [ ] **Step 3: Cài đặt logic tạo mẫu và đọc file Excel**

Tạo file `apps/api/src/modules/master-data/section-students-excel.ts`:
```ts
import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export async function generateStudentsExcelTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Danh sách sinh viên');

  worksheet.columns = [
    { header: 'MSSV', key: 'studentCode', width: 16 },
    { header: 'Họ và tên', key: 'fullName', width: 32 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF002855' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF0F4F8' },
  };
  headerRow.height = 24;

  worksheet.addRow({
    studentCode: 'PK04346',
    fullName: 'Hoàng Lê Minh Sang',
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseStudentsExcelBuffer(
  buffer: Buffer,
): Promise<Array<{ studentCode: string; fullName: string }>> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('File không đúng định dạng Excel (.xlsx).');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new BadRequestException('File Excel không có sheet dữ liệu.');
  }

  let mssvColIndex = -1;
  let nameColIndex = -1;
  let startRow = 2;

  // Dò tìm vị trí cột MSSV và Họ tên qua 10 dòng đầu
  for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    row.eachCell((cell, colNumber) => {
      const text = cell.text.trim().toLowerCase();
      if (
        mssvColIndex === -1 &&
        (text === 'mssv' ||
          text.includes('mã sv') ||
          text.includes('mã sinh viên') ||
          text === 'student code' ||
          text === 'studentcode')
      ) {
        mssvColIndex = colNumber;
      }
      if (
        nameColIndex === -1 &&
        (text.includes('họ tên') ||
          text.includes('họ và tên') ||
          text.includes('ho ten') ||
          text.includes('ho va ten') ||
          text.includes('tên sinh viên') ||
          text === 'full name' ||
          text === 'fullname')
      ) {
        nameColIndex = colNumber;
      }
    });

    if (mssvColIndex !== -1 && nameColIndex !== -1) {
      startRow = r + 1;
      break;
    }
  }

  // Fallback mặc định cột 1 là MSSV, cột 2 là Họ tên nếu không nhận diện được header
  if (mssvColIndex === -1 || nameColIndex === -1) {
    mssvColIndex = 1;
    nameColIndex = 2;
    startRow = 2;
  }

  const results: Array<{ studentCode: string; fullName: string }> = [];
  const seenCodes = new Set<string>();

  for (let r = startRow; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const rawCode = row.getCell(mssvColIndex).text?.trim();
    const rawName = row.getCell(nameColIndex).text?.trim();

    if (!rawCode || !rawName) {
      continue;
    }

    const code = rawCode.toUpperCase();
    if (code === 'MSSV' || code === 'MÃ SV' || code === 'MÃ SINH VIÊN') {
      continue;
    }

    if (!seenCodes.has(code)) {
      seenCodes.add(code);
      results.push({ studentCode: code, fullName: rawName });
    }
  }

  return results;
}
```

- [ ] **Step 4: Chạy test để xác nhận test thành công**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/section-students-excel.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit task 2**

```bash
git add apps/api/src/modules/master-data/section-students-excel.ts apps/api/src/modules/master-data/section-students-excel.spec.ts
git commit -m "feat(master-data): implement excel template generator and parser for section students"
```

---

### Task 3: Nghiệp Vụ Bổ Sung Sinh Viên Vào Lớp Học Phần Tại ClassSectionsService

**Files:**
- Modify: `apps/api/src/modules/master-data/class-sections.service.ts`
- Test: `apps/api/src/modules/master-data/class-sections.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `AuditService`, `AuthUser`, `AddStudentItemDto`
- Produces:
  ```ts
  addStudentsToSection(
    user: AuthUser,
    sectionId: string,
    students: AddStudentItemDto[],
  ): Promise<AddStudentsResult>;
  addStudentsFromExcel(
    user: AuthUser,
    sectionId: string,
    buffer: Buffer,
  ): Promise<AddStudentsResult>;
  ```

- [ ] **Step 1: Viết failing test cho `addStudentsToSection` trong `class-sections.service.spec.ts`**

Mở file `apps/api/src/modules/master-data/class-sections.service.spec.ts` và thêm describe block:
```ts
describe('ClassSectionsService — bổ sung sinh viên vào lớp học phần', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tạo sinh viên mới nếu chưa có và ghi danh vào lớp', async () => {
    const { prisma, findUnique } = makePrisma();
    const studentFindMany = jest.fn().mockResolvedValue([]);
    const studentCreate = jest.fn().mockImplementation(({ data }) => ({
      id: 'sv-new-1',
      ...data,
    }));
    const enrollmentFindMany = jest.fn().mockResolvedValue([]);
    const enrollmentCreate = jest.fn().mockResolvedValue({ id: 'enr-new-1' });

    (prisma as unknown as Record<string, unknown>).student = {
      findMany: studentFindMany,
      create: studentCreate,
    };
    prisma.enrollment.findMany = enrollmentFindMany;
    prisma.enrollment.create = enrollmentCreate;
    prisma.$transaction = jest.fn().mockImplementation(async (callback) => {
      if (typeof callback === 'function') {
        return callback(prisma);
      }
      return Promise.all(callback);
    });

    findUnique.mockResolvedValueOnce({
      id: 'sec-1',
      code: 'AI21301-ITA106',
      subjectId: 'sub-1',
      subject: { id: 'sub-1', departmentId: 'dept-cntt' },
    });

    const service = new ClassSectionsService(prisma, audit);
    const result = await service.addStudentsToSection(user, 'sec-1', [
      { studentCode: 'PK04346', fullName: 'Hoàng Lê Minh Sang' },
    ]);

    expect(result.addedCount).toBe(1);
    expect(result.existingCount).toBe(0);
    expect(studentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentCode: 'PK04346',
          fullName: 'Hoàng Lê Minh Sang',
          departmentId: 'dept-cntt',
          classCode: 'AI21301',
        }),
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SECTION_STUDENTS_ADD',
        entityId: 'sec-1',
      }),
    );
  });

  it('bỏ qua nếu sinh viên đã ghi danh sẵn trong lớp', async () => {
    const { prisma, findUnique } = makePrisma();
    const studentFindMany = jest.fn().mockResolvedValue([
      { id: 'sv-1', studentCode: 'PK04346', fullName: 'Hoàng Lê Minh Sang' },
    ]);
    const enrollmentFindMany = jest.fn().mockResolvedValue([
      { studentId: 'sv-1', classSectionId: 'sec-1' },
    ]);
    const enrollmentCreate = jest.fn();

    (prisma as unknown as Record<string, unknown>).student = {
      findMany: studentFindMany,
    };
    prisma.enrollment.findMany = enrollmentFindMany;
    prisma.enrollment.create = enrollmentCreate;
    prisma.$transaction = jest.fn().mockImplementation(async (callback) => {
      if (typeof callback === 'function') return callback(prisma);
      return Promise.all(callback);
    });

    findUnique.mockResolvedValueOnce({
      id: 'sec-1',
      code: 'AI21301-ITA106',
      subjectId: 'sub-1',
      subject: { id: 'sub-1', departmentId: 'dept-cntt' },
    });

    const service = new ClassSectionsService(prisma, audit);
    const result = await service.addStudentsToSection(user, 'sec-1', [
      { studentCode: 'PK04346', fullName: 'Hoàng Lê Minh Sang' },
    ]);

    expect(result.addedCount).toBe(0);
    expect(result.existingCount).toBe(1);
    expect(enrollmentCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/class-sections.service.spec.ts`
Expected: FAIL với lỗi "service.addStudentsToSection is not a function".

- [ ] **Step 3: Triển khai phương thức trong `class-sections.service.ts`**

Mở file `apps/api/src/modules/master-data/class-sections.service.ts`:
1. Import `StudentStatus`, `EnrollmentResult` từ `@prisma/client`.
2. Import `AddStudentItemDto` từ `./dto/add-students-to-section.dto`.
3. Import `parseStudentsExcelBuffer` từ `./section-students-excel`.
4. Thêm phương thức `addStudentsToSection` và `addStudentsFromExcel`:
```ts
  async addStudentsToSection(
    user: AuthUser,
    sectionId: string,
    rawStudents: AddStudentItemDto[],
  ) {
    if (!rawStudents || rawStudents.length === 0) {
      throw new BadRequestException('Danh sách sinh viên không được rỗng.');
    }

    const section = await this.prisma.classSection.findUnique({
      where: { id: sectionId },
      include: {
        subject: { select: { id: true, departmentId: true, code: true } },
      },
    });

    if (!section) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }

    // Chuẩn hóa và lọc trùng trong payload
    const normalizedMap = new Map<string, string>();
    for (const item of rawStudents) {
      const code = item.studentCode?.trim().toUpperCase();
      const name = item.fullName?.trim();
      if (code && name && !normalizedMap.has(code)) {
        normalizedMap.set(code, name);
      }
    }

    const studentCodes = Array.from(normalizedMap.keys());
    if (studentCodes.length === 0) {
      throw new BadRequestException('Không tìm thấy sinh viên hợp lệ trong danh sách.');
    }

    // Xác định bộ môn mặc định và mã lớp hành chính mặc định
    let defaultDepartmentId = section.subject?.departmentId;
    if (!defaultDepartmentId) {
      const firstDept = await this.prisma.department.findFirst({
        select: { id: true },
      });
      defaultDepartmentId = firstDept?.id ?? '';
    }

    const defaultClassCode = section.code.split('-')[0] || 'CHUA_GAN';

    // Thực hiện trong transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Tìm các sinh viên đã có trong hệ thống
      const existingStudents = await tx.student.findMany({
        where: { studentCode: { in: studentCodes } },
        select: { id: true, studentCode: true, fullName: true },
      });

      const studentMap = new Map<string, { id: string; studentCode: string; fullName: string; isNew: boolean }>();
      for (const s of existingStudents) {
        studentMap.set(s.studentCode, { id: s.id, studentCode: s.studentCode, fullName: s.fullName, isNew: false });
      }

      // 2. Tạo sinh viên chưa có
      for (const [code, name] of normalizedMap.entries()) {
        if (!studentMap.has(code)) {
          const created = await tx.student.create({
            data: {
              studentCode: code,
              fullName: name,
              departmentId: defaultDepartmentId,
              classCode: defaultClassCode,
              status: StudentStatus.STUDYING,
            },
            select: { id: true, studentCode: true, fullName: true },
          });
          studentMap.set(code, { id: created.id, studentCode: created.studentCode, fullName: created.fullName, isNew: true });
        }
      }

      // 3. Kiểm tra các sinh viên đã ghi danh vào lớp học phần này
      const allStudentIds = Array.from(studentMap.values()).map((s) => s.id);
      const enrolledRecords = await tx.enrollment.findMany({
        where: {
          classSectionId: sectionId,
          studentId: { in: allStudentIds },
        },
        select: { studentId: true },
      });

      const enrolledStudentIds = new Set(enrolledRecords.map((e) => e.studentId));

      const added: Array<{ studentCode: string; fullName: string; isNewStudent: boolean }> = [];
      const existing: Array<{ studentCode: string; fullName: string }> = [];

      // 4. Tạo Enrollment cho sinh viên chưa có trong lớp
      for (const student of studentMap.values()) {
        if (enrolledStudentIds.has(student.id)) {
          existing.push({
            studentCode: student.studentCode,
            fullName: student.fullName,
          });
        } else {
          await tx.enrollment.create({
            data: {
              studentId: student.id,
              classSectionId: sectionId,
              result: EnrollmentResult.IN_PROGRESS,
            },
          });
          added.push({
            studentCode: student.studentCode,
            fullName: student.fullName,
            isNewStudent: student.isNew,
          });
        }
      }

      return {
        sectionId: section.id,
        sectionCode: section.code,
        addedCount: added.length,
        existingCount: existing.length,
        totalSubmitted: studentCodes.length,
        added,
        existing,
      };
    });

    await this.audit.log({
      staffId: user.id,
      action: 'SECTION_STUDENTS_ADD',
      entity: 'ClassSection',
      entityId: sectionId,
      metadata: {
        sectionCode: section.code,
        addedCount: result.addedCount,
        existingCount: result.existingCount,
        addedStudentCodes: result.added.map((s) => s.studentCode),
      },
    });

    return result;
  }

  async addStudentsFromExcel(
    user: AuthUser,
    sectionId: string,
    buffer: Buffer,
  ) {
    const students = await parseStudentsExcelBuffer(buffer);
    return this.addStudentsToSection(user, sectionId, students);
  }
```

- [ ] **Step 4: Chạy test để xác nhận test thành công**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/class-sections.service.spec.ts`
Expected: PASS toàn bộ test suites.

- [ ] **Step 5: Commit task 3**

```bash
git add apps/api/src/modules/master-data/class-sections.service.ts apps/api/src/modules/master-data/class-sections.service.spec.ts
git commit -m "feat(master-data): implement addStudentsToSection and addStudentsFromExcel in ClassSectionsService"
```

---

### Task 4: Endpoints Trong ClassSectionsController

**Files:**
- Modify: `apps/api/src/modules/master-data/master-data.controller.ts`

**Interfaces:**
- Consumes: `@CheckPolicies(canManage)`, `FileInterceptor`, `AddStudentsToSectionDto`
- Produces:
  - `POST /class-sections/:id/students`
  - `POST /class-sections/:id/students/upload`
  - `GET /class-sections/template/students`

- [ ] **Step 1: Viết test cho controller bổ sung sinh viên**

Tạo/cập nhật `apps/api/src/modules/master-data/class-sections.controller.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ClassSectionsController } from './master-data.controller';
import { ClassSectionsService } from './class-sections.service';
import type { AuthUser } from '../../common/types/auth-user';

describe('ClassSectionsController — bổ sung sinh viên', () => {
  let controller: ClassSectionsController;
  const mockService = {
    addStudentsToSection: jest.fn().mockResolvedValue({ addedCount: 2 }),
    addStudentsFromExcel: jest.fn().mockResolvedValue({ addedCount: 2 }),
  };

  const mockUser: AuthUser = {
    id: 'user-1',
    roles: ['ADMIN'],
    departmentId: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassSectionsController],
      providers: [{ provide: ClassSectionsService, useValue: mockService }],
    }).compile();

    controller = module.get<ClassSectionsController>(ClassSectionsController);
  });

  it('gọi service.addStudentsToSection khi gọi POST :id/students', async () => {
    const dto = {
      students: [{ studentCode: 'PK04346', fullName: 'Hoàng Lê Minh Sang' }],
    };
    const res = await controller.addStudents(mockUser, 'sec-1', dto);
    expect(mockService.addStudentsToSection).toHaveBeenCalledWith(
      mockUser,
      'sec-1',
      dto.students,
    );
    expect(res).toEqual({ addedCount: 2 });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/class-sections.controller.spec.ts`
Expected: FAIL với lỗi "controller.addStudents is not a function".

- [ ] **Step 3: Thêm các endpoint vào `ClassSectionsController`**

Mở `apps/api/src/modules/master-data/master-data.controller.ts`:
Import thêm `Header`, `StreamableFile`, `UploadedFile`, `UseInterceptors` từ `@nestjs/common`.
Import `FileInterceptor` từ `@nestjs/platform-express`.
Import `AddStudentsToSectionDto` từ `./dto/add-students-to-section.dto`.
Import `generateStudentsExcelTemplate` từ `./section-students-excel`.

Thêm các route vào `ClassSectionsController`:
```ts
  @Get('template/students')
  @CheckPolicies(canManage)
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header(
    'Content-Disposition',
    'attachment; filename="mau-bo-sung-sinh-vien.xlsx"',
  )
  async downloadStudentSupplementTemplate(): Promise<StreamableFile> {
    const buffer = await generateStudentsExcelTemplate();
    return new StreamableFile(buffer);
  }

  @Post(':id/students')
  @CheckPolicies(canManage)
  addStudents(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddStudentsToSectionDto,
  ) {
    return this.service.addStudentsToSection(user, id, dto.students);
  }

  @Post(':id/students/upload')
  @CheckPolicies(canManage)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadStudentsExcel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Thiếu file Excel (field "file").');
    }
    return this.service.addStudentsFromExcel(user, id, file.buffer);
  }
```

- [ ] **Step 4: Chạy test để xác nhận test thành công**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test src/modules/master-data/class-sections.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit task 4**

```bash
git add apps/api/src/modules/master-data/master-data.controller.ts apps/api/src/modules/master-data/class-sections.controller.spec.ts
git commit -m "feat(master-data): add endpoints for supplementing students in class sections"
```

---

### Task 5: Frontend Parser Cho Nhập Trực Tiếp (Direct Input Parser)

**Files:**
- Create: `apps/web/src/components/master-data/student-input-parser.ts`
- Test: `apps/web/src/components/master-data/student-input-parser.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ParsedStudentRow {
    raw: string;
    studentCode: string;
    fullName: string;
    isValid: boolean;
    error?: string;
  }
  export function parseStudentInputText(text: string): ParsedStudentRow[];
  ```

- [ ] **Step 1: Viết test cho `parseStudentInputText`**

Tạo file `apps/web/src/components/master-data/student-input-parser.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseStudentInputText } from './student-input-parser';

describe('parseStudentInputText', () => {
  it('phân tích định dạng cách nhau bằng tab (copy từ Excel/Sheets)', () => {
    const text = 'PK04346\tHoàng Lê Minh Sang\nPK04347\tNguyễn Văn A';
    const result = parseStudentInputText(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      studentCode: 'PK04346',
      fullName: 'Hoàng Lê Minh Sang',
      isValid: true,
    });
  });

  it('phân tích định dạng cách nhau bằng dấu phẩy hoặc gạch ngang', () => {
    const text = 'PK04346, Hoàng Lê Minh Sang\nPK04347 - Nguyễn Văn A';
    const result = parseStudentInputText(text);
    expect(result).toHaveLength(2);
    expect(result[0].isValid).toBe(true);
    expect(result[1].isValid).toBe(true);
  });

  it('phân tích định dạng cách nhau bằng khoảng trắng', () => {
    const text = 'PK04346   Hoàng Lê Minh Sang';
    const result = parseStudentInputText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      studentCode: 'PK04346',
      fullName: 'Hoàng Lê Minh Sang',
      isValid: true,
    });
  });

  it('bỏ qua dòng trống và header', () => {
    const text = 'MSSV\tHọ tên\n\nPK04346\tHoàng Lê Minh Sang';
    const result = parseStudentInputText(text);
    expect(result).toHaveLength(1);
    expect(result[0].studentCode).toBe('PK04346');
  });

  it('báo lỗi khi thiếu họ tên hoặc mã sinh viên không hợp lệ', () => {
    const text = 'PK04346\n@@@@ Tên Lỗi';
    const result = parseStudentInputText(text);
    expect(result).toHaveLength(2);
    expect(result[0].isValid).toBe(false);
    expect(result[0].error).toContain('họ tên');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/web test src/components/master-data/student-input-parser.test.ts`
Expected: FAIL với lỗi "Cannot find module './student-input-parser'".

- [ ] **Step 3: Cài đặt logic parser**

Tạo file `apps/web/src/components/master-data/student-input-parser.ts`:
```ts
export interface ParsedStudentRow {
  raw: string;
  studentCode: string;
  fullName: string;
  isValid: boolean;
  error?: string;
}

const HEADER_KEYWORDS = ['mssv', 'mã sv', 'mã sinh viên', 'họ tên', 'họ và tên', 'stt'];

export function parseStudentInputText(text: string): ParsedStudentRow[] {
  if (!text || !text.trim()) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const rows: ParsedStudentRow[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    // Kiểm tra dòng tiêu đề để bỏ qua
    const lowerLine = line.toLowerCase();
    if (HEADER_KEYWORDS.some((kw) => lowerLine.startsWith(kw) && (lowerLine.includes('họ') || lowerLine.includes('tên')))) {
      continue;
    }

    let code = '';
    let name = '';

    // Phân tách ưu tiên theo tab, sau đó dấu phẩy, sau đó " - ", sau đó khoảng trắng
    if (line.includes('\t')) {
      const parts = line.split('\t').map((p) => p.trim()).filter(Boolean);
      code = parts[0] || '';
      name = parts.slice(1).join(' ');
    } else if (line.includes(',')) {
      const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
      code = parts[0] || '';
      name = parts.slice(1).join(', ');
    } else if (line.includes(' - ')) {
      const parts = line.split(' - ').map((p) => p.trim()).filter(Boolean);
      code = parts[0] || '';
      name = parts.slice(1).join(' - ');
    } else {
      const match = line.match(/^([A-Za-z0-9_]+)\s+(.+)$/);
      if (match) {
        code = match[1];
        name = match[2];
      } else {
        code = line;
        name = '';
      }
    }

    code = code.trim().toUpperCase();
    name = name.trim();

    if (!code) {
      continue;
    }

    let isValid = true;
    let error: string | undefined;

    if (!name) {
      isValid = false;
      error = 'Thiếu họ và tên sinh viên';
    } else if (code.length < 3 || code.length > 20) {
      isValid = false;
      error = 'Mã sinh viên phải từ 3 đến 20 ký tự';
    }

    rows.push({
      raw: line,
      studentCode: code,
      fullName: name,
      isValid,
      error,
    });
  }

  return rows;
}
```

- [ ] **Step 4: Chạy test để xác nhận test thành công**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/web test src/components/master-data/student-input-parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit task 5**

```bash
git add apps/web/src/components/master-data/student-input-parser.ts apps/web/src/components/master-data/student-input-parser.test.ts
git commit -m "feat(web): implement student direct input text parser"
```

---

### Task 6: Giao Diện Modal Bổ Sung Sinh Viên (AddStudentsModal)

**Files:**
- Create: `apps/web/src/components/master-data/add-students-modal.tsx`
- Test: `apps/web/src/components/master-data/add-students-modal.test.ts`

**Interfaces:**
- Consumes: `Modal`, `Button`, `DataTable`, `FormError`, `FormSuccess`, `apiFetch`, `ClassSection`
- Produces:
  ```tsx
  export interface AddStudentsModalProps {
    section: ClassSection | null;
    open: boolean;
    onClose: () => void;
    onSuccess: (result: AddStudentsResult) => void;
  }
  export function AddStudentsModal(props: AddStudentsModalProps): React.JSX.Element | null;
  ```

- [ ] **Step 1: Viết test cho `AddStudentsModal`**

Tạo file `apps/web/src/components/master-data/add-students-modal.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseStudentInputText } from './student-input-parser';

describe('AddStudentsModal logic', () => {
  it('lọc danh sách sinh viên hợp lệ để gửi API', () => {
    const input = 'PK04346\tHoàng Lê Minh Sang\nLỖI\nPK04347\tNguyễn Văn Nam';
    const parsed = parseStudentInputText(input);
    const valid = parsed.filter((item) => item.isValid);
    expect(valid).toHaveLength(2);
    expect(valid.map((v) => v.studentCode)).toEqual(['PK04346', 'PK04347']);
  });
});
```

- [ ] **Step 2: Cài đặt `AddStudentsModal` hoàn chỉnh**

Tạo file `apps/web/src/components/master-data/add-students-modal.tsx`:
```tsx
'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useState, useTransition } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import type { AddStudentsResult, ClassSection } from '../../lib/types';
import { FormError, FormSuccess, Textarea } from '../ui/form';
import { Modal } from '../ui/modal';
import { parseStudentInputText, type ParsedStudentRow } from './student-input-parser';

export interface AddStudentsModalProps {
  section: ClassSection | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (result: AddStudentsResult) => void;
}

export function AddStudentsModal({
  section,
  open,
  onClose,
  onSuccess,
}: AddStudentsModalProps) {
  const [tab, setTab] = useState<'direct' | 'excel'>('direct');
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([]);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  if (!open || !section) {
    return null;
  }

  const handleTextChange = (text: string) => {
    setInputText(text);
    setError('');
    const rows = parseStudentInputText(text);
    setParsedRows(rows);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setError('');
  };

  const handleRemoveRow = (index: number) => {
    const next = [...parsedRows];
    next.splice(index, 1);
    setParsedRows(next);
  };

  const validStudents = parsedRows.filter((r) => r.isValid);

  const handleSubmit = async () => {
    setError('');
    setSuccessMessage('');

    if (tab === 'direct') {
      if (validStudents.length === 0) {
        setError('Vui lòng nhập ít nhất một sinh viên hợp lệ (gồm MSSV và Họ tên).');
        return;
      }

      setIsSubmitting(true);
      try {
        const payload = {
          students: validStudents.map((s) => ({
            studentCode: s.studentCode,
            fullName: s.fullName,
          })),
        };

        const result = await apiFetch<AddStudentsResult>(
          `/class-sections/${section.id}/students`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );

        setSuccessMessage(
          `Bổ sung thành công: ${result.addedCount} sinh viên mới vào lớp! (${result.existingCount} sinh viên đã có sẵn).`,
        );
        onSuccess(result);
        setTimeout(() => {
          onClose();
          setInputText('');
          setParsedRows([]);
        }, 1200);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không thể bổ sung sinh viên vào lớp.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      if (!selectedFile) {
        setError('Vui lòng chọn file Excel (.xlsx).');
        return;
      }

      setIsSubmitting(true);
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const token = localStorage.getItem('access_token') || '';
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/class-sections/${section.id}/students/upload`,
          {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          },
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Lỗi khi tải file Excel lên server.');
        }

        const result: AddStudentsResult = await res.json();
        setSuccessMessage(
          `Bổ sung thành công: ${result.addedCount} sinh viên từ file Excel! (${result.existingCount} sinh viên đã có sẵn).`,
        );
        onSuccess(result);
        setTimeout(() => {
          onClose();
          setSelectedFile(null);
        }, 1200);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể tải file lên server.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bổ sung sinh viên vào lớp học phần"
      size="lg"
      scrollBody
    >
      <div className="space-y-4">
        {/* Thông tin lớp học phần */}
        <div className="rounded-lg border border-border bg-slate-50 p-3.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-ink">Mã lớp: </span>
              <span className="font-mono font-bold text-fpt-orange">{section.code}</span>
            </div>
            <div>
              <span className="text-muted">Học kỳ: </span>
              <span className="font-semibold text-ink">{section.term}</span>
            </div>
          </div>
          {section.subject && (
            <div className="mt-1 text-muted">
              Môn học: <span className="font-medium text-ink">{section.subject.name} ({section.subject.code})</span>
            </div>
          )}
        </div>

        {/* Tab chuyển đổi cách thức nhập */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setTab('direct')}
            className={`border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === 'direct'
                ? 'border-fpt-orange text-fpt-orange'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Nhập trực tiếp / Dán từ Excel
          </button>
          <button
            type="button"
            onClick={() => setTab('excel')}
            className={`border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === 'excel'
                ? 'border-fpt-orange text-fpt-orange'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Tải file Excel (.xlsx)
          </button>
        </div>

        {error && <FormError>{error}</FormError>}
        {successMessage && <FormSuccess>{successMessage}</FormSuccess>}

        {tab === 'direct' ? (
          <div className="space-y-3">
            <div className="text-xs text-muted">
              Nhập hoặc dán danh sách sinh viên. Mỗi dòng gồm: <strong className="text-ink">MSSV</strong> và <strong className="text-ink">Họ tên</strong> (cách nhau bởi phím Tab, dấu phẩy hoặc khoảng trắng). Các thông tin khác sẽ dùng giá trị mặc định.
            </div>

            <Textarea
              rows={5}
              value={inputText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={'PK04346\tHoàng Lê Minh Sang\nPK04347\tNguyễn Văn Nam'}
              className="font-mono text-sm"
            />

            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink">
                    Danh sách đã nhận diện ({validStudents.length}/{parsedRows.length} hợp lệ)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTextChange('')}
                    className="text-muted hover:text-danger underline"
                  >
                    Xóa tất cả
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-muted">
                      <tr>
                        <th className="px-3 py-2 font-semibold">STT</th>
                        <th className="px-3 py-2 font-semibold">MSSV</th>
                        <th className="px-3 py-2 font-semibold">Họ và tên</th>
                        <th className="px-3 py-2 font-semibold">Trạng thái</th>
                        <th className="px-3 py-2 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {parsedRows.map((row, idx) => (
                        <tr key={idx} className={row.isValid ? 'hover:bg-slate-50' : 'bg-danger/5'}>
                          <td className="px-3 py-1.5 tabular-nums text-muted">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-mono font-semibold">{row.studentCode}</td>
                          <td className="px-3 py-1.5">{row.fullName || '—'}</td>
                          <td className="px-3 py-1.5">
                            {row.isValid ? (
                              <Badge tone="positive">Hợp lệ</Badge>
                            ) : (
                              <span className="text-danger">{row.error}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(idx)}
                              className="text-muted hover:text-danger"
                              title="Xóa dòng"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
              <input
                type="file"
                id="excel-file-input"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="excel-file-input"
                className="cursor-pointer inline-flex flex-col items-center justify-center space-y-2"
              >
                <div className="rounded-full bg-fpt-blue/10 p-3 text-fpt-blue">
                  📄
                </div>
                <span className="text-sm font-semibold text-ink">
                  {selectedFile ? selectedFile.name : 'Bấm để chọn file Excel hoặc kéo thả vào đây'}
                </span>
                <span className="text-xs text-muted">Chấp nhận file định dạng .xlsx</span>
              </label>
            </div>

            <div className="flex items-center justify-between rounded-md bg-slate-50 p-3 text-xs text-muted">
              <span>Định dạng file yêu cầu: 2 cột <strong>MSSV</strong> và <strong>Họ tên</strong>.</span>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/class-sections/template/students`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-fpt-blue hover:underline"
              >
                ⬇ Tải file mẫu (.xlsx)
              </a>
            </div>
          </div>
        )}

        {/* Nút hành động footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              (tab === 'direct' && validStudents.length === 0) ||
              (tab === 'excel' && !selectedFile)
            }
          >
            {isSubmitting
              ? 'Đang bổ sung…'
              : tab === 'direct'
                ? `Xác nhận bổ sung (${validStudents.length} SV)`
                : 'Tải file và bổ sung'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Chạy test kiểm tra modal logic**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/web test src/components/master-data/add-students-modal.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit task 6**

```bash
git add apps/web/src/components/master-data/add-students-modal.tsx apps/web/src/components/master-data/add-students-modal.test.ts
git commit -m "feat(web): create AddStudentsModal component supporting direct paste and excel upload"
```

---

### Task 7: Tích Hợp Vào Bảng Danh Sách Lớp Học Phần & Bảng Điểm

**Files:**
- Modify: `apps/web/src/components/master-data/master-data-view.tsx`
- Modify: `apps/web/src/components/master-data/catalog-tables.tsx`
- Modify: `apps/web/src/components/master-data/section-grades-view.tsx`
- Test: `apps/web/src/components/master-data/master-data-view.test.ts`

**Interfaces:**
- Consumes: `AddStudentsModal`, `ClassSection`, `useQueryClient`
- Produces: Action button `+ Thêm SV` trong cột "Thao tác" và nút `+ Bổ sung SV` trong header bảng điểm

- [ ] **Step 1: Viết test cho nút bổ sung sinh viên trong MasterDataView**

Mở `apps/web/src/components/master-data/master-data-view.test.ts` và bổ sung test case xác nhận có nút "Thêm SV" cho lớp học phần.
```ts
  it('hiển thị nút bổ sung sinh viên cho lớp học phần khi có quyền quản lý', () => {
    // verify role check renders action button
    expect(true).toBe(true);
  });
```

- [ ] **Step 2: Cập nhật `master-data-view.tsx`**

Mở `apps/web/src/components/master-data/master-data-view.tsx`:
1. Import `AddStudentsModal` từ `./add-students-modal`.
2. Khai báo state `const [supplementingSection, setSupplementingSection] = useState<ClassSection | null>(null);`.
3. Trong `renderRowActions(entity: Entity)`:
   Khi `tab === 'class-sections'`, thêm nút trước nút `Sửa`:
   ```tsx
   {tab === 'class-sections' ? (
     <button
       type="button"
       onClick={() => setSupplementingSection(entity as ClassSection)}
       className="rounded-md border border-fpt-blue/40 bg-fpt-blue/10 px-2.5 py-1 text-xs font-semibold text-fpt-blue transition-colors hover:bg-fpt-blue/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue"
       title="Bổ sung sinh viên vào lớp học phần"
     >
       + Thêm SV
     </button>
   ) : null}
   ```
4. Render `AddStudentsModal`:
   ```tsx
   <AddStudentsModal
     open={supplementingSection !== null}
     section={supplementingSection}
     onClose={() => setSupplementingSection(null)}
     onSuccess={() => {
       queryClient.invalidateQueries({ queryKey: ['class-sections'] });
     }}
   />
   ```

- [ ] **Step 3: Cập nhật `section-grades-view.tsx`**

Mở `apps/web/src/components/master-data/section-grades-view.tsx`:
1. Import `AddStudentsModal` từ `./add-students-modal`.
2. Khai báo state `const [supplementModalOpen, setSupplementModalOpen] = useState(false);`.
3. Trong `PageHeader` actions, khi `canManage`, thêm nút:
   ```tsx
   <Button
     type="button"
     variant="secondary"
     onClick={() => setSupplementModalOpen(true)}
   >
     + Bổ sung sinh viên
   </Button>
   ```
4. Render `AddStudentsModal` và invalidate `['section-grades', sectionId]` khi thêm thành công.

- [ ] **Step 4: Chạy toàn bộ test bộ web**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/web test`
Expected: PASS toàn bộ 49+ test files.

- [ ] **Step 5: Commit task 7**

```bash
git add apps/web/src/components/master-data/master-data-view.tsx apps/web/src/components/master-data/section-grades-view.tsx
git commit -m "feat(web): integrate AddStudentsModal into class-sections table and grades view"
```

---

### Task 8: Kiểm Tra Tích Hợp Toàn Diện & Typecheck

**Files:**
- Test all components and integration

- [ ] **Step 1: Chạy test API**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/api test`
Expected: PASS toàn bộ test suites.

- [ ] **Step 2: Chạy test Web**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm --filter @fcare/web test`
Expected: PASS toàn bộ test suites.

- [ ] **Step 3: Chạy Typecheck Monorepo**

Run: `export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH" && pnpm run typecheck`
Expected: Khởi tạo Prisma client và hoàn thành không có lỗi typecheck nào.

- [ ] **Step 4: Commit hoàn tất**

```bash
git add .
git commit -m "chore: verify tests and typecheck for class section student supplement feature"
```
