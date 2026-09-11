import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { EnrollmentResult } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { isDeptScoped } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  cellNumber,
  cellText,
  loadWorkbook,
  resultFromLabel,
  stripForbiddenData,
  workbookToFile,
  type RowError,
} from './excel-utils';

const RESULT_LABELS: Record<EnrollmentResult, string> = {
  PASS: 'Đạt',
  FAIL: 'Trượt',
  IN_PROGRESS: 'Đang học',
};

/** Wrapper mỏng quanh nguồn chuẩn hoá duy nhất `resultFromLabel`
 * (excel-utils.ts) — ở đây vẫn trả undefined khi rỗng hoặc không nhận ra
 * (khác với gradebook.parser.parseEnrollmentResult mặc định IN_PROGRESS).
 * Chủ ý, không phải lỗi: hai chỗ gọi có ngữ nghĩa khác nhau. Fallback theo
 * tên enum (vd: "PASS") vẫn giữ nguyên cho tương thích ngược. */
export function parseResult(text: string): EnrollmentResult | undefined {
  if (text === '') {
    return undefined;
  }
  return (
    resultFromLabel(text) ??
    Object.values(EnrollmentResult).find(
      (result) => result === text.toUpperCase(),
    )
  );
}

function parseBoolean(text: string): boolean {
  return ['x', '1', 'true', 'có', 'co', 'yes'].includes(text.toLowerCase());
}

@Injectable()
export class GradesExcelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async import(user: AuthUser, buffer: Buffer) {
    const workbook = await loadWorkbook(buffer);
    // RULE 1: xoá PII trước khi đọc bất kỳ ô nào.
    const warnings = stripForbiddenData(workbook);
    const worksheet = workbook.worksheets[0];

    const [sections, students] = await Promise.all([
      this.prisma.classSection.findMany({
        select: { id: true, code: true, lecturerId: true },
      }),
      this.prisma.student.findMany({
        select: { id: true, studentCode: true, departmentId: true },
      }),
    ]);
    const sectionByCode = new Map(
      sections.map((section) => [section.code.toLowerCase(), section]),
    );
    const studentByCode = new Map(
      students.map((student) => [student.studentCode.toLowerCase(), student]),
    );

    const errors: RowError[] = [];
    let upserted = 0;

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const sectionCode = cellText(row, 1);
      const studentCode = cellText(row, 2);
      if (sectionCode === '' && studentCode === '') {
        continue;
      }

      const section = sectionByCode.get(sectionCode.toLowerCase());
      if (!section) {
        errors.push({
          row: rowNumber,
          message: `Mã lớp học phần "${sectionCode}" không tồn tại.`,
        });
        continue;
      }
      const student = studentByCode.get(studentCode.toLowerCase());
      if (!student) {
        errors.push({
          row: rowNumber,
          message: `MSSV "${studentCode}" không tồn tại.`,
        });
        continue;
      }
      // Ngoài bộ môn vẫn được nhập nếu chính mình đứng lớp học phần đó —
      // một giảng viên có thể dạy lớp của bộ môn khác.
      if (
        isDeptScoped(user) &&
        student.departmentId !== user.departmentId &&
        section.lecturerId !== user.id
      ) {
        errors.push({
          row: rowNumber,
          message: 'Sinh viên không thuộc phạm vi của bạn.',
        });
        continue;
      }

      const resultText = cellText(row, 8);
      const result = parseResult(resultText);
      if (resultText !== '' && !result) {
        errors.push({
          row: rowNumber,
          message: `Kết quả "${resultText}" không hợp lệ.`,
        });
        continue;
      }

      const scores = {
        attendanceRate: cellNumber(row, 3),
        midtermScore: cellNumber(row, 4),
        finalScore: cellNumber(row, 5),
        totalScore: cellNumber(row, 6),
        isExamBanned: parseBoolean(cellText(row, 7)),
        result,
      };

      await this.prisma.enrollment.upsert({
        where: {
          studentId_classSectionId: {
            studentId: student.id,
            classSectionId: section.id,
          },
        },
        create: {
          studentId: student.id,
          classSectionId: section.id,
          ...scores,
        },
        update: scores,
      });
      upserted += 1;
    }

    await this.auditService.log({
      staffId: user.id,
      action: 'EXCEL_IMPORT_GRADES',
      entity: 'Enrollment',
      metadata: { upserted, errorCount: errors.length },
    });

    return { upserted, errors, warnings };
  }

  async export(
    user: AuthUser,
    classSectionId: string,
  ): Promise<StreamableFile> {
    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: { subject: true },
    });
    if (!section) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }
    if (
      isDeptScoped(user) &&
      section.subject.departmentId !== user.departmentId &&
      section.lecturerId !== user.id
    ) {
      throw new BadRequestException(
        'Lớp học phần không thuộc bộ môn của bạn và cũng không do bạn phụ trách.',
      );
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: { classSectionId },
      orderBy: { student: { studentCode: 'asc' } },
      include: {
        student: {
          select: { studentCode: true, fullName: true, classCode: true },
        },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(section.code.slice(0, 31));
    sheet.addRow([
      'Mã lớp học phần',
      'MSSV',
      'Họ tên',
      'Chuyên cần (%)',
      'Điểm giữa kỳ',
      'Điểm cuối kỳ',
      'Điểm tổng kết',
      'Cấm thi',
      'Kết quả',
    ]);
    sheet.getRow(1).font = { bold: true };

    for (const enrollment of enrollments) {
      sheet.addRow([
        section.code,
        enrollment.student.studentCode,
        enrollment.student.fullName,
        enrollment.attendanceRate ?? '',
        enrollment.midtermScore ?? '',
        enrollment.finalScore ?? '',
        enrollment.totalScore ?? '',
        enrollment.isExamBanned ? 'X' : '',
        RESULT_LABELS[enrollment.result],
      ]);
    }

    await this.auditService.log({
      staffId: user.id,
      action: 'EXCEL_EXPORT_GRADES',
      entity: 'Enrollment',
      entityId: classSectionId,
      metadata: { count: enrollments.length },
    });

    return workbookToFile(workbook, `fcare-diem-${section.code}.xlsx`);
  }
}
