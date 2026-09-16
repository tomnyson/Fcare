import {
  BadRequestException,
  Injectable,
  StreamableFile,
} from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { deptFilter, isDeptScoped } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  cellText,
  loadWorkbook,
  stripForbiddenData,
  workbookToFile,
  type RowError,
} from './excel-utils';

/** Cột hợp lệ: chỉ dữ liệu học vụ, tuyệt đối không PII. */
const STUDENT_COLUMNS = [
  'MSSV',
  'Họ tên',
  'Ngày sinh',
  'Giới tính',
  'Mã ngành',
  'Khóa',
  'Lớp',
  'Trạng thái',
];

const STATUS_BY_LABEL: Record<string, StudentStatus> = {
  'đang học': StudentStatus.STUDYING,
  'bảo lưu': StudentStatus.RESERVED,
  'cảnh báo': StudentStatus.WARNED,
  'thôi học': StudentStatus.DROPPED_OUT,
  'tốt nghiệp': StudentStatus.GRADUATED,
};

export const STATUS_LABELS: Record<StudentStatus, string> = {
  STUDYING: 'Đang học',
  RESERVED: 'Bảo lưu',
  WARNED: 'Cảnh báo',
  DROPPED_OUT: 'Thôi học',
  GRADUATED: 'Tốt nghiệp',
};

function parseStatus(text: string): StudentStatus | undefined {
  if (text === '') {
    return undefined;
  }
  const byLabel = STATUS_BY_LABEL[text.toLowerCase()];
  if (byLabel) {
    return byLabel;
  }
  return Object.values(StudentStatus).find(
    (status) => status === text.toUpperCase(),
  );
}

@Injectable()
export class StudentsExcelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async import(user: AuthUser, buffer: Buffer) {
    const workbook = await loadWorkbook(buffer);
    // RULE 1: xoá PII trước khi đọc bất kỳ ô nào.
    const warnings = stripForbiddenData(workbook);
    const worksheet = workbook.worksheets[0];

    // Đọc header row để map đúng cột, bất kể file có thêm cột "Ngành"/"Bộ môn"
    // hay thứ tự cột khác. So sánh chuẩn hoá: lowercase + gộp khoảng trắng.
    const colIndex = new Map<string, number>();
    worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      const normalized = cell.text.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!colIndex.has(normalized)) {
        colIndex.set(normalized, col);
      }
    });

    const COL_MSSV = colIndex.get('mssv') ?? 1;
    const COL_FULLNAME =
      colIndex.get('họ tên') ?? colIndex.get('họ và tên') ?? 2;
    const COL_DOB = colIndex.get('ngày sinh') ?? 3;
    const COL_GENDER = colIndex.get('giới tính') ?? 4;
    const COL_MAJOR_CODE = colIndex.get('mã ngành') ?? 5;
    const COL_COHORT = colIndex.get('khóa') ?? colIndex.get('khoá') ?? 6;
    const COL_CLASS = colIndex.get('lớp') ?? 7;
    const COL_STATUS = colIndex.get('trạng thái') ?? 8;

    const majors = await this.prisma.major.findMany();
    const majorByCode = new Map(
      majors.map((major) => [major.code.toLowerCase(), major]),
    );

    const errors: RowError[] = [];
    let created = 0;
    let updated = 0;

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const studentCode = cellText(row, COL_MSSV);
      if (studentCode === '') {
        continue; // bỏ qua dòng trống
      }

      const fullName = cellText(row, COL_FULLNAME);
      const dateOfBirthText = cellText(row, COL_DOB);
      const gender = cellText(row, COL_GENDER);
      const majorCode = cellText(row, COL_MAJOR_CODE);
      const cohort = cellText(row, COL_COHORT);
      const classCode = cellText(row, COL_CLASS);
      const statusText = cellText(row, COL_STATUS);

      if (
        fullName === '' ||
        majorCode === '' ||
        cohort === '' ||
        classCode === ''
      ) {
        errors.push({
          row: rowNumber,
          message: 'Thiếu Họ tên / Mã ngành / Khóa / Lớp.',
        });
        continue;
      }

      const major = majorByCode.get(majorCode.toLowerCase());
      if (!major) {
        errors.push({
          row: rowNumber,
          message: `Mã ngành "${majorCode}" không tồn tại.`,
        });
        continue;
      }

      // Trưởng bộ môn chỉ được import sinh viên thuộc bộ môn của mình.
      if (isDeptScoped(user) && major.departmentId !== user.departmentId) {
        errors.push({
          row: rowNumber,
          message: 'Sinh viên không thuộc bộ môn của bạn.',
        });
        continue;
      }

      const status = parseStatus(statusText);
      if (statusText !== '' && !status) {
        errors.push({
          row: rowNumber,
          message: `Trạng thái "${statusText}" không hợp lệ.`,
        });
        continue;
      }

      const dateOfBirth =
        dateOfBirthText === '' ? undefined : new Date(dateOfBirthText);
      if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) {
        errors.push({
          row: rowNumber,
          message: `Ngày sinh "${dateOfBirthText}" không hợp lệ.`,
        });
        continue;
      }

      const data = {
        fullName,
        dateOfBirth,
        gender: gender === '' ? undefined : gender,
        majorId: major.id,
        departmentId: major.departmentId,
        cohort,
        classCode,
        status,
      };

      const existing = await this.prisma.student.findUnique({
        where: { studentCode },
      });
      if (existing) {
        await this.prisma.student.update({ where: { studentCode }, data });
        updated += 1;
      } else {
        await this.prisma.student.create({ data: { studentCode, ...data } });
        created += 1;
      }
    }

    await this.auditService.log({
      staffId: user.id,
      action: 'EXCEL_IMPORT_STUDENTS',
      entity: 'Student',
      metadata: { created, updated, errorCount: errors.length },
    });

    return { created, updated, errors, warnings };
  }

  async export(
    user: AuthUser,
    filter: { departmentId?: string; classCode?: string },
  ): Promise<StreamableFile> {
    const students = await this.prisma.student.findMany({
      where: {
        ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
        ...deptFilter(user),
        ...(filter.classCode ? { classCode: filter.classCode } : {}),
      },
      orderBy: { studentCode: 'asc' },
      include: { major: true, department: true },
    });

    if (students.length === 0) {
      throw new BadRequestException(
        'Không có sinh viên nào khớp bộ lọc để xuất.',
      );
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sinh viên');
    sheet.addRow([
      ...STUDENT_COLUMNS.slice(0, 5),
      'Ngành',
      'Bộ môn',
      'Khóa',
      'Lớp',
      'Trạng thái',
    ]);
    sheet.getRow(1).font = { bold: true };

    for (const student of students) {
      sheet.addRow([
        student.studentCode,
        student.fullName,
        student.dateOfBirth
          ? student.dateOfBirth.toISOString().slice(0, 10)
          : '',
        student.gender ?? '',
        student.major?.code ?? '',
        student.major?.name ?? '',
        student.department.code,
        student.cohort ?? '',
        student.classCode,
        STATUS_LABELS[student.status],
      ]);
    }

    await this.auditService.log({
      staffId: user.id,
      action: 'EXCEL_EXPORT_STUDENTS',
      entity: 'Student',
      metadata: { count: students.length, filter },
    });

    return workbookToFile(workbook, 'fcare-sinh-vien.xlsx');
  }
}
