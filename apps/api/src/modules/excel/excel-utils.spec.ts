import * as ExcelJS from 'exceljs';
import { getWorksheet, loadWorkbook, stripForbiddenData } from './excel-utils';

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

function text(
  workbook: ExcelJS.Workbook,
  sheet: string,
  row: number,
  column: number,
): string {
  return getWorksheet(workbook, sheet)!.getRow(row).getCell(column).text.trim();
}

/**
 * RULE 1 vẫn nguyên: PII KHÔNG BAO GIỜ được ghi vào hệ thống. Khác trước ở chỗ
 * file không còn bị từ chối — ô dính bị xoá ngay trong bộ nhớ trước khi parser
 * chạm tới, phần dữ liệu học vụ còn lại vẫn import bình thường.
 */
describe('stripForbiddenData', () => {
  it('xoá email ở cột KHÔNG có header nhưng giữ nguyên dữ liệu học vụ cùng dòng', async () => {
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

    const warnings = stripForbiddenData(workbook);

    expect(warnings).toHaveLength(1);
    expect(text(workbook, 'T.Kê', 2, 4)).toBe('');
    expect(text(workbook, 'T.Kê', 2, 1)).toBe('vandtb2');
    expect(text(workbook, 'T.Kê', 2, 3)).toBe('Đinh Thị Bích Vân');
  });

  it('cảnh báo chỉ đích danh sheet + CHỮ CÁI cột, không in lại giá trị PII', async () => {
    const buffer = await workbookWith([
      { name: 'Sheet1', rows: [['a']] },
      {
        name: 'T.Kê',
        rows: [['x'], ['y', 'z', 'w', 'hieunt249@fe.edu.vn']],
      },
    ]);
    const workbook = await loadWorkbook(buffer);

    const [warning] = stripForbiddenData(workbook);

    expect(warning).toContain('T.Kê');
    // Admin mở Excel thấy chữ cái cột, không phải số thứ tự.
    expect(warning).toContain('cột D');
    expect(warning).toContain('email');
    expect(warning).not.toContain('hieunt249');
    expect(warning).not.toContain('@');
  });

  it('gộp mọi ô cùng một cột thành MỘT cảnh báo kèm số lượng', async () => {
    const buffer = await workbookWith([
      {
        name: 'T.Kê',
        rows: [
          ['GV', ''],
          ['a', 'a@fe.edu.vn'],
          ['b', 'b@fe.edu.vn'],
          ['c', 'c@fe.edu.vn'],
        ],
      },
    ]);
    const workbook = await loadWorkbook(buffer);

    const warnings = stripForbiddenData(workbook);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('3 ô');
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

    const warnings = stripForbiddenData(workbook);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Bẩn');
    expect(warnings[0]).toContain('số điện thoại');
    expect(text(workbook, 'Bẩn', 1, 1)).toBe('');
    expect(text(workbook, 'Sạch', 2, 1)).toBe('PK00001');
  });

  it('xoá CẢ CỘT khi header là tên trường PII, kể cả ô không khớp mẫu giá trị', async () => {
    const buffer = await workbookWith([
      {
        name: 'DS',
        rows: [
          ['MSSV', 'Số điện thoại'],
          ['PK00001', 'liên hệ qua lớp trưởng'],
        ],
      },
    ]);
    const workbook = await loadWorkbook(buffer);

    const warnings = stripForbiddenData(workbook);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('cột B');
    expect(text(workbook, 'DS', 1, 2)).toBe('');
    expect(text(workbook, 'DS', 2, 2)).toBe('');
    expect(text(workbook, 'DS', 2, 1)).toBe('PK00001');
  });

  it('xoá số CCCD 12 chữ số', async () => {
    const buffer = await workbookWith([
      { name: 'S', rows: [['001203004005']] },
    ]);
    const workbook = await loadWorkbook(buffer);

    expect(stripForbiddenData(workbook)[0]).toContain('CCCD');
    expect(text(workbook, 'S', 1, 1)).toBe('');
  });

  it('KHÔNG đụng vào dữ liệu học vụ hợp lệ', async () => {
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

    expect(stripForbiddenData(workbook)).toEqual([]);
    expect(text(workbook, 'WEB2064', 2, 2)).toBe('PK00123');
    expect(text(workbook, '3.1.Môn-BM', 2, 3)).toBe('CNTT');
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
