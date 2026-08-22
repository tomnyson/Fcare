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

export const BL_SHEET = 'BL1+BL2';
export const TOOL_SHEET = 'Lịch tool';
const BL_HEADER_ROW = 8;
const TOOL_HEADER_ROW = 1;

/** Cột `Lecturer` của "Lịch tool" đã ẩn danh hoá 100% — không dùng định danh này. */
const ANONYMIZED_LECTURER = /^giangvien\d+$/i;

interface SchedulePayload {
  subjectCode: string;
  classCode: string;
  block: number | null;
  slot: string | null;
  weekdays: string | null;
  room: string | null;
  capacity: number | null;
  trainingTime: string | null;
  startDate: string | null;
  totalHours: number | null;
  lecturerName: string | null;
}

function mergeKey(
  subjectCode: string,
  classCode: string,
  block: number | null,
): string {
  return `${subjectCode}|${classCode}|${block ?? ''}`;
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function realLecturer(raw: string): string | null {
  const value = textOrNull(raw);
  return value === null || ANONYMIZED_LECTURER.test(value) ? null : value;
}

/** Làm tròn số thực về nguyên — `capacity`/`totalHours`/`block` là `Int?` ở Prisma. */
function roundOrNull(value: number | undefined | null): number | null {
  return value === undefined || value === null ? null : Math.round(value);
}

const DD_MM_YYYY = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

/** Số ngày của `month` (1-based) trong `year`, ở UTC. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Ô ngày kiểu Text dùng định dạng Việt `dd/mm/yyyy` (chấp nhận `d/m/yyyy` và
 * dấu `-`) — KHÔNG được rơi về `new Date(text)`: engine JS đọc chuỗi kiểu
 * "11/05/2026" theo M/D/Y của Mỹ, biến ngày 11 tháng 5 thành 5 tháng 11.
 */
function parseTextDate(text: string): string | null {
  const match = DD_MM_YYYY.exec(text);
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

function isoDate(cell: ExcelJS.Cell): string | null {
  const value = cell.value;
  if (value instanceof Date) {
    return value.toISOString();
  }
  const text = String(cell.text ?? '').trim();
  return text === '' ? null : parseTextDate(text);
}

/**
 * Đọc chuỗi ở cột TUỲ CHỌN. Cột thiếu (`column === undefined`) → trả rỗng
 * mà KHÔNG gọi `cellText(row, 0)` — cột 0 vượt biên với ExcelJS thật, ném
 * lỗi "0 is out of bounds" (đã kiểm chứng khi chạy file thật ở Bước 10).
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

/** Tương tự `optionalText` nhưng cho cột ngày, trả ISO 8601 hoặc null. */
function optionalDate(
  row: ExcelJS.Row,
  column: number | undefined,
): string | null {
  return column === undefined ? null : isoDate(row.getCell(column));
}

export class ScheduleParser implements ImportParser {
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
    const bl = getWorksheet(workbook, BL_SHEET);
    const tool = getWorksheet(workbook, TOOL_SHEET);
    if (!bl && !tool) {
      throw new BadRequestException(
        `File thiếu cả hai sheet "${BL_SHEET}" và "${TOOL_SHEET}" — đây không phải file phân công giảng viên.`,
      );
    }

    const merged = new Map<
      string,
      { payload: SchedulePayload; rowIndex: number; sheet: string }
    >();
    const warnings: string[] = [];

    // ----- Lịch tool: nguồn trường lịch sạch nhất -----
    if (tool) {
      const headers = locateHeaders(tool, TOOL_HEADER_ROW, [
        'Class',
        'Subject',
        'Slot',
        'Date',
        'Room',
        'Block',
        'NumStudent',
        'TrainingTime',
      ]);
      requireHeaders(headers, ['Class', 'Subject'], TOOL_SHEET);
      const at = (name: string) => headers.get(name.toLowerCase());
      let toolCollisions = 0;

      for (
        let rowIndex = TOOL_HEADER_ROW + 1;
        rowIndex <= tool.rowCount;
        rowIndex += 1
      ) {
        const row = tool.getRow(rowIndex);
        // 'subject'/'class' bắt buộc — requireHeaders ở trên đã đảm bảo có cột.
        const subjectCode = cellText(row, at('subject')!).trim().toUpperCase();
        const classCode = cellText(row, at('class')!).trim().toUpperCase();
        if (subjectCode === '' && classCode === '') {
          continue;
        }
        const block = roundOrNull(optionalNumber(row, at('block')));
        const key = mergeKey(subjectCode, classCode, block);
        if (merged.has(key)) {
          toolCollisions += 1;
        }
        merged.set(key, {
          sheet: TOOL_SHEET,
          rowIndex,
          payload: {
            subjectCode,
            classCode,
            block,
            slot: textOrNull(optionalText(row, at('slot'))),
            weekdays: textOrNull(optionalText(row, at('date'))),
            room: textOrNull(optionalText(row, at('room'))),
            capacity: roundOrNull(optionalNumber(row, at('numstudent'))),
            trainingTime: textOrNull(optionalText(row, at('trainingtime'))),
            startDate: null,
            totalHours: null,
            lecturerName: null, // cột Lecturer đã ẩn danh — cố ý bỏ
          },
        });
      }
      if (toolCollisions > 0) {
        warnings.push(
          `${toolCollisions} dòng trùng khoá (mã môn, lớp, block) trong "${TOOL_SHEET}" — dòng sau đã ghi đè dòng trước.`,
        );
      }
    }

    // ----- BL1+BL2: nguồn giảng viên thật, lấp trường lịch còn thiếu -----
    if (bl) {
      const headers = locateHeaders(bl, BL_HEADER_ROW, [
        'Mã môn',
        'Lớp',
        'Phân công giảng viên',
        'Block',
        // File thật đặt tên cột này là "Block triển khai", không phải
        // "Block" — thấy khi verify Bước 10. Nhận cả hai để không phụ
        // thuộc vào một cách đặt tên cột duy nhất.
        'Block triển khai',
        'Ca',
        'Thứ học thực tế',
        'Phòng',
        'Thời gian bắt đầu',
        'Số lượng sinh viên',
        'Số giờ',
      ]);
      requireHeaders(headers, ['Mã môn', 'Lớp'], BL_SHEET);
      const at = (name: string) => headers.get(name.toLowerCase());
      const blockColumn = at('block') ?? at('block triển khai');

      for (
        let rowIndex = BL_HEADER_ROW + 1;
        rowIndex <= bl.rowCount;
        rowIndex += 1
      ) {
        const row = bl.getRow(rowIndex);
        // 'mã môn'/'lớp' bắt buộc — requireHeaders ở trên đã đảm bảo có cột.
        const subjectCode = cellText(row, at('mã môn')!).trim().toUpperCase();
        const classCode = cellText(row, at('lớp')!).trim().toUpperCase();
        if (subjectCode === '' && classCode === '') {
          continue;
        }
        const block = roundOrNull(optionalNumber(row, blockColumn));
        const key = mergeKey(subjectCode, classCode, block);
        const lecturerName = realLecturer(
          optionalText(row, at('phân công giảng viên')),
        );
        const existing = merged.get(key);

        if (existing) {
          // Lịch tool thắng ở trường lịch; BL1+BL2 chỉ lấp chỗ trống + giảng viên.
          // Hợp nhất giống các trường khác: chỉ ghi khi đang trống, KHÔNG xoá
          // tên thật đã có bằng một giá trị null tới sau.
          existing.payload.lecturerName ??= lecturerName;
          existing.payload.slot ??= textOrNull(optionalText(row, at('ca')));
          existing.payload.weekdays ??= textOrNull(
            optionalText(row, at('thứ học thực tế')),
          );
          existing.payload.room ??= textOrNull(optionalText(row, at('phòng')));
          existing.payload.capacity ??= roundOrNull(
            optionalNumber(row, at('số lượng sinh viên')),
          );
          existing.payload.totalHours ??= roundOrNull(
            optionalNumber(row, at('số giờ')),
          );
          existing.payload.startDate ??= optionalDate(
            row,
            at('thời gian bắt đầu'),
          );
          continue;
        }

        merged.set(key, {
          sheet: BL_SHEET,
          rowIndex,
          payload: {
            subjectCode,
            classCode,
            block,
            slot: textOrNull(optionalText(row, at('ca'))),
            weekdays: textOrNull(optionalText(row, at('thứ học thực tế'))),
            room: textOrNull(optionalText(row, at('phòng'))),
            capacity: roundOrNull(
              optionalNumber(row, at('số lượng sinh viên')),
            ),
            trainingTime: null,
            startDate: optionalDate(row, at('thời gian bắt đầu')),
            totalHours: roundOrNull(optionalNumber(row, at('số giờ'))),
            lecturerName,
          },
        });
      }
    }

    const rows: ParsedRow[] = [];
    let unassigned = 0;

    for (const entry of merged.values()) {
      let error: string | undefined;
      if (entry.payload.subjectCode === '') {
        error = 'Thiếu Mã môn.';
      } else if (entry.payload.classCode === '') {
        error = 'Thiếu mã lớp.';
      }
      if (!error && entry.payload.lecturerName === null) {
        unassigned += 1;
      }
      rows.push({
        sheet: entry.sheet,
        rowIndex: entry.rowIndex,
        payload: entry.payload as unknown as Record<string, unknown>,
        error,
      });
    }

    // Rủi ro #1: 76/94 lớp chưa phân công là THỰC TẾ của file, không phải lỗi
    // import. Nói rõ con số để người dùng không tưởng hệ thống hỏng.
    if (unassigned > 0) {
      warnings.push(
        `${unassigned}/${rows.length} lớp chưa phân công giảng viên trong file nguồn — sẽ tạo ở trạng thái "Chưa phân công", gán sau ở màn hình Lớp học phần.`,
      );
    }

    return { rows, warnings, unmappedAliases: [] };
  }
}
