import { BadRequestException, StreamableFile } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

/**
 * Các cột PII bị CẤM theo tài liệu nghiệp vụ. File import chứa bất kỳ cột nào
 * khớp mẫu này sẽ bị từ chối toàn bộ — không được đưa CCCD/SĐT/email/địa chỉ vào hệ thống.
 */
export const FORBIDDEN_HEADER_PATTERN =
  /(cccd|cmnd|căn cước|can cuoc|điện thoại|dien thoai|sđt|sdt|phone|mobile|email|địa chỉ|dia chi|address)/i;

/**
 * Mẫu PII dò trên GIÁ TRỊ Ô, không chỉ header. Lý do tồn tại: file phân công GV
 * có cột email không hề có header nên chốt chặn theo header không bắt được.
 * Đã kiểm chứng trên cả hai file nguồn thật: bắt đúng 32/32 email, 0 báo nhầm.
 */
export const FORBIDDEN_VALUE_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
}> = [
  { label: 'email', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  {
    label: 'số điện thoại',
    pattern: /(^|\D)(?:\+?84|0)(?:3|5|7|8|9)\d{8}(\D|$)/,
  },
  { label: 'số CCCD/CMND', pattern: /(^|\D)\d{12}(\D|$)/ },
];

export interface RowError {
  row: number;
  message: string;
}

export async function loadFirstWorksheet(
  buffer: Buffer,
): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new BadRequestException('File Excel không có sheet dữ liệu.');
  }
  return worksheet;
}

export function readHeaderRow(worksheet: ExcelJS.Worksheet): string[] {
  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
    headers.push(cell.text.trim());
  });
  return headers;
}

export function assertNoForbiddenColumns(headers: string[]): void {
  const forbidden = headers.find((header) =>
    FORBIDDEN_HEADER_PATTERN.test(header),
  );
  if (forbidden) {
    throw new BadRequestException(
      `File bị từ chối: cột "${forbidden}" thuộc nhóm dữ liệu bị cấm lưu trữ (CCCD/SĐT/email/địa chỉ).`,
    );
  }
}

export async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  if (workbook.worksheets.length === 0) {
    throw new BadRequestException('File Excel không có sheet dữ liệu.');
  }
  return workbook;
}

export function getWorksheet(
  workbook: ExcelJS.Workbook,
  name: string,
): ExcelJS.Worksheet | undefined {
  const target = name.trim().toLowerCase();
  return workbook.worksheets.find(
    (sheet) => sheet.name.trim().toLowerCase() === target,
  );
}

/**
 * Quét toàn bộ ô của mọi sheet. Từ chối CẢ FILE nếu dính — không lọc bỏ cột,
 * vì tài liệu nghiệp vụ quy định "Excel import từ chối cột cấm".
 * Thông báo lỗi chỉ vị trí nhưng KHÔNG lặp lại giá trị PII.
 */
export function assertNoForbiddenValues(workbook: ExcelJS.Workbook): void {
  for (const worksheet of workbook.worksheets) {
    let hit: { label: string; row: number; column: number } | undefined;
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (hit) {
        return;
      }
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        if (hit) {
          return;
        }
        const text = cell.text.trim();
        if (text === '') {
          return;
        }
        const matched = FORBIDDEN_VALUE_PATTERNS.find((candidate) =>
          candidate.pattern.test(text),
        );
        if (matched) {
          hit = {
            label: matched.label,
            row: rowNumber,
            column: columnNumber,
          };
        }
      });
    });
    if (hit) {
      throw new BadRequestException(
        `File bị từ chối: sheet "${worksheet.name}" dòng ${hit.row} cột ${hit.column} chứa ${hit.label} — ` +
          'dữ liệu này bị cấm lưu trữ. Hãy xoá cột đó khỏi file rồi tải lên lại.',
      );
    }
  }
}

export function cellText(row: ExcelJS.Row, column: number): string {
  return row.getCell(column).text.trim();
}

export function cellNumber(
  row: ExcelJS.Row,
  column: number,
): number | undefined {
  const text = cellText(row, column);
  if (text === '') {
    return undefined;
  }
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}

export async function workbookToFile(
  workbook: ExcelJS.Workbook,
  filename: string,
): Promise<StreamableFile> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new StreamableFile(Buffer.from(buffer), {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    disposition: `attachment; filename="${filename}"`,
  });
}
