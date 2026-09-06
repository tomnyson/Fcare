import fs from 'node:fs';
import path from 'node:path';
import * as ExcelJS from 'exceljs';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');

/** Nơi chứa file .xlsx sinh ra lúc chạy test — gitignore, không commit. */
export const ARTIFACT_DIR = path.resolve(__dirname, '..', '.artifacts');

/**
 * File nguồn THẬT của trường, còn nguyên cột email ở sheet "T.Kê".
 * Chỉ dùng cho test RULE 1 (phải bị từ chối toàn bộ) — mọi luồng import
 * thành công đều phải dùng bản đã xoá PII bên dưới.
 */
export const ASSIGNMENT_FILE_RAW = path.join(DOCS_DIR, 'FPLTN-KH Phân công GV HK Summer 2026.xlsx');

/** File bảng điểm thật — đã kiểm: không chứa email/SĐT/CCCD ở bất kỳ sheet nào. */
export const GRADEBOOK_FILE = path.join(
  DOCS_DIR,
  'gradebook_20260504174543_hoactm_64_119_all_ (1).xlsx',
);

/** Bản phân công GV đã xoá ô PII — đúng thao tác mà UI yêu cầu người dùng làm. */
export const ASSIGNMENT_FILE_CLEAN = path.join(ARTIFACT_DIR, 'phan-cong-gv-da-xoa-pii.xlsx');

/**
 * Bản sạch PII nhưng cố tình đổi nhãn bộ môn của một dòng thành nhãn KHÔNG có
 * trong bảng ánh xạ — để bước xem trước chắc chắn cảnh báo "chưa có ánh xạ"
 * mà không phải xoá dữ liệu master thật.
 */
export const ASSIGNMENT_FILE_UNMAPPED_ALIAS = path.join(
  ARTIFACT_DIR,
  'phan-cong-gv-nhan-bo-mon-la.xlsx',
);

export const UNMAPPED_ALIAS = 'E2E-CHUA-ANH-XA';

const CATALOG_SHEET = '3.1.Môn-BM';
const CATALOG_HEADER_ROW = 2;
const DEPT_COLUMN_HEADER = 'bộ môn';

/**
 * Phải khớp FORBIDDEN_VALUE_PATTERNS ở
 * apps/api/src/modules/excel/excel-utils.ts — nếu bên đó đổi mà bên này không
 * đổi, file "sạch" sinh ra sẽ vẫn bị API từ chối và test import sẽ đỏ đúng lúc
 * cần đỏ.
 */
const FORBIDDEN_VALUE_PATTERNS: readonly RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /(^|\D)(?:\+?84|0)(?:3|5|7|8|9)\d{8}(\D|$)/,
  /(^|\D)\d{12}(\D|$)/,
];

function stripForbiddenValues(workbook: ExcelJS.Workbook): number {
  let removed = 0;
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const text = cell.text.trim();
        if (text === '') {
          return;
        }
        if (FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(text))) {
          cell.value = null;
          removed += 1;
        }
      });
    });
  }
  return removed;
}

function findDeptColumn(worksheet: ExcelJS.Worksheet): number {
  let column = 0;
  worksheet.getRow(CATALOG_HEADER_ROW).eachCell({ includeEmpty: false }, (cell, index) => {
    if (cell.text.trim().toLowerCase() === DEPT_COLUMN_HEADER) {
      column = index;
    }
  });
  if (column === 0) {
    throw new Error(`Không tìm thấy cột "Bộ môn" ở sheet ${CATALOG_SHEET}.`);
  }
  return column;
}

/** Đặt nhãn bộ môn lạ cho dòng dữ liệu đầu tiên của sheet danh mục môn học. */
function injectUnmappedAlias(workbook: ExcelJS.Workbook): void {
  const worksheet = workbook.worksheets.find((sheet) => sheet.name.trim() === CATALOG_SHEET);
  if (!worksheet) {
    throw new Error(`File nguồn thiếu sheet ${CATALOG_SHEET}.`);
  }
  const column = findDeptColumn(worksheet);
  for (let rowIndex = CATALOG_HEADER_ROW + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    if (row.getCell(column).text.trim() !== '') {
      row.getCell(column).value = UNMAPPED_ALIAS;
      return;
    }
  }
  throw new Error(`Sheet ${CATALOG_SHEET} không có dòng dữ liệu nào để gắn nhãn lạ.`);
}

async function readWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

/**
 * Sinh các file .xlsx phái sinh mà bộ test cần. Chạy trong global setup nên
 * mọi project trình duyệt dùng chung một bản, không đua ghi file.
 */
export async function buildExcelFixtures(): Promise<void> {
  if (!fs.existsSync(ASSIGNMENT_FILE_RAW)) {
    throw new Error(`Thiếu file nguồn: ${ASSIGNMENT_FILE_RAW}`);
  }
  if (!fs.existsSync(GRADEBOOK_FILE)) {
    throw new Error(`Thiếu file nguồn: ${GRADEBOOK_FILE}`);
  }
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const clean = await readWorkbook(ASSIGNMENT_FILE_RAW);
  const removed = stripForbiddenValues(clean);
  if (removed === 0) {
    throw new Error(
      'File phân công GV không còn ô PII nào — test từ chối PII sẽ mất ý nghĩa. Kiểm tra lại file nguồn.',
    );
  }
  await clean.xlsx.writeFile(ASSIGNMENT_FILE_CLEAN);

  const unmapped = await readWorkbook(ASSIGNMENT_FILE_CLEAN);
  injectUnmappedAlias(unmapped);
  await unmapped.xlsx.writeFile(ASSIGNMENT_FILE_UNMAPPED_ALIAS);
}
