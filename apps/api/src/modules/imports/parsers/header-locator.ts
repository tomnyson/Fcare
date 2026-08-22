import type * as ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';

/**
 * Chuẩn hoá tên header để so khớp: hạ chữ thường, gộp mọi khoảng trắng
 * (kể cả xuống dòng trong ô) thành một dấu cách, cắt hai đầu.
 */
export function normalizeHeader(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Trả bản đồ headerĐãChuẩnHoá → chỉ số cột (1-based).
 *
 * BẮT BUỘC dùng thay cho chỉ số cột cố định: số cột điểm thành phần thay đổi
 * theo môn nên `Điểm tổng kết` nằm ở cột 9, 17 hoặc 24 tuỳ sheet (spec §2.1).
 */
export function locateHeaders(
  worksheet: ExcelJS.Worksheet,
  headerRow: number,
  wanted: readonly string[],
): Map<string, number> {
  const wantedSet = new Set(wanted.map(normalizeHeader));
  const found = new Map<string, number>();
  const row = worksheet.getRow(headerRow);

  row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const key = normalizeHeader(String(cell.text ?? ''));
    // Header trùng tên: giữ cột đầu tiên.
    if (wantedSet.has(key) && !found.has(key)) {
      found.set(key, columnNumber);
    }
  });

  return found;
}

/** Ném lỗi nêu rõ sheet nào thiếu cột nào — thông điệp hiện thẳng cho admin. */
export function requireHeaders(
  map: Map<string, number>,
  required: readonly string[],
  sheetName: string,
): void {
  const missing = required.filter((name) => !map.has(normalizeHeader(name)));
  if (missing.length > 0) {
    throw new BadRequestException(
      `Sheet "${sheetName}" thiếu cột bắt buộc: ${missing.join(', ')}`,
    );
  }
}
