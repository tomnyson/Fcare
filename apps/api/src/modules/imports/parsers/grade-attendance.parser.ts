import { EnrollmentResult } from '@prisma/client';
import type * as ExcelJS from 'exceljs';
import { cellNumber, cellText } from '../../excel/excel-utils';
import type {
  ImportContext,
  ImportParser,
  ParsedRow,
  ParseResult,
} from '../types';
import { buildTermSectionCode } from './section-list.parser';
import {
  attendanceRateFrom,
  parseAbsence,
  pickDataSheet,
} from './term-file-utils';

const HEADER_ROW = 1;

/** Cột bắt buộc — cũng là dấu hiệu nhận diện sheet dữ liệu. */
const REQUIRED = ['Mã', 'Tên lớp', 'Mã môn'] as const;

const OPTIONAL = ['Số buổi nghỉ/TS', 'Điểm', 'Trạng thái'] as const;

/**
 * Lớp thi lại cuối kỳ do phòng khảo thí tự sinh ("TL_EOS test_VIE1026_..."),
 * không phải lớp học phần trong kế hoạch giảng dạy nên không có trong file
 * danh sách lớp. Bỏ qua thay vì tạo lớp rác.
 */
const EXAM_CLASS_PREFIX = 'TL_EOS';

interface GradeStatus {
  result: EnrollmentResult;
  /** Trượt vì chuyên cần = bị cấm thi. */
  isExamBanned: boolean;
}

const STATUS_BY_LABEL: Record<string, GradeStatus> = {
  passed: { result: EnrollmentResult.PASS, isExamBanned: false },
  studying: { result: EnrollmentResult.IN_PROGRESS, isExamBanned: false },
  failed: { result: EnrollmentResult.FAIL, isExamBanned: false },
  'attendance failed': { result: EnrollmentResult.FAIL, isExamBanned: true },
  'on-going assessment fail': {
    result: EnrollmentResult.FAIL,
    isExamBanned: false,
  },
};

/**
 * Nhãn trạng thái trong file điểm là tiếng Anh, khác hẳn nhãn tiếng Việt của
 * 4 importer cũ (`RESULT_BY_LABEL` trong `excel-utils`) nên có bảng riêng.
 */
export function parseGradeStatus(raw: string): GradeStatus | null {
  return STATUS_BY_LABEL[raw.trim().toLowerCase()] ?? null;
}

function textOrEmpty(row: ExcelJS.Row, column: number | undefined): string {
  return column === undefined ? '' : cellText(row, column);
}

function numberOrNull(
  row: ExcelJS.Row,
  column: number | undefined,
): number | null {
  if (column === undefined) {
    return null;
  }
  return cellNumber(row, column) ?? null;
}

export class GradeAttendanceParser implements ImportParser {
  async parse(
    workbook: ExcelJS.Workbook,
    ctx: ImportContext,
  ): Promise<ParseResult> {
    // Parser thuần không dùng ImportContext; giữ tham số để khớp chữ ký.
    void ctx;
    await Promise.resolve();

    const { worksheet, headers } = pickDataSheet(
      workbook,
      HEADER_ROW,
      REQUIRED,
      OPTIONAL,
    );
    const at = (name: string): number | undefined =>
      headers.get(name.toLowerCase());

    const rows: ParsedRow[] = [];
    const warnings: string[] = [];
    let examClassRows = 0;

    for (
      let rowIndex = HEADER_ROW + 1;
      rowIndex <= worksheet.rowCount;
      rowIndex += 1
    ) {
      const row = worksheet.getRow(rowIndex);
      const studentCode = textOrEmpty(row, at('mã')).trim().toUpperCase();
      const classCode = textOrEmpty(row, at('tên lớp')).trim().toUpperCase();
      const subjectCode = textOrEmpty(row, at('mã môn')).trim().toUpperCase();

      if (studentCode === '' && classCode === '' && subjectCode === '') {
        continue;
      }

      if (classCode.startsWith(EXAM_CLASS_PREFIX)) {
        examClassRows += 1;
        continue;
      }

      const absence = parseAbsence(textOrEmpty(row, at('số buổi nghỉ/ts')));
      const statusLabel = textOrEmpty(row, at('trạng thái')).trim();
      const status = statusLabel === '' ? null : parseGradeStatus(statusLabel);

      const payload = {
        studentCode,
        classCode,
        subjectCode,
        sectionCode:
          classCode !== '' && subjectCode !== ''
            ? buildTermSectionCode(classCode, subjectCode)
            : '',
        // Điểm 0 là điểm tích luỹ thật (sinh viên đang học chưa có cột điểm
        // nào), KHÔNG phải "chưa có điểm" — ghi nguyên vào DB.
        totalScore: numberOrNull(row, at('điểm')),
        result: status?.result ?? null,
        isExamBanned: status?.isExamBanned ?? false,
        absentSessions: absence?.absentSessions ?? null,
        totalSessions: absence?.totalSessions ?? null,
        attendanceRate: absence === null ? null : attendanceRateFrom(absence),
      };

      rows.push({
        sheet: worksheet.name,
        rowIndex,
        payload,
        error: rowError(
          studentCode,
          classCode,
          subjectCode,
          statusLabel,
          status,
        ),
      });
    }

    if (examClassRows > 0) {
      warnings.push(
        `Bỏ qua ${examClassRows} dòng của lớp thi lại (${EXAM_CLASS_PREFIX}) — ` +
          'không phải lớp học phần trong kế hoạch giảng dạy.',
      );
    }

    return { rows, warnings, unmappedAliases: [] };
  }
}

function rowError(
  studentCode: string,
  classCode: string,
  subjectCode: string,
  statusLabel: string,
  status: GradeStatus | null,
): string | undefined {
  if (studentCode === '') {
    return 'Thiếu Mã sinh viên — không xác định được sinh viên.';
  }
  if (classCode === '') {
    return 'Thiếu Tên lớp — không xác định được lớp học phần.';
  }
  if (subjectCode === '') {
    return 'Thiếu Mã môn — không xác định được môn học.';
  }
  if (statusLabel !== '' && status === null) {
    return `Trạng thái "${statusLabel}" không nằm trong danh sách đã biết — không đoán kết quả học tập.`;
  }
  return undefined;
}
