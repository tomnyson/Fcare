import type * as ExcelJS from 'exceljs';
import { cellNumber, cellText } from '../../excel/excel-utils';
import type {
  ImportContext,
  ImportParser,
  ParsedRow,
  ParseResult,
} from '../types';
import { isoDateCell, pickDataSheet } from './term-file-utils';

const HEADER_ROW = 1;

/** Cột bắt buộc — cũng là dấu hiệu nhận diện sheet dữ liệu. */
const REQUIRED = ['Tên lớp', 'Mã môn'] as const;

const OPTIONAL = [
  'Block',
  'Ca học',
  'Ngày bắt đầu',
  'số lượng sinh viên',
  'Giảng viên',
  'Tên phòng',
] as const;

const BLOCK = /block\s*(\d+)/i;

/**
 * Mã lớp học phần cho bộ file đầu kỳ. "Tên lớp" một mình KHÔNG duy nhất:
 * file thật có 156 dòng nhưng chỉ 100 tên lớp — GD21301 xuất hiện ở 5 môn
 * khác nhau. Cặp (tên lớp, mã môn) mới duy nhất (156/156).
 */
export function buildTermSectionCode(
  classCode: string,
  subjectCode: string,
): string {
  return `${classCode.trim().toUpperCase()}-${subjectCode.trim().toUpperCase()}`;
}

function parseBlock(text: string): number | null {
  const match = BLOCK.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * Ô rỗng → null, giữ nguyên ngữ nghĩa "chưa có dữ liệu". Cột vắng mặt cũng
 * trả null: ExcelJS ném "0 is out of bounds" nếu gọi getCell với cột không
 * có, nên mọi cột tuỳ chọn phải đi qua các helper này.
 */
function textOrNull(
  row: ExcelJS.Row,
  column: number | undefined,
): string | null {
  if (column === undefined) {
    return null;
  }
  const text = cellText(row, column);
  return text === '' ? null : text;
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

function dateOrNull(
  row: ExcelJS.Row,
  column: number | undefined,
): string | null {
  return column === undefined ? null : isoDateCell(row.getCell(column));
}

export class SectionListParser implements ImportParser {
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
    const seenCodes = new Set<string>();
    const duplicateCodes = new Set<string>();

    for (
      let rowIndex = HEADER_ROW + 1;
      rowIndex <= worksheet.rowCount;
      rowIndex += 1
    ) {
      const row = worksheet.getRow(rowIndex);
      const classCode = (textOrNull(row, at('tên lớp')) ?? '')
        .trim()
        .toUpperCase();
      const subjectCode = (textOrNull(row, at('mã môn')) ?? '')
        .trim()
        .toUpperCase();

      if (classCode === '' && subjectCode === '') {
        continue;
      }

      // Ca học 0 nghĩa là chưa xếp ca, không phải "ca số 0".
      const slotNumber = numberOrNull(row, at('ca học'));
      const capacity = numberOrNull(row, at('số lượng sinh viên'));
      const startDate = dateOrNull(row, at('ngày bắt đầu'));

      const code =
        classCode !== '' && subjectCode !== ''
          ? buildTermSectionCode(classCode, subjectCode)
          : '';
      if (code !== '') {
        if (seenCodes.has(code)) {
          duplicateCodes.add(code);
        }
        seenCodes.add(code);
      }

      const payload = {
        code,
        classCode,
        subjectCode,
        block: parseBlock(textOrNull(row, at('block')) ?? ''),
        slot:
          slotNumber === null || slotNumber === 0 ? null : String(slotNumber),
        room: textOrNull(row, at('tên phòng')),
        capacity,
        startDate,
        lecturerUsername: textOrNull(row, at('giảng viên')),
      };

      let error: string | undefined;
      if (classCode === '') {
        error = 'Thiếu Tên lớp — không xác định được lớp học phần.';
      } else if (subjectCode === '') {
        error = 'Thiếu Mã môn — không xác định được môn học.';
      }

      rows.push({ sheet: worksheet.name, rowIndex, payload, error });
    }

    if (duplicateCodes.size > 0) {
      warnings.push(
        `${duplicateCodes.size} mã lớp học phần xuất hiện nhiều lần trong file, ` +
          `chỉ dòng đầu được ghi: ${Array.from(duplicateCodes).slice(0, 5).join(', ')}.`,
      );
    }

    return { rows, warnings, unmappedAliases: [] };
  }
}
