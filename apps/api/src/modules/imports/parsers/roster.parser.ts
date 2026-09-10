import type * as ExcelJS from 'exceljs';
import { StudentStatus } from '@prisma/client';
import { cellText } from '../../excel/excel-utils';
import type {
  ImportContext,
  ImportParser,
  ParsedRow,
  ParseResult,
} from '../types';
import { buildTermSectionCode } from './section-list.parser';
import { pickDataSheet } from './term-file-utils';

const HEADER_ROW = 1;

/** Cột bắt buộc — cũng là dấu hiệu nhận diện sheet dữ liệu. */
const REQUIRED = ['Mã sinh viên', 'Họ và tên', 'ID lớp', 'Mã môn'] as const;

const OPTIONAL = ['Trạng thái', 'Mã Ngành'] as const;

/**
 * Nhãn trạng thái sinh viên trong file có dạng "MÃ ( diễn giải )" — phần diễn
 * giải đổi theo từng kỳ nên chỉ khớp theo mã đứng đầu.
 *
 * Quyết định nghiệp vụ: "chờ xét tốt nghiệp" (BB2) và "chuyển cơ sở" vẫn tính
 * là ĐANG HỌC — không thêm giá trị mới vào `StudentStatus` cho hai nhóm này.
 */
const STATUS_BY_CODE: Record<string, StudentStatus> = {
  HDI: StudentStatus.STUDYING, // học đi
  TN2: StudentStatus.STUDYING, // học lại
  TN3: StudentStatus.STUDYING, // chờ xếp lớp học lại
  BB2: StudentStatus.STUDYING, // chờ xét tốt nghiệp
  TN1: StudentStatus.RESERVED, // bảo lưu tự nguyện
  THO: StudentStatus.DROPPED_OUT, // dropout
};

/** Nhãn không có mã đứng đầu — khớp nguyên văn sau khi chuẩn hoá. */
const STATUS_BY_LABEL: Record<string, StudentStatus> = {
  'chuyển cơ sở': StudentStatus.STUDYING,
};

/** Nhãn lạ → null: KHÔNG đoán trạng thái, committer sẽ giữ nguyên giá trị cũ. */
export function parseStudentStatus(raw: string): StudentStatus | null {
  const value = raw.trim();
  if (value === '') {
    return null;
  }
  const code = /^([A-Za-z0-9]{2,4})\s*\(/.exec(value)?.[1]?.toUpperCase();
  if (code && STATUS_BY_CODE[code]) {
    return STATUS_BY_CODE[code];
  }
  return STATUS_BY_LABEL[value.toLowerCase()] ?? null;
}

function textOrEmpty(row: ExcelJS.Row, column: number | undefined): string {
  return column === undefined ? '' : cellText(row, column);
}

export class RosterParser implements ImportParser {
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
    const unknownStatuses = new Set<string>();

    for (
      let rowIndex = HEADER_ROW + 1;
      rowIndex <= worksheet.rowCount;
      rowIndex += 1
    ) {
      const row = worksheet.getRow(rowIndex);
      const studentCode = textOrEmpty(row, at('mã sinh viên')).toUpperCase();
      const fullName = textOrEmpty(row, at('họ và tên'));
      // "ID lớp" chứa TÊN lớp học phần ("PDP102.01") còn "Tên lớp" chứa id số
      // — hai cột bị đặt tên ngược trong file gốc. Dùng đúng cột theo dữ liệu.
      const classCode = textOrEmpty(row, at('id lớp')).toUpperCase();
      const subjectCode = textOrEmpty(row, at('mã môn')).toUpperCase();

      if (
        studentCode === '' &&
        fullName === '' &&
        classCode === '' &&
        subjectCode === ''
      ) {
        continue;
      }

      const statusLabel = textOrEmpty(row, at('trạng thái'));
      const status = parseStudentStatus(statusLabel);
      if (status === null && statusLabel !== '') {
        unknownStatuses.add(statusLabel);
      }

      const payload = {
        studentCode,
        fullName,
        majorAlias: textOrEmpty(row, at('mã ngành')) || null,
        classCode,
        subjectCode,
        sectionCode:
          classCode !== '' && subjectCode !== ''
            ? buildTermSectionCode(classCode, subjectCode)
            : '',
        status,
      };

      rows.push({
        sheet: worksheet.name,
        rowIndex,
        payload,
        error: rowError(studentCode, fullName, classCode, subjectCode),
      });
    }

    const warnings: string[] = [];
    if (unknownStatuses.size > 0) {
      warnings.push(
        `Không nhận diện được ${unknownStatuses.size} nhãn trạng thái, giữ nguyên ` +
          `trạng thái hiện tại của sinh viên: ${Array.from(unknownStatuses).join(', ')}.`,
      );
    }

    return { rows, warnings, unmappedAliases: [] };
  }
}

function rowError(
  studentCode: string,
  fullName: string,
  classCode: string,
  subjectCode: string,
): string | undefined {
  if (studentCode === '') {
    return 'Thiếu Mã sinh viên — không xác định được sinh viên.';
  }
  if (fullName === '') {
    return 'Thiếu Họ và tên — không tạo được hồ sơ sinh viên.';
  }
  if (classCode === '') {
    return 'Thiếu ID lớp — không xác định được lớp học phần.';
  }
  if (subjectCode === '') {
    return 'Thiếu Mã môn — không xác định được môn học.';
  }
  return undefined;
}
