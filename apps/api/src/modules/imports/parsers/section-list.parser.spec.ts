import * as ExcelJS from 'exceljs';
import type { ImportContext } from '../types';
import { SectionListParser, buildTermSectionCode } from './section-list.parser';

const HEADERS = [
  'id lớp',
  'Tên lớp',
  'Block',
  'Mã Chuyển đổi',
  'Mã môn',
  'Tên môn',
  'Ca học',
  'Ngày bắt đầu',
  'Ngày kết thúc',
  'số lượng sinh viên',
  'Giảng viên',
  'ID phòng',
  'Tên phòng',
  'mô tả phòng',
];

/** Một dòng đúng như file nhà trường gửi, cho phép ghi đè từng ô. */
function sheetWith(
  overrides: readonly Partial<Record<string, ExcelJS.CellValue>>[],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Danh_sach_lop_1788584927 (2)');
  worksheet.getRow(1).values = HEADERS;
  overrides.forEach((override, index) => {
    const base: Record<string, ExcelJS.CellValue> = {
      'id lớp': 17509,
      'Tên lớp': 'GD21301',
      Block: 'Block 1',
      'Mã Chuyển đổi': 'MUL212',
      'Mã môn': 'MUL2123',
      'Tên môn': 'Thiết kế bao bì',
      'Ca học': 1,
      'Ngày bắt đầu': new Date(Date.UTC(2026, 4, 11)),
      'số lượng sinh viên': 29,
      'Giảng viên': 'dungnth6',
      'Tên phòng': 'F302',
    };
    const merged = { ...base, ...override };
    worksheet.getRow(index + 2).values = HEADERS.map(
      (name) => merged[name] ?? null,
    );
  });
  return workbook;
}

const ctx = { term: 'SU26' } as unknown as ImportContext;

describe('buildTermSectionCode', () => {
  it('ghép tên lớp với mã môn — tên lớp một mình bị trùng', () => {
    // GD21301 xuất hiện ở 5 dòng với 5 môn khác nhau trong file thật.
    expect(buildTermSectionCode('GD21301', 'MUL2123')).toBe('GD21301-MUL2123');
  });

  it('chuẩn hoá hoa thường và khoảng trắng', () => {
    expect(buildTermSectionCode(' gd21301 ', ' mul2123 ')).toBe(
      'GD21301-MUL2123',
    );
  });
});

describe('SectionListParser', () => {
  const parser = new SectionListParser();

  it('đọc đủ trường của một lớp học phần', async () => {
    const result = await parser.parse(sheetWith([{}]), ctx);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].error).toBeUndefined();
    expect(result.rows[0].payload).toEqual({
      code: 'GD21301-MUL2123',
      classCode: 'GD21301',
      subjectCode: 'MUL2123',
      block: 1,
      slot: '1',
      room: 'F302',
      capacity: 29,
      startDate: '2026-05-11T00:00:00.000Z',
      lecturerUsername: 'dungnth6',
    });
  });

  it('đọc ngày ở dạng chuỗi Date.toString() của JS', async () => {
    const result = await parser.parse(
      sheetWith([
        {
          'Ngày bắt đầu': 'Mon Jun 29 2026 07:00:00 GMT+0700 (Indochina Time)',
        },
      ]),
      ctx,
    );

    expect(result.rows[0].payload.startDate).toBe('2026-06-29T00:00:00.000Z');
  });

  it('coi ca học 0 và phòng rỗng là chưa có dữ liệu', async () => {
    const result = await parser.parse(
      sheetWith([{ 'Ca học': 0, 'Tên phòng': '' }]),
      ctx,
    );

    expect(result.rows[0].payload.slot).toBeNull();
    expect(result.rows[0].payload.room).toBeNull();
    expect(result.rows[0].error).toBeUndefined();
  });

  it('đánh dấu lỗi khi thiếu mã môn hoặc tên lớp', async () => {
    const result = await parser.parse(
      sheetWith([{ 'Mã môn': '' }, { 'Tên lớp': '' }]),
      ctx,
    );

    expect(result.rows[0].error).toMatch(/Mã môn/);
    expect(result.rows[1].error).toMatch(/Tên lớp/);
  });

  it('bỏ qua dòng trống cuối sheet', async () => {
    const workbook = sheetWith([{}]);
    workbook.worksheets[0].getRow(3).values = [];

    const result = await parser.parse(workbook, ctx);

    expect(result.rows).toHaveLength(1);
  });

  it('cảnh báo khi hai dòng sinh cùng mã lớp học phần', async () => {
    const result = await parser.parse(sheetWith([{}, {}]), ctx);

    expect(result.warnings.join(' ')).toMatch(/GD21301-MUL2123/);
  });

  it('ném lỗi nêu rõ khi file không có sheet đúng định dạng', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Ghi chú').getRow(1).values = ['Nội dung'];

    await expect(parser.parse(workbook, ctx)).rejects.toThrow(/Mã môn/);
  });
});
