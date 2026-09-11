import { BadRequestException } from '@nestjs/common';
import type * as ExcelJS from 'exceljs';
import { cellText, getWorksheet } from '../../excel/excel-utils';
import type {
  ImportContext,
  ImportParser,
  ParsedRow,
  ParseResult,
} from '../types';
import { locateHeaders, normalizeHeader } from './header-locator';

export const LECTURER_SHEET = 'T.Kê';
const DATA_START_ROW = 2;

/**
 * Sheet phân công lớp: dây nối DUY NHẤT giữa giảng viên và bộ môn trong file.
 * Sheet "T.Kê" không có cột bộ môn, nên thiếu sheet này thì `Staff.departmentId`
 * rỗng → `deptFilter` trả `__no_department__` → giảng viên không thấy sinh viên.
 */
export const ASSIGNMENT_SHEET = 'BL1+BL2';
const ASSIGNMENT_HEADER_ROW = 8;
const COL_DEPT = 'Bộ môn';
const COL_ASSIGNEES = 'Phân công giảng viên';

/**
 * Header sheet này KHÔNG tin được (ô G header là "36" trong khi dữ liệu là họ
 * tên) nên ánh xạ theo vị trí cột đã kiểm chứng trên file thật.
 * CỐ Ý bỏ cột I (email): RULE 1 cấm lưu email. Đây là lớp chặn thứ hai sau
 * stripForbiddenData — tới đây ô email đã rỗng, parser vẫn không đọc tới.
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

/**
 * Khoá so khớp giảng viên: ô phân công gõ có dấu và tuỳ hứng hoa thường
 * ("SơnLH32") trong khi username là chuỗi không dấu ("sonlh32").
 */
function lecturerKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** Một ô có thể chứa nhiều giảng viên: "thachnn12; sơnlh32". */
function splitLecturers(raw: string): string[] {
  return raw
    .split(/[;,/\n]/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * Đếm số lớp theo (giảng viên → bộ môn). Dùng Map lồng để giữ thứ tự xuất hiện,
 * nhờ đó khi hoà phiếu thì bộ môn gặp trước thắng — kết quả ổn định giữa các lần chạy.
 */
function collectDeptByLecturer(
  worksheet: ExcelJS.Worksheet,
): Map<string, Map<string, number>> {
  const headers = locateHeaders(worksheet, ASSIGNMENT_HEADER_ROW, [
    COL_DEPT,
    COL_ASSIGNEES,
  ]);
  const deptColumn = headers.get(normalizeHeader(COL_DEPT));
  const assigneeColumn = headers.get(normalizeHeader(COL_ASSIGNEES));
  const counts = new Map<string, Map<string, number>>();
  if (!deptColumn || !assigneeColumn) {
    return counts;
  }

  for (
    let rowIndex = ASSIGNMENT_HEADER_ROW + 1;
    rowIndex <= worksheet.rowCount;
    rowIndex += 1
  ) {
    const row = worksheet.getRow(rowIndex);
    const deptAlias = cellText(row, deptColumn).trim();
    if (deptAlias === '') continue;

    for (const name of splitLecturers(cellText(row, assigneeColumn))) {
      const key = lecturerKey(name);
      if (key === '') continue;
      const byDept = counts.get(key) ?? new Map<string, number>();
      byDept.set(deptAlias, (byDept.get(deptAlias) ?? 0) + 1);
      counts.set(key, byDept);
    }
  }

  return counts;
}

/** Bộ môn dạy nhiều lớp nhất; hoà phiếu → bộ môn gặp trước (thứ tự Map). */
function majorityDept(byDept: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [alias, count] of byDept) {
    if (count > bestCount) {
      best = alias;
      bestCount = count;
    }
  }
  return best;
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

    const warnings: string[] = [];
    const assignmentSheet = getWorksheet(workbook, ASSIGNMENT_SHEET);
    const deptByLecturer = assignmentSheet
      ? collectDeptByLecturer(assignmentSheet)
      : new Map<string, Map<string, number>>();
    if (!assignmentSheet) {
      warnings.push(
        `File thiếu sheet "${ASSIGNMENT_SHEET}" nên không suy được bộ môn của giảng viên — hãy gán bộ môn thủ công ở màn hình Quản trị người dùng.`,
      );
    }

    const rows: ParsedRow[] = [];
    const seen = new Set<string>();
    const withoutDept: string[] = [];

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

      const byDept = deptByLecturer.get(lecturerKey(username));
      const deptAlias = byDept ? majorityDept(byDept) : null;
      if (byDept && byDept.size > 1) {
        const detail = [...byDept.entries()]
          .map(([alias, count]) => `${alias} (${count} lớp)`)
          .join(', ');
        warnings.push(
          `Giảng viên "${username}" dạy lớp của nhiều bộ môn: ${detail}. Import lấy "${deptAlias ?? ''}" — hãy soát lại nếu chưa đúng.`,
        );
      }
      if (deptAlias === null && username !== '' && assignmentSheet) {
        withoutDept.push(username);
      }

      const payload = {
        username,
        fullName,
        lecturerType: parseLecturerType(cellText(row, COL_TYPE)),
        deptAlias,
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

    if (withoutDept.length > 0) {
      // Gộp một cảnh báo: file thật có hàng chục GV chưa xếp lớp, liệt kê rời
      // sẽ nhấn chìm các cảnh báo khác trong màn hình xem trước.
      warnings.push(
        `${withoutDept.length} giảng viên chưa có lớp nào trong sheet "${ASSIGNMENT_SHEET}" nên chưa suy được bộ môn: ${withoutDept.join(', ')}. Hãy gán bộ môn thủ công.`,
      );
    }

    return { rows, warnings, unmappedAliases: [] };
  }
}
