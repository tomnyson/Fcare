import { BadRequestException } from '@nestjs/common';
import type * as ExcelJS from 'exceljs';
import { locateHeaders, normalizeHeader } from './header-locator';

/**
 * Tiện ích dùng chung cho bộ file nhà trường gửi đầu kỳ (`docs/tailieu/`):
 * danh sách lớp, danh sách sinh viên theo lớp môn, lịch học chuyên cần.
 * Ba file này khác định dạng với 4 importer cũ nên có helper riêng.
 */

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

// "Mon Aug 03 2026 07:00:00 GMT+0700 (Indochina Time)" — phần giờ là tuỳ chọn.
const JS_DATE = /^[a-z]{3}\s+([a-z]{3})\s+(\d{1,2})\s+(\d{4})\b/i;

/** Số ngày của `month` (1-based) trong `year`, ở UTC. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Ô ngày trong bộ file này được xuất bằng `Date.prototype.toString()` của JS
 * ("Mon Aug 03 2026 07:00:00 GMT+0700"). KHÔNG dùng `new Date(text)`: chuỗi
 * mang GMT+0700 sẽ lùi về ngày hôm trước khi đổi sang UTC. Chỉ lấy phần ngày
 * theo tên tháng — không nhập nhằng dd/mm với mm/dd.
 */
export function parseJsDateString(text: string): string | null {
  const match = JS_DATE.exec(text.trim());
  if (!match) {
    return null;
  }
  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month === undefined || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

/** Ô ngày: ExcelJS trả Date thật thì dùng luôn, ngược lại đọc dạng chuỗi. */
export function isoDateCell(cell: ExcelJS.Cell): string | null {
  const value: unknown = cell.value;
  if (value instanceof Date) {
    return value.toISOString();
  }
  return parseJsDateString(String(cell.text ?? ''));
}

interface AbsenceCount {
  absentSessions: number;
  totalSessions: number;
}

// "2 / 18 buổi" — chấp nhận thiếu khoảng trắng và thiếu chữ "buổi".
const ABSENCE = /^(\d{1,3})\s*\/\s*(\d{1,3})\s*(buổi)?$/i;

/**
 * Tách cột "Số buổi nghỉ/TS". Trả null khi ô rỗng, sai định dạng, hoặc số
 * buổi nghỉ vượt tổng số buổi — dữ liệu mâu thuẫn thì bỏ qua còn hơn ghi
 * vào DB một tỉ lệ chuyên cần âm.
 */
export function parseAbsence(text: string): AbsenceCount | null {
  const match = ABSENCE.exec(text.trim());
  if (!match) {
    return null;
  }
  const absentSessions = Number(match[1]);
  const totalSessions = Number(match[2]);
  if (absentSessions > totalSessions) {
    return null;
  }
  return { absentSessions, totalSessions };
}

/**
 * Tỉ lệ chuyên cần 0..100 (khớp `Enrollment.attendanceRate`). Lớp chưa điểm
 * danh buổi nào ("0 / 0 buổi") trả null thay vì chia cho 0.
 */
export function attendanceRateFrom(absence: AbsenceCount): number | null {
  if (absence.totalSessions === 0) {
    return null;
  }
  const attended = absence.totalSessions - absence.absentSessions;
  return Math.round((attended / absence.totalSessions) * 1000) / 10;
}

interface DataSheet {
  worksheet: ExcelJS.Worksheet;
  headers: Map<string, number>;
}

/**
 * Chọn sheet dữ liệu theo HEADER, không theo tên sheet: nhà trường xuất file
 * với tên sheet chứa timestamp sinh tự động ("export_1788585247 (2)") nên
 * không hardcode được. Lấy sheet đầu tiên có đủ cột bắt buộc.
 *
 * `optional` được định vị nhưng không bắt buộc: thiếu cột tuỳ chọn thì
 * `headers` không có khoá đó, parser tự xử lý null (không được gọi
 * `getCell(undefined)` — ExcelJS ném "0 is out of bounds").
 */
export function pickDataSheet(
  workbook: ExcelJS.Workbook,
  headerRow: number,
  required: readonly string[],
  optional: readonly string[] = [],
): DataSheet {
  const wanted = required.map(normalizeHeader);
  for (const worksheet of workbook.worksheets) {
    const headers = locateHeaders(worksheet, headerRow, [
      ...required,
      ...optional,
    ]);
    if (wanted.every((name) => headers.has(name))) {
      return { worksheet, headers };
    }
  }

  const seen = workbook.worksheets.map((sheet) => `"${sheet.name}"`).join(', ');
  throw new BadRequestException(
    `Không tìm thấy sheet có đủ cột bắt buộc (${required.join(', ')}). ` +
      `File chứa các sheet: ${seen || 'không có sheet nào'}.`,
  );
}
