import * as ExcelJS from 'exceljs';
import type { ImportContext } from '../types';
import { RosterParser, parseStudentStatus } from './roster.parser';

const HEADERS = [
  'STT',
  'Mã sinh viên',
  'Họ và tên',
  'Kì thứ',
  'Trạng thái',
  'Mã Ngành',
  'ID lớp',
  'Tên lớp',
  'Ca học',
  'Mã môn',
  'kỳ theo khung',
  'Ngày bắt đầu',
  'Số lần học',
  'Trạng Thái.1',
  'Trạng thái môn học',
];

function sheetWith(
  overrides: readonly Partial<Record<string, ExcelJS.CellValue>>[],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('danh_sach_lop_mon_178858510 (2)');
  worksheet.getRow(1).values = HEADERS;
  overrides.forEach((override, index) => {
    const base: Record<string, ExcelJS.CellValue> = {
      STT: index + 1,
      'Mã sinh viên': 'PK04929',
      'Họ và tên': 'H Wiêm Adrơng',
      'Kì thứ': 0,
      'Trạng thái': 'HDI ( Học đi )',
      'Mã Ngành': 'CHNA',
      'ID lớp': 'PDP102.01',
      'Tên lớp': 17902,
      'Ca học': 1,
      'Mã môn': 'PDP102',
      'Số lần học': 1,
    };
    const merged = { ...base, ...override };
    worksheet.getRow(index + 2).values = HEADERS.map(
      (name) => merged[name] ?? null,
    );
  });
  return workbook;
}

const ctx = { term: 'SU26' } as unknown as ImportContext;

describe('parseStudentStatus', () => {
  it('đọc theo mã đầu chuỗi, bỏ qua phần diễn giải trong ngoặc', () => {
    expect(parseStudentStatus('HDI ( Học đi )')).toBe('STUDYING');
    expect(parseStudentStatus('TN2 ( Học lại )')).toBe('STUDYING');
    expect(parseStudentStatus('TN3 ( Chờ xếp lớp học lại )')).toBe('STUDYING');
    expect(parseStudentStatus('TN1 ( Bảo lưu tự nguyện )')).toBe('RESERVED');
    expect(parseStudentStatus('THO ( Dropout )')).toBe('DROPPED_OUT');
  });

  it('gộp "chờ xét tốt nghiệp" và "chuyển cơ sở" vào STUDYING', () => {
    // Quyết định nghiệp vụ: chưa có enum riêng, hai nhóm này vẫn đang học.
    expect(parseStudentStatus('BB2 ( Chờ xét tốt nghiệp )')).toBe('STUDYING');
    expect(parseStudentStatus('Chuyển cơ sở')).toBe('STUDYING');
  });

  it('trả null cho nhãn lạ thay vì đoán bừa', () => {
    expect(parseStudentStatus('XYZ ( Không rõ )')).toBeNull();
    expect(parseStudentStatus('')).toBeNull();
  });
});

describe('RosterParser', () => {
  const parser = new RosterParser();

  it('đọc một dòng thành payload ghi danh đầy đủ', async () => {
    const result = await parser.parse(sheetWith([{}]), ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payload).toEqual({
      studentCode: 'PK04929',
      fullName: 'H Wiêm Adrơng',
      majorAlias: 'CHNA',
      classCode: 'PDP102.01',
      subjectCode: 'PDP102',
      sectionCode: 'PDP102.01-PDP102',
      status: 'STUDYING',
    });
    expect(result.rows[0].error).toBeUndefined();
  });

  it('không suy đoán trạng thái lạ — để null và cảnh báo', async () => {
    const result = await parser.parse(
      sheetWith([{ 'Trạng thái': 'ZZZ ( Lạ )' }]),
      ctx,
    );
    expect(result.rows[0].payload.status).toBeNull();
    expect(result.warnings.join(' ')).toContain('ZZZ ( Lạ )');
  });

  it('gom mã ngành để service đối chiếu bảng ánh xạ', async () => {
    const result = await parser.parse(
      sheetWith([{}, { 'Mã Ngành': 'LOGI03' }]),
      ctx,
    );
    expect(result.rows.map((row) => row.payload.majorAlias)).toEqual([
      'CHNA',
      'LOGI03',
    ]);
  });

  it('báo lỗi dòng thiếu mã sinh viên', async () => {
    const result = await parser.parse(
      sheetWith([{ 'Mã sinh viên': null }]),
      ctx,
    );
    expect(result.rows[0].error).toContain('Mã sinh viên');
  });

  it('báo lỗi dòng thiếu mã môn', async () => {
    const result = await parser.parse(sheetWith([{ 'Mã môn': null }]), ctx);
    expect(result.rows[0].error).toContain('Mã môn');
  });

  it('báo lỗi dòng thiếu họ tên — Student.fullName là cột bắt buộc', async () => {
    const result = await parser.parse(sheetWith([{ 'Họ và tên': null }]), ctx);
    expect(result.rows[0].error).toContain('Họ và tên');
  });

  it('bỏ qua dòng trống cuối file', async () => {
    const workbook = sheetWith([{}]);
    workbook.worksheets[0].getRow(3).values = [];
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
  });

  it('ném lỗi nêu rõ khi file không có sheet đúng định dạng', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Sheet1').getRow(1).values = ['A', 'B'];
    await expect(parser.parse(workbook, ctx)).rejects.toThrow(
      /không tìm thấy sheet/i,
    );
  });
});
