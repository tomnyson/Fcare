import { BadRequestException } from '@nestjs/common';
import type * as ExcelJS from 'exceljs';
import { cellNumber, cellText, getWorksheet } from '../../excel/excel-utils';
import type {
  ImportContext,
  ImportParser,
  ParsedRow,
  ParseResult,
} from '../types';
import { locateHeaders, requireHeaders } from './header-locator';

export const CATALOG_SHEET = '3.1.Môn-BM';
const HEADER_ROW = 2;

const COLUMNS = [
  'Mã môn',
  'Tên môn',
  'Số TC',
  'Bộ môn',
  'Nhóm môn',
  '% đi học',
  'Số giờ thực tế',
  'Learning method',
  'Số SV max/lớp',
  'Hình thức thi',
] as const;

function textOrNull(value: string): string | null {
  return value === '' ? null : value;
}

/**
 * Đọc chuỗi ở cột TUỲ CHỌN. Cột thiếu (`column === undefined`) → trả rỗng
 * mà KHÔNG gọi `cellText(row, 0)` — cột 0 vượt biên với ExcelJS thật (chỉ
 * hợp lệ với mock chưa phản ánh giới hạn này), ném lỗi "0 is out of bounds".
 */
function optionalText(row: ExcelJS.Row, column: number | undefined): string {
  return column === undefined ? '' : cellText(row, column);
}

/** Tương tự `optionalText` nhưng cho cột số. */
function optionalNumber(
  row: ExcelJS.Row,
  column: number | undefined,
): number | undefined {
  return column === undefined ? undefined : cellNumber(row, column);
}

export class CatalogParser implements ImportParser {
  async parse(
    workbook: ExcelJS.Workbook,
    ctx: ImportContext,
  ): Promise<ParseResult> {
    // Parser thuần không dùng ImportContext (term/user) — chỉ giữ tham số để
    // khớp chữ ký ImportParser.parse.
    void ctx;
    // Parser chạy hoàn toàn đồng bộ nhưng ImportParser.parse trả Promise, nên
    // cần một `await` để thoả rule `@typescript-eslint/require-await`. Không
    // liên quan tới ngữ nghĩa throw: hàm `async` luôn reject khi throw.
    await Promise.resolve();
    const worksheet = getWorksheet(workbook, CATALOG_SHEET);
    if (!worksheet) {
      throw new BadRequestException(
        `File thiếu sheet "${CATALOG_SHEET}" — đây không phải file danh mục môn học.`,
      );
    }

    const headers = locateHeaders(worksheet, HEADER_ROW, COLUMNS);
    requireHeaders(
      headers,
      ['Mã môn', 'Tên môn', 'Số TC', 'Bộ môn'],
      CATALOG_SHEET,
    );

    const at = (name: string): number | undefined =>
      headers.get(name.toLowerCase());

    const rows: ParsedRow[] = [];
    const seen = new Set<string>();

    for (
      let rowIndex = HEADER_ROW + 1;
      rowIndex <= worksheet.rowCount;
      rowIndex += 1
    ) {
      const row = worksheet.getRow(rowIndex);
      const code = cellText(row, at('mã môn')!).toUpperCase();
      const name = cellText(row, at('tên môn')!);
      const deptAlias = cellText(row, at('bộ môn')!);
      const credits = cellNumber(row, at('số tc')!);

      // Dòng rỗng hoàn toàn → bỏ hẳn, không tính là lỗi.
      if (code === '' && name === '' && deptAlias === '') {
        continue;
      }

      const payload = {
        code,
        name,
        credits: credits ?? 0,
        deptAlias,
        subjectGroup: textOrNull(optionalText(row, at('nhóm môn'))),
        hoursTotal: optionalNumber(row, at('số giờ thực tế')) ?? null,
        learningMethod: textOrNull(optionalText(row, at('learning method'))),
        maxStudents: optionalNumber(row, at('số sv max/lớp')) ?? null,
        examForm: textOrNull(optionalText(row, at('hình thức thi'))),
        attendanceRateRequired: optionalNumber(row, at('% đi học')) ?? null,
      };

      let error: string | undefined;
      if (code === '') {
        error = 'Thiếu mã môn.';
      } else if (name === '') {
        error = 'Thiếu tên môn.';
      } else if (credits === undefined) {
        error = 'Thiếu hoặc sai định dạng cột "Số TC".';
      } else if (seen.has(code)) {
        error = `Mã môn "${code}" trùng với dòng trước trong cùng file.`;
      }

      if (!error) {
        seen.add(code);
      }
      rows.push({ sheet: CATALOG_SHEET, rowIndex, payload, error });
    }

    return { rows, warnings: [], unmappedAliases: [] };
  }
}
