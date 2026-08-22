import { BadRequestException } from '@nestjs/common';
import type * as ExcelJS from 'exceljs';
import { cellText, getWorksheet } from '../../excel/excel-utils';
import type {
  ImportContext,
  ImportParser,
  ParsedRow,
  ParseResult,
} from '../types';

export const LECTURER_SHEET = 'T.Kê';
const DATA_START_ROW = 2;

/**
 * Header sheet này KHÔNG tin được (ô G header là "36" trong khi dữ liệu là họ
 * tên) nên ánh xạ theo vị trí cột đã kiểm chứng trên file thật.
 * CỐ Ý bỏ cột I (email): RULE 1 cấm lưu email. Đây là lớp chặn thứ hai sau
 * assertNoForbiddenValues.
 */
const COL_USERNAME = 1;
const COL_TYPE = 6;
const COL_FULL_NAME = 7;

function parseLecturerType(raw: string): 'FULL' | 'PART' | null {
  const value = raw.trim().toUpperCase();
  if (value === 'FULL') return 'FULL';
  if (value === 'PART') return 'PART';
  return null;
}

export class LecturerParser implements ImportParser {
  async parse(
    workbook: ExcelJS.Workbook,
    ctx: ImportContext,
  ): Promise<ParseResult> {
    // Parser thuần không dùng ImportContext (term) — chỉ giữ tham số để khớp
    // chữ ký ImportParser.parse.
    void ctx;
    // Parser chạy hoàn toàn đồng bộ nhưng ImportParser.parse trả Promise, nên
    // cần một `await` để thoả rule `@typescript-eslint/require-await`. Không
    // liên quan tới ngữ nghĩa throw: hàm `async` luôn reject khi throw.
    await Promise.resolve();
    const worksheet = getWorksheet(workbook, LECTURER_SHEET);
    if (!worksheet) {
      throw new BadRequestException(
        `File thiếu sheet "${LECTURER_SHEET}" — đây không phải file danh sách giảng viên.`,
      );
    }

    const rows: ParsedRow[] = [];
    const seen = new Set<string>();

    for (
      let rowIndex = DATA_START_ROW;
      rowIndex <= worksheet.rowCount;
      rowIndex += 1
    ) {
      const row = worksheet.getRow(rowIndex);
      const username = cellText(row, COL_USERNAME).trim();
      const fullName = cellText(row, COL_FULL_NAME).trim();

      if (username === '' && fullName === '') {
        continue;
      }

      const payload = {
        username,
        fullName,
        lecturerType: parseLecturerType(cellText(row, COL_TYPE)),
      };

      let error: string | undefined;
      if (username === '') {
        error = 'Thiếu username giảng viên.';
      } else if (fullName === '') {
        error = 'Thiếu họ tên giảng viên.';
      } else if (seen.has(username.toLowerCase())) {
        error = `Username "${username}" trùng với dòng trước trong cùng file.`;
      }

      if (!error) {
        seen.add(username.toLowerCase());
      }
      rows.push({ sheet: LECTURER_SHEET, rowIndex, payload, error });
    }

    return { rows, warnings: [], unmappedAliases: [] };
  }
}
