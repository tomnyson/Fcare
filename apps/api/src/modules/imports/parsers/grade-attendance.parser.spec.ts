import * as ExcelJS from 'exceljs';
import type { ImportContext } from '../types';
import {
  GradeAttendanceParser,
  parseGradeStatus,
} from './grade-attendance.parser';

const HEADERS = [
  'Mã',
  'Tên lớp',
  'Mã chuyển đổi',
  'Mã môn',
  'Block',
  'Số buổi nghỉ/TS',
  'Tỷ lệ phải đi học',
  'Điểm',
  'Trạng thái',
  'Ngày đầu',
  'Ngày cuối',
];

function sheetWith(
  overrides: readonly Partial<Record<string, ExcelJS.CellValue>>[],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('export_1788585247 (2)');
  worksheet.getRow(1).values = HEADERS;
  overrides.forEach((override, index) => {
    const base: Record<string, ExcelJS.CellValue> = {
      Mã: 'PK04929',
      'Tên lớp': 'PDP102.01',
      'Mã chuyển đổi': 'PDP102',
      'Mã môn': 'PDP102',
      Block: 'Block 2',
      'Số buổi nghỉ/TS': '1 / 14 buổi',
      'Tỷ lệ phải đi học': 80,
      Điểm: 8.5,
      'Trạng thái': 'Passed',
    };
    const merged = { ...base, ...override };
    worksheet.getRow(index + 2).values = HEADERS.map(
      (name) => merged[name] ?? null,
    );
  });
  return workbook;
}

const ctx = { term: 'SU26' } as unknown as ImportContext;

describe('parseGradeStatus', () => {
  it('ánh xạ nhãn tiếng Anh của file sang kết quả ghi danh', () => {
    expect(parseGradeStatus('Passed')).toEqual({
      result: 'PASS',
      isExamBanned: false,
    });
    expect(parseGradeStatus('Studying')).toEqual({
      result: 'IN_PROGRESS',
      isExamBanned: false,
    });
    expect(parseGradeStatus('Failed')).toEqual({
      result: 'FAIL',
      isExamBanned: false,
    });
    expect(parseGradeStatus('On-going Assessment Fail')).toEqual({
      result: 'FAIL',
      isExamBanned: false,
    });
  });

  it('"Attendance Failed" là trượt VÌ bị cấm thi', () => {
    expect(parseGradeStatus('Attendance Failed')).toEqual({
      result: 'FAIL',
      isExamBanned: true,
    });
  });

  it('không phân biệt hoa thường và khoảng trắng thừa', () => {
    expect(parseGradeStatus('  passed  ')?.result).toBe('PASS');
  });

  it('trả null cho nhãn lạ', () => {
    expect(parseGradeStatus('Unknown')).toBeNull();
  });
});

describe('GradeAttendanceParser', () => {
  const parser = new GradeAttendanceParser();

  it('đọc một dòng thành payload điểm + chuyên cần', async () => {
    const result = await parser.parse(sheetWith([{}]), ctx);
    expect(result.rows[0].payload).toEqual({
      studentCode: 'PK04929',
      classCode: 'PDP102.01',
      subjectCode: 'PDP102',
      sectionCode: 'PDP102.01-PDP102',
      totalScore: 8.5,
      result: 'PASS',
      isExamBanned: false,
      absentSessions: 1,
      totalSessions: 14,
      attendanceRate: 92.9,
    });
    expect(result.rows[0].error).toBeUndefined();
  });

  it('lớp chưa có buổi nào ("0 / 0 buổi") → tỷ lệ null, không chia cho 0', async () => {
    const result = await parser.parse(
      sheetWith([{ 'Số buổi nghỉ/TS': '0 / 0 buổi' }]),
      ctx,
    );
    expect(result.rows[0].payload).toMatchObject({
      absentSessions: 0,
      totalSessions: 0,
      attendanceRate: null,
    });
  });

  it('giữ nguyên điểm 0 của sinh viên đang học — 0 là điểm tích luỹ thật', async () => {
    const result = await parser.parse(
      sheetWith([{ Điểm: 0, 'Trạng thái': 'Studying' }]),
      ctx,
    );
    expect(result.rows[0].payload).toMatchObject({
      totalScore: 0,
      result: 'IN_PROGRESS',
    });
  });

  it('bỏ qua các dòng lớp thi TL_EOS và cảnh báo', async () => {
    const result = await parser.parse(
      sheetWith([
        {},
        { 'Tên lớp': 'TL_EOS test_VIE1026_2026-06-30_Slot4' },
        { 'Tên lớp': 'TL_EOS test_VIE108_2026-08-25_Slot4' },
      ]),
      ctx,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('2');
    expect(result.warnings.join(' ')).toContain('TL_EOS');
  });

  it('báo lỗi dòng có nhãn trạng thái lạ thay vì đoán kết quả', async () => {
    const result = await parser.parse(
      sheetWith([{ 'Trạng thái': 'Deferred' }]),
      ctx,
    );
    expect(result.rows[0].error).toContain('Deferred');
  });

  it('báo lỗi dòng thiếu mã sinh viên', async () => {
    const result = await parser.parse(sheetWith([{ Mã: null }]), ctx);
    expect(result.rows[0].error).toContain('Mã sinh viên');
  });

  it('ô chuyên cần sai định dạng → để null, không chặn dòng', async () => {
    const result = await parser.parse(
      sheetWith([{ 'Số buổi nghỉ/TS': 'n/a' }]),
      ctx,
    );
    expect(result.rows[0].error).toBeUndefined();
    expect(result.rows[0].payload).toMatchObject({
      absentSessions: null,
      totalSessions: null,
      attendanceRate: null,
    });
  });

  it('bỏ qua dòng trống cuối file', async () => {
    const workbook = sheetWith([{}]);
    workbook.worksheets[0].getRow(3).values = [];
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
  });
});
