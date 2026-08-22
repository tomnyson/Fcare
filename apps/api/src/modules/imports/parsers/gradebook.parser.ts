import { EnrollmentResult } from '@prisma/client';
import type * as ExcelJS from 'exceljs';
import { cellNumber, cellText } from '../../excel/excel-utils';
import type {
  ImportContext,
  ImportParser,
  ParsedRow,
  ParseResult,
} from '../types';
import { locateHeaders, requireHeaders } from './header-locator';

const HEADER_ROW = 1;

const COLUMNS = [
  'Mã sinh viên',
  'Họ và tên',
  'Lớp',
  'Điểm tổng kết',
  'Trạng thái',
] as const;

/**
 * File thật có cả "Đạt", "Trượt", "Không đạt" và ô rỗng — RESULT_BY_LABEL cũ
 * trong grades-excel.service.ts thiếu "Không đạt" (spec §2.1 đặc điểm 3).
 */
const RESULT_BY_LABEL: Record<string, EnrollmentResult> = {
  đạt: EnrollmentResult.PASS,
  trượt: EnrollmentResult.FAIL,
  'không đạt': EnrollmentResult.FAIL,
  'đang học': EnrollmentResult.IN_PROGRESS,
};

export function parseEnrollmentResult(label: string): EnrollmentResult {
  return (
    RESULT_BY_LABEL[label.replace(/\s+/g, ' ').trim().toLowerCase()] ??
    EnrollmentResult.IN_PROGRESS
  );
}

/**
 * Đọc chuỗi ở cột TUỲ CHỌN. Cột thiếu (`column === undefined`) → trả rỗng
 * mà KHÔNG gọi `cellText(row, 0)` — cột 0 vượt biên với ExcelJS thật (chỉ
 * hợp lệ với mock chưa phản ánh giới hạn này), ném lỗi "0 is out of bounds".
 */
function optionalText(row: ExcelJS.Row, column: number | undefined): string {
  return column === undefined ? '' : cellText(row, column);
}

export class GradebookParser implements ImportParser {
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

    const rows: ParsedRow[] = [];
    const warnings: string[] = [];

    workbook.eachSheet((worksheet) => {
      const headers = locateHeaders(worksheet, HEADER_ROW, COLUMNS);
      // Sheet thống kê / ghi chú không có hai cột này → bỏ cả sheet, ghi cảnh báo.
      if (!headers.has('mã sinh viên') || !headers.has('điểm tổng kết')) {
        warnings.push(
          `Bỏ qua sheet "${worksheet.name}": thiếu cột "Mã sinh viên" hoặc "Điểm tổng kết".`,
        );
        return;
      }
      requireHeaders(
        headers,
        ['Mã sinh viên', 'Điểm tổng kết'],
        worksheet.name,
      );

      // Tra map header đã qua normalizeHeader (lowercase) — dùng name.toLowerCase().
      const at = (name: string): number | undefined =>
        headers.get(name.toLowerCase());
      const subjectCode = worksheet.name.trim().toUpperCase();

      for (
        let rowIndex = HEADER_ROW + 1;
        rowIndex <= worksheet.rowCount;
        rowIndex += 1
      ) {
        const row = worksheet.getRow(rowIndex);
        // 'mã sinh viên'/'điểm tổng kết' bắt buộc — requireHeaders ở trên
        // đã đảm bảo có cột, dùng '!' an toàn ở đây.
        const studentCode = cellText(row, at('mã sinh viên')!)
          .trim()
          .toUpperCase();
        const fullName = optionalText(row, at('họ và tên')).trim();
        const rawClass = optionalText(row, at('lớp')).trim();

        if (studentCode === '' && fullName === '') {
          continue;
        }

        const totalScore = cellNumber(row, at('điểm tổng kết')!);
        const payload = {
          subjectCode,
          studentCode,
          fullName,
          rawClass,
          totalScore: totalScore ?? null,
          resultLabel: optionalText(row, at('trạng thái')).trim(),
        };

        let error: string | undefined;
        if (studentCode === '') {
          error = 'Thiếu Mã sinh viên.';
        } else if (fullName === '') {
          error = 'Thiếu họ và tên.';
        } else if (rawClass === '') {
          error = 'Thiếu mã lớp — không xác định được lớp học phần.';
        } else if (
          totalScore !== undefined &&
          (totalScore < 0 || totalScore > 10)
        ) {
          error = `Điểm tổng kết ${totalScore} nằm ngoài thang 0 đến 10.`;
        }

        rows.push({ sheet: worksheet.name, rowIndex, payload, error });
      }
    });

    return { rows, warnings, unmappedAliases: [] };
  }
}
