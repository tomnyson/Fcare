import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  assertNoForbiddenColumns,
  assertNoForbiddenValues,
  getWorksheet,
  loadWorkbook,
} from './excel-utils';

async function workbookWith(
  sheets: Array<{ name: string; rows: unknown[][] }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) {
      worksheet.addRow(row);
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('assertNoForbiddenValues', () => {
  it('bắt email ở cột KHÔNG có header — lỗ hổng của assertNoForbiddenColumns', async () => {
    const buffer = await workbookWith([
      {
        name: 'T.Kê',
        rows: [
          ['Username', 'Loại GV', 'Họ tên', ''],
          ['vandtb2', 'Full', 'Đinh Thị Bích Vân', 'VanDTB2@fe.edu.vn'],
        ],
      },
    ]);
    const workbook = await loadWorkbook(buffer);
    expect(() => assertNoForbiddenValues(workbook)).toThrow(
      BadRequestException,
    );
  });

  it('thông báo lỗi chỉ đích danh sheet, dòng, cột để admin sửa được ngay', async () => {
    const buffer = await workbookWith([
      { name: 'Sheet1', rows: [['a']] },
      { name: 'T.Kê', rows: [['x'], ['y', 'z', 'w', 'hieunt249@fe.edu.vn']] },
    ]);
    const workbook = await loadWorkbook(buffer);
    let message = '';
    try {
      assertNoForbiddenValues(workbook);
    } catch (error) {
      message = (error as BadRequestException).message;
    }
    expect(message).toContain('T.Kê');
    expect(message).toContain('dòng 2');
    expect(message).toContain('cột 4');
    expect(message).toContain('email');
    // Không được lặp lại chính giá trị PII trong thông báo lỗi.
    expect(message).not.toContain('hieunt249');
  });

  it('quét MỌI sheet, không chỉ sheet đầu tiên', async () => {
    const buffer = await workbookWith([
      {
        name: 'Sạch',
        rows: [
          ['MSSV', 'Họ tên'],
          ['PK00001', 'Nguyễn Văn A'],
        ],
      },
      { name: 'Bẩn', rows: [['0912345678']] },
    ]);
    const workbook = await loadWorkbook(buffer);
    expect(() => assertNoForbiddenValues(workbook)).toThrow(/số điện thoại/);
  });

  it('bắt số CCCD 12 chữ số', async () => {
    const buffer = await workbookWith([
      { name: 'S', rows: [['001203004005']] },
    ]);
    const workbook = await loadWorkbook(buffer);
    expect(() => assertNoForbiddenValues(workbook)).toThrow(/CCCD/);
  });

  it('KHÔNG báo nhầm trên dữ liệu học vụ hợp lệ', async () => {
    const buffer = await workbookWith([
      {
        name: 'WEB2064',
        rows: [
          [
            '#',
            'Mã sinh viên',
            'Họ và tên',
            'Lớp',
            'Điểm tổng kết',
            'Trạng thái',
          ],
          [1, 'PK00123', 'Trần Thị B', 'WEB2064.01', 8.5, 'Đạt'],
          [2, 'PS01988', 'Lê Văn C', 'SD20301', 4.2, 'Không đạt'],
        ],
      },
      {
        name: '3.1.Môn-BM',
        rows: [
          ['Mã môn', 'Tên môn', 'Bộ môn', '% đi học', 'Số TC'],
          ['WEB2064', 'Web Design', 'CNTT', 0.8, 3],
        ],
      },
    ]);
    const workbook = await loadWorkbook(buffer);
    expect(() => assertNoForbiddenValues(workbook)).not.toThrow();
  });
});

describe('getWorksheet', () => {
  it('lấy sheet theo tên, bỏ qua khoảng trắng thừa', async () => {
    const buffer = await workbookWith([{ name: 'BL1+BL2', rows: [['a']] }]);
    const workbook = await loadWorkbook(buffer);
    expect(getWorksheet(workbook, ' BL1+BL2 ')?.name).toBe('BL1+BL2');
  });

  it('trả undefined khi không có sheet', async () => {
    const buffer = await workbookWith([{ name: 'A', rows: [['a']] }]);
    const workbook = await loadWorkbook(buffer);
    expect(getWorksheet(workbook, 'Không có')).toBeUndefined();
  });
});

describe('phối hợp hai lớp chặn', () => {
  it('header có chữ "email" vẫn bị assertNoForbiddenColumns chặn', () => {
    expect(() => assertNoForbiddenColumns(['MSSV', 'Email'])).toThrow(
      BadRequestException,
    );
  });
});
