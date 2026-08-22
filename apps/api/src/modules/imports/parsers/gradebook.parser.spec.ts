import { EnrollmentResult } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import type { ImportContext } from '../types';
import { GradebookParser, parseEnrollmentResult } from './gradebook.parser';

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: ExcelJS.CellValue[][],
): void {
  const worksheet = workbook.addWorksheet(name);
  worksheet.getRow(1).values = ['', ...headers];
  rows.forEach((row, index) => {
    worksheet.getRow(2 + index).values = ['', ...row];
  });
}

const ctx = { term: 'SU26' } as ImportContext;

describe('parseEnrollmentResult', () => {
  it('Đạt → PASS', () => {
    expect(parseEnrollmentResult('Đạt')).toBe(EnrollmentResult.PASS);
  });

  it('Trượt → FAIL', () => {
    expect(parseEnrollmentResult('Trượt')).toBe(EnrollmentResult.FAIL);
  });

  it('Không đạt → FAIL (nhãn mới có trong file thật)', () => {
    expect(parseEnrollmentResult('Không đạt')).toBe(EnrollmentResult.FAIL);
  });

  it('rỗng → IN_PROGRESS', () => {
    expect(parseEnrollmentResult('')).toBe(EnrollmentResult.IN_PROGRESS);
  });

  it('nhãn lạ → IN_PROGRESS, không ném lỗi', () => {
    expect(parseEnrollmentResult('Chưa rõ')).toBe(EnrollmentResult.IN_PROGRESS);
  });
});

describe('GradebookParser', () => {
  const parser = new GradebookParser();

  it('định vị "Điểm tổng kết" theo tên header, không theo chỉ số', async () => {
    const workbook = new ExcelJS.Workbook();
    // Bố cục SOF1021: Điểm tổng kết ở cột 9.
    addSheet(
      workbook,
      'SOF1021',
      [
        '#',
        'Mã sinh viên',
        'Họ và tên',
        'Lớp',
        'Quiz 1',
        'Lab 1',
        'Lab 2',
        'ASM',
        'Điểm tổng kết',
        'Trạng thái',
      ],
      [[1, 'PK00123', 'Nguyễn Văn A', 'SD20301', 8, 7, 9, 6, 7.5, 'Đạt']],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload).toEqual({
      subjectCode: 'SOF1021',
      studentCode: 'PK00123',
      fullName: 'Nguyễn Văn A',
      rawClass: 'SD20301',
      totalScore: 7.5,
      resultLabel: 'Đạt',
    });
  });

  it('cùng một parser xử lý sheet có Điểm tổng kết ở cột 24', async () => {
    const workbook = new ExcelJS.Workbook();
    const filler = Array.from({ length: 19 }, (_, i) => `Lab ${i + 1}`);
    addSheet(
      workbook,
      'WEB2072',
      ['#', 'Mã sinh viên', 'Họ và tên', 'Lớp', ...filler, 'Điểm tổng kết'],
      [[1, 'PS00456', 'Trần Thị B', 'WEB2072', ...filler.map(() => 5), 6.2]],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.totalScore).toBe(6.2);
  });

  it('KHÔNG lấy bất kỳ cột điểm thành phần nào vào payload', async () => {
    const workbook = new ExcelJS.Workbook();
    addSheet(
      workbook,
      'A',
      [
        '#',
        'Mã sinh viên',
        'Họ và tên',
        'Lớp',
        'Quiz 1',
        'ASM',
        'Điểm tổng kết',
        'Trạng thái',
      ],
      [[1, 'PK1', 'A', 'SD20301', 9.9, 8.8, 7, 'Đạt']],
    );
    const result = await parser.parse(workbook, ctx);
    const values = Object.values(result.rows[0].payload);
    expect(values).not.toContain(9.9);
    expect(values).not.toContain(8.8);
    expect(Object.keys(result.rows[0].payload).sort()).toEqual([
      'fullName',
      'rawClass',
      'resultLabel',
      'studentCode',
      'subjectCode',
      'totalScore',
    ]);
  });

  it('sheet thiếu "Mã sinh viên" hoặc "Điểm tổng kết" bị bỏ qua kèm cảnh báo', async () => {
    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, 'Tổng hợp', ['Ghi chú'], [['abc']]);
    addSheet(
      workbook,
      'OK',
      ['Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết'],
      [['PK1', 'A', 'SD20301', 7]],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('Tổng hợp');
  });

  it('điểm rỗng → totalScore null, không đánh lỗi (sinh viên chưa có điểm)', async () => {
    const workbook = new ExcelJS.Workbook();
    addSheet(
      workbook,
      'A',
      ['Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết', 'Trạng thái'],
      [['PK1', 'A', 'SD20301', '', '']],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].payload.totalScore).toBeNull();
    expect(result.rows[0].error).toBeUndefined();
  });

  it('điểm ngoài thang 0..10 bị đánh lỗi', async () => {
    const workbook = new ExcelJS.Workbook();
    addSheet(
      workbook,
      'A',
      ['Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết'],
      [['PK1', 'A', 'SD20301', 87]],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toContain('0 đến 10');
  });

  it('dòng thiếu MSSV bị đánh lỗi', async () => {
    const workbook = new ExcelJS.Workbook();
    addSheet(
      workbook,
      'A',
      ['Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết'],
      [['', 'A', 'SD20301', 7]],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows[0].error).toContain('Mã sinh viên');
  });

  it('một sheet chứa nhiều lớp — mỗi dòng giữ mã lớp riêng', async () => {
    const workbook = new ExcelJS.Workbook();
    addSheet(
      workbook,
      'PMA1011',
      ['Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết'],
      [
        ['PK1', 'A', 'SD20301', 7],
        ['PK2', 'B', 'WD20301', 8],
      ],
    );
    const result = await parser.parse(workbook, ctx);
    expect(result.rows.map((r) => r.payload.rawClass)).toEqual([
      'SD20301',
      'WD20301',
    ]);
  });

  it('xử lý nhiều sheet trong một lượt, ghi đúng tên sheet vào từng dòng', async () => {
    const workbook = new ExcelJS.Workbook();
    for (const name of ['WEB2064', 'SOF1021']) {
      addSheet(
        workbook,
        name,
        ['Mã sinh viên', 'Họ và tên', 'Lớp', 'Điểm tổng kết'],
        [['PK1', 'A', 'SD20301', 7]],
      );
    }
    const result = await parser.parse(workbook, ctx);
    expect(result.rows.map((r) => r.sheet)).toEqual(['WEB2064', 'SOF1021']);
    expect(result.rows.map((r) => r.payload.subjectCode)).toEqual([
      'WEB2064',
      'SOF1021',
    ]);
  });
});
