import { BadRequestException, StreamableFile } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

/**
 * Các cột PII bị CẤM theo tài liệu nghiệp vụ. File import chứa bất kỳ cột nào
 * khớp mẫu này sẽ bị từ chối toàn bộ — không được đưa CCCD/SĐT/email/địa chỉ vào hệ thống.
 */
export const FORBIDDEN_HEADER_PATTERN =
  /(cccd|cmnd|căn cước|can cuoc|điện thoại|dien thoai|sđt|sdt|phone|mobile|email|địa chỉ|dia chi|address)/i;

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
