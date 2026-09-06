import * as ExcelJS from 'exceljs';
import type { ImportContext } from '../types';
import { LecturerParser } from './lecturer.parser';

/**
 * Header của sheet "T.Kê" LỆCH so với dữ liệu (ô G header là "36", dữ liệu là
 * họ tên) nên parser ánh xạ theo VỊ TRÍ đã kiểm chứng: A=username, F=loại GV,
 * G=họ tên. Cột I là email — parser KHÔNG BAO GIỜ chạm tới.
 */
function buildWorkbook(rows: Array<Record<number, unknown>>): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('T.Kê');
  worksheet.getRow(1).values = [
    '',
    'Username',
    '',
    '',
    '',
    '',
    'Loại GV',
    '36',
  ];
  rows.forEach((cells, index) => {
    const row = worksheet.getRow(2 + index);
    for (const [column, value] of Object.entries(cells)) {
      row.getCell(Number(column)).value = value as ExcelJS.CellValue;
    }
  });
  return workbook;
}

/**
 * Thêm sheet phân công lớp vào workbook: header ở dòng 8, dữ liệu từ dòng 9 —
 * đúng bố cục file thật. Mỗi phần tử là một lớp `[bộ môn, ô phân công GV]`.
 */
function addAssignments(
  workbook: ExcelJS.Workbook,
  classes: Array<[string, string]>,
): ExcelJS.Workbook {
  const worksheet = workbook.addWorksheet('BL1+BL2');
  worksheet.getRow(8).getCell(8).value = 'Bộ môn';
  worksheet.getRow(8).getCell(12).value = 'Phân công giảng viên';
  classes.forEach(([deptAlias, lecturers], index) => {
    const row = worksheet.getRow(9 + index);
    row.getCell(8).value = deptAlias;
    row.getCell(12).value = lecturers;
  });
  return workbook;
}

const ctx = { term: 'SU26' } as ImportContext;

