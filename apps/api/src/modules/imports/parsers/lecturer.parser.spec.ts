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
