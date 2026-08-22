import * as ExcelJS from 'exceljs';
import type { ImportContext } from '../types';
import { CatalogParser } from './catalog.parser';

const HEADERS = [
  'Mã gốc',
  'Mã môn',
  'Tên môn',
  'Nhóm môn',
  'Bộ môn',
  '% đi học',
  'Số giờ thực tế',
  '',
  'Learning method',
  'Số SV max/lớp',
  '',
  'Môn tiên quyết',
  '',
  '',
  'Hình thức thi',
  'Số TC',
];

/** Sheet "3.1.Môn-BM" có header ở DÒNG 2, không phải dòng 1. */
function buildWorkbook(rows: ExcelJS.CellValue[][]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('3.1.Môn-BM');
  worksheet.getRow(2).values = ['', ...HEADERS];
  rows.forEach((row, index) => {
    worksheet.getRow(3 + index).values = ['', ...row];
  });
  return workbook;
}

const ctx = { term: 'SU26' } as ImportContext;

describe('CatalogParser', () => {
  const parser = new CatalogParser();

  it('parse một dòng đầy đủ', async () => {
    const workbook = buildWorkbook([
      [
        'ITA107',
        'ITA107',
        'Nhập môn CNTT',
        'SU26',
        'CNTT',
        0.8,
        45,
        '',
        'TRA',
        35,
        '',
        '',
        '',
        '',
        'Thi máy',
        3,
      ],
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payload).toEqual({
      code: 'ITA107',
      name: 'Nhập môn CNTT',
      credits: 3,
      deptAlias: 'CNTT',
      subjectGroup: 'SU26',
      hoursTotal: 45,
      learningMethod: 'TRA',
      maxStudents: 35,
      examForm: 'Thi máy',
      attendanceRateRequired: 0.8,
    });
    expect(result.rows[0].error).toBeUndefined();
  });

  it('giữ "% đi học" ở dạng tỉ lệ 0..1, không nhân 100', async () => {
    const workbook = buildWorkbook([
      [
        'A',
        'A',
        'Môn A',
        '',
        'CNTT',
        0.8,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        3,
      ],
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.attendanceRateRequired).toBe(0.8);
  });

  it('dòng thiếu mã môn bị đánh lỗi, không làm hỏng dòng khác', async () => {
    const workbook = buildWorkbook([
      [
        '',
        '',
        'Môn không mã',
        '',
        'CNTT',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        3,
      ],
      [
        'B',
        'B',
        'Môn B',
        '',
        'CNTT',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        3,
      ],
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].error).toContain('Thiếu mã môn');
    expect(result.rows[1].error).toBeUndefined();
  });

  it('dòng thiếu số tín chỉ bị đánh lỗi', async () => {
    const workbook = buildWorkbook([
      [
        'C',
        'C',
        'Môn C',
        '',
        'CNTT',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toContain('Số TC');
  });

  it('mã môn trùng nhau: giữ dòng đầu, dòng sau đánh lỗi trùng', async () => {
    const workbook = buildWorkbook([
      [
        'D',
        'D',
        'Môn D',
        '',
        'CNTT',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        3,
      ],
      [
        'D',
        'D',
        'Môn D lần hai',
        '',
        'CNTT',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        3,
      ],
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toBeUndefined();
    expect(result.rows[1].error).toContain('trùng');
  });

  it('bỏ qua dòng rỗng hoàn toàn', async () => {
    const workbook = buildWorkbook([
      [
        'E',
        'E',
        'Môn E',
        '',
        'CNTT',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        3,
      ],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ]);
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
  });

  it('workbook không có sheet "3.1.Môn-BM" → ném lỗi nêu tên sheet cần có', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Sheet khác');
    await expect(parser.parse(workbook, ctx)).rejects.toThrow('3.1.Môn-BM');
  });

  it('cột tuỳ chọn (VD: "Nhóm môn") thiếu hẳn trên sheet thật → không crash, trả rỗng', async () => {
    // Khác với HEADERS ở trên (luôn có đủ cột tuỳ chọn), sheet thật có thể
    // thiếu hẳn một cột tuỳ chọn — from-scratch workbook để mô phỏng đúng.
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('3.1.Môn-BM');
    worksheet.getRow(2).values = ['', 'Mã môn', 'Tên môn', 'Bộ môn', 'Số TC'];
    worksheet.getRow(3).values = ['', 'F', 'Môn F', 'CNTT', 3];
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].error).toBeUndefined();
    expect(result.rows[0].payload).toMatchObject({
      subjectGroup: null,
      hoursTotal: null,
      learningMethod: null,
      maxStudents: null,
      examForm: null,
      attendanceRateRequired: null,
    });
  });
});
