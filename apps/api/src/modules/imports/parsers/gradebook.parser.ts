import { EnrollmentResult } from '@prisma/client';
import type * as ExcelJS from 'exceljs';
import { cellNumber, cellText, resultFromLabel } from '../../excel/excel-utils';
import type {
  ImportContext,
  ImportParser,
  ParsedRow,
  ParseResult,
} from '../types';
import { locateHeaders, normalizeHeader } from './header-locator';

const HEADER_ROW = 1;

const COLUMNS = [
  'Mã sinh viên',
  'Họ và tên',
  'Lớp',
  'Điểm tổng kết',
  'Trạng thái',
] as const;

const MA_SINH_VIEN = normalizeHeader('Mã sinh viên');
const DIEM_TONG_KET = normalizeHeader('Điểm tổng kết');

/** Wrapper mỏng quanh nguồn chuẩn hoá duy nhất `resultFromLabel`
 * (excel-utils.ts) — ở đây mặc định IN_PROGRESS khi nhãn không nhận ra,
 * khác với `grades-excel.service.parseResult` (trả undefined). Chủ ý, không
 * phải lỗi: hai chỗ gọi có ngữ nghĩa khác nhau. */
export function parseEnrollmentResult(label: string): EnrollmentResult {
  return resultFromLabel(label) ?? EnrollmentResult.IN_PROGRESS;
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
    let nonNumericScoreCount = 0;
    const unusualResultLabels = new Map<string, number>();

    workbook.eachSheet((worksheet) => {
      const headers = locateHeaders(worksheet, HEADER_ROW, COLUMNS);
      // Sheet thống kê / ghi chú không có hai cột này → bỏ cả sheet, ghi cảnh báo.
      // requireHeaders không cần ở đây: guard này đã đảm bảo có cột trước khi
      // đọc, requireHeaders phía sau nó trước đây không bao giờ ném được
      // (code chết) — bỏ hẳn, dùng thẳng hằng số đã normalizeHeader.
      if (!headers.has(MA_SINH_VIEN) || !headers.has(DIEM_TONG_KET)) {
        warnings.push(
          `Bỏ qua sheet "${worksheet.name}": thiếu cột "Mã sinh viên" hoặc "Điểm tổng kết".`,
        );
        return;
      }

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
        // 'mã sinh viên'/'điểm tổng kết' bắt buộc — guard ở trên đã đảm bảo
        // có cột, dùng '!' an toàn ở đây.
        const studentCode = cellText(row, at('mã sinh viên')!)
          .trim()
          .toUpperCase();
        const fullName = optionalText(row, at('họ và tên')).trim();
        const rawClass = optionalText(row, at('lớp')).trim();

        if (studentCode === '' && fullName === '') {
          continue;
        }

        const scoreColumn = at('điểm tổng kết')!;
        const scoreText = cellText(row, scoreColumn);
        const totalScore = cellNumber(row, scoreColumn);
        // Ô có chữ ("MI", "-"...) và ô rỗng đều cho totalScore undefined —
        // chỉ ô CÓ chữ mới đáng cảnh báo (rỗng = sinh viên chưa có điểm,
        // hợp lệ, không cần biết).
        if (scoreText !== '' && totalScore === undefined) {
          nonNumericScoreCount += 1;
        }

        const resultLabel = optionalText(row, at('trạng thái')).trim();
        if (resultLabel !== '' && resultFromLabel(resultLabel) === undefined) {
          unusualResultLabels.set(
            resultLabel,
            (unusualResultLabels.get(resultLabel) ?? 0) + 1,
          );
        }

        const payload = {
          subjectCode,
          studentCode,
          fullName,
          rawClass,
          totalScore: totalScore ?? null,
          resultLabel,
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

    if (nonNumericScoreCount > 0) {
      warnings.push(
        `${nonNumericScoreCount} ô "Điểm tổng kết" chứa giá trị không phải số (vd: "MI", "-") — được ghi nhận là chưa có điểm.`,
      );
    }
    if (unusualResultLabels.size > 0) {
      const total = Array.from(unusualResultLabels.values()).reduce(
        (sum, count) => sum + count,
        0,
      );
      const top5 = Array.from(unusualResultLabels.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => `"${label}" (${count})`)
        .join(', ');
      warnings.push(
        `${total} dòng có nhãn "Trạng thái" không nhận diện được, được xem là đang học: ${top5}.`,
      );
    }

    return { rows, warnings, unmappedAliases: [] };
  }
}