describe('LecturerParser', () => {
  const parser = new LecturerParser();

  it('đọc username, họ tên, loại GV theo đúng vị trí cột', async () => {
    const workbook = buildWorkbook([
      { 1: 'vandtb2', 6: 'Full', 7: 'Đỗ Thị Bình Vân' },
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload).toEqual({
      username: 'vandtb2',
      fullName: 'Đỗ Thị Bình Vân',
      lecturerType: 'FULL',
      deptAlias: null,
    });
  });

  it('ánh xạ Part → PART', async () => {
    const workbook = buildWorkbook([{ 1: 'a1', 6: 'Part', 7: 'Nguyễn Văn A' }]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.lecturerType).toBe('PART');
  });

  it('loại GV rỗng hoặc lạ → null, không đoán', async () => {
    const workbook = buildWorkbook([{ 1: 'a2', 6: '', 7: 'Nguyễn Văn B' }]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.lecturerType).toBeNull();
  });

  it('KHÔNG đọc cột I dù cột đó có dữ liệu — payload không chứa email', async () => {
    const workbook = buildWorkbook([
      { 1: 'a3', 6: 'Full', 7: 'Nguyễn Văn C', 9: 'canary@example.com' },
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(JSON.stringify(result.rows[0].payload)).not.toContain('@');
    expect(Object.keys(result.rows[0].payload).sort()).toEqual([
      'deptAlias',
      'fullName',
      'lecturerType',
      'username',
    ]);
  });

  it('dòng thiếu username bị đánh lỗi', async () => {
    const workbook = buildWorkbook([{ 1: '', 6: 'Full', 7: 'Không username' }]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toContain('username');
  });

  it('dòng thiếu họ tên bị đánh lỗi', async () => {
    const workbook = buildWorkbook([{ 1: 'a4', 6: 'Full', 7: '' }]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toContain('họ tên');
  });

  it('username trùng trong cùng file → dòng sau đánh lỗi', async () => {
    const workbook = buildWorkbook([
      { 1: 'dup', 6: 'Full', 7: 'Một' },
      { 1: 'dup', 6: 'Full', 7: 'Hai' },
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[1].error).toContain('trùng');
  });

  it('thiếu sheet "T.Kê" → ném lỗi nêu tên sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Khác');
    await expect(parser.parse(workbook, ctx)).rejects.toThrow('T.Kê');
  });
});

/**
 * Sheet "T.Kê" KHÔNG có cột bộ môn. Dây nối duy nhất trong file là sheet phân
 * công lớp "BL1+BL2": mỗi lớp có sẵn cả `Bộ môn` lẫn `Phân công giảng viên`.
 */
describe('LecturerParser — suy bộ môn từ sheet phân công', () => {
  const parser = new LecturerParser();

  it('lấy bộ môn của lớp mà giảng viên được phân công', async () => {
    const workbook = addAssignments(
      buildWorkbook([{ 1: 'sonlh32', 6: 'Full', 7: 'Lê Hồng Sơn' }]),
      [['CNTT', 'SonLH32']],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.deptAlias).toBe('CNTT');
  });

  it('khớp được cả khi ô phân công gõ có dấu ("SơnLH32" ↔ username "sonlh32")', async () => {
    const workbook = addAssignments(
      buildWorkbook([{ 1: 'sonlh32', 6: 'Full', 7: 'Lê Hồng Sơn' }]),
      [['UDPM', 'SơnLH32']],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.deptAlias).toBe('UDPM');
  });

  it('một lớp hai giảng viên ("gv1; gv2") → cả hai đều nhận bộ môn của lớp', async () => {
    const workbook = addAssignments(
      buildWorkbook([
        { 1: 'thachnn12', 6: 'Full', 7: 'Nguyễn Ngọc Thạch' },
        { 1: 'sonlh32', 6: 'Full', 7: 'Lê Hồng Sơn' },
      ]),
      [['UDPM', 'thachnn12; sơnlh32']],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.deptAlias).toBe('UDPM');
    expect(result.rows[1].payload.deptAlias).toBe('UDPM');
  });

  it('dạy nhiều bộ môn → lấy bộ môn nhiều lớp nhất và cảnh báo để admin soát lại', async () => {
    const workbook = addAssignments(
      buildWorkbook([{ 1: 'thachnn12', 6: 'Full', 7: 'Nguyễn Ngọc Thạch' }]),
      [
        ['CNTT', 'thachnn12'],
        ['UDPM', 'thachnn12'],
        ['UDPM', 'thachnn12'],
        ['UDPM', 'thachnn12'],
      ],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.deptAlias).toBe('UDPM');
    expect(result.warnings.join(' ')).toContain('thachnn12');
    expect(result.warnings.join(' ')).toContain('nhiều bộ môn');
  });

  it('giảng viên chưa có lớp nào → deptAlias null và cảnh báo gộp, KHÔNG đoán bộ môn', async () => {
    const workbook = addAssignments(
      buildWorkbook([
        { 1: 'sonlh32', 6: 'Full', 7: 'Lê Hồng Sơn' },
        { 1: 'chuahaylop', 6: 'Part', 7: 'Chưa Có Lớp' },
      ]),
      [['CNTT', 'SonLH32']],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[1].payload.deptAlias).toBeNull();
    expect(result.warnings.join(' ')).toContain('1 giảng viên');
  });

  it('thiếu sheet phân công → không suy đoán, cảnh báo cần gán tay', async () => {
    const workbook = buildWorkbook([
      { 1: 'sonlh32', 6: 'Full', 7: 'Lê Hồng Sơn' },
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.deptAlias).toBeNull();
    expect(result.warnings.join(' ')).toContain('BL1+BL2');
  });

  it('dòng lớp chưa phân công giảng viên không sinh khoá rỗng', async () => {
    const workbook = addAssignments(
      buildWorkbook([{ 1: 'sonlh32', 6: 'Full', 7: 'Lê Hồng Sơn' }]),
      [
        ['CNTT', ''],
        ['CNTT', 'SonLH32'],
      ],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.deptAlias).toBe('CNTT');
  });
});
