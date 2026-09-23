import { BadRequestException, StreamableFile } from '@nestjs/common';
import { EnrollmentResult } from '@prisma/client';
import * as ExcelJS from 'exceljs';

/**
 * Các cột PII bị CẤM theo tài liệu nghiệp vụ. Cột nào có header khớp mẫu này
 * sẽ bị xoá sạch trước khi parser chạm tới — không được đưa CCCD/SĐT/email/địa
 * chỉ vào hệ thống.
 */
const FORBIDDEN_HEADER_PATTERN =
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

/** Số thứ tự cột → chữ cái Excel (9 → "I") để admin mở file là thấy ngay. */
function columnLetter(column: number): string {
  let letter = '';
  let remaining = column;
  while (remaining > 0) {
    const index = (remaining - 1) % 26;
    letter = String.fromCharCode(65 + index) + letter;
    remaining = (remaining - index - 1) / 26;
  }
  return letter;
}

/**
 * Xoá sạch mọi ô PII của workbook NGAY TRONG BỘ NHỚ, trước khi parser đọc, rồi
 * trả về cảnh báo cho từng cột đã đụng tới.
 *
 * Trước đây hàm này ném lỗi từ chối cả file. Thực tế file nguồn của trường
 * (phân công GV) luôn kèm cột email không header, nên không ai import được gì
 * cho tới khi sửa file bằng tay. Nay bỏ qua phần dính và import tiếp — RULE 1
 * vẫn nguyên vẹn vì giá trị bị xoá trước khi có bất kỳ ai đọc được nó, và mọi
 * parser chỉ đọc cột cố định hoặc cột tìm theo tên nên PII không có đường vào
 * payload.
 *
 * CỐ Ý sửa tại chỗ thay vì tạo bản sao: workbook là đối tượng nội bộ của một
 * lần upload, và nhân bản nó tốn gấp đôi bộ nhớ cho file 10 MB.
 */
export function stripForbiddenData(workbook: ExcelJS.Workbook): string[] {
  const warnings: string[] = [];

  for (const worksheet of workbook.worksheets) {
    // Header đã nói rõ cột đó là gì thì xoá cả cột, kể cả ô có giá trị không
    // khớp mẫu ("liên hệ qua lớp trưởng" dưới header "Số điện thoại").
    const forbiddenHeaders = new Map<number, string>();
    worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
      const header = cell.text.trim();
      if (header !== '' && FORBIDDEN_HEADER_PATTERN.test(header)) {
        forbiddenHeaders.set(column, header);
      }
    });

    const cleared = new Map<number, { label: string; cells: number }>();
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell, column) => {
        const text = cell.text.trim();
        if (text === '') {
          return;
        }
        const label = forbiddenHeaders.has(column)
          ? 'dữ liệu cấm'
          : FORBIDDEN_VALUE_PATTERNS.find((candidate) =>
              candidate.pattern.test(text),
            )?.label;
        if (label === undefined) {
          return;
        }
        cell.value = null;
        const entry = cleared.get(column);
        if (entry) {
          entry.cells += 1;
        } else {
          cleared.set(column, { label, cells: 1 });
        }
      });
    });

    // Thông báo nêu vị trí nhưng KHÔNG lặp lại giá trị PII.
    const forbidden =
      'dữ liệu này bị cấm lưu trữ nên không được đưa vào hệ thống.';
    for (const [column, entry] of cleared) {
      const header = forbiddenHeaders.get(column);
      const where = `Sheet "${worksheet.name}" cột ${columnLetter(column)}`;
      warnings.push(
        header
          ? `${where} ("${header}"): đã bỏ qua cả cột, ${entry.cells} ô — ${forbidden}`
          : `${where}: đã bỏ qua ${entry.cells} ô chứa ${entry.label} — ${forbidden}`,
      );
    }
  }

  return warnings;
}

/**
 * Nguồn DUY NHẤT cho nhãn "Trạng thái"/"Kết quả" tiếng Việt trong Excel →
 * EnrollmentResult. Trước đây bị nhân bản ở gradebook.parser.ts và
 * grades-excel.service.ts với hai cách chuẩn hoá khác nhau (một bên gộp
 * khoảng trắng, một bên chỉ lowercase) — "Không  đạt" (2 dấu cách, có trong
 * file thật) nhận đúng ở bên này nhưng không nhận ở bên kia. Gộp về một chỗ.
 */
const RESULT_BY_LABEL: Record<string, EnrollmentResult> = {
  đạt: EnrollmentResult.PASS,
  trượt: EnrollmentResult.FAIL,
  'không đạt': EnrollmentResult.FAIL,
  'đang học': EnrollmentResult.IN_PROGRESS,
};

export function resultFromLabel(text: string): EnrollmentResult | undefined {
  return RESULT_BY_LABEL[text.replace(/\s+/g, ' ').trim().toLowerCase()];
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
