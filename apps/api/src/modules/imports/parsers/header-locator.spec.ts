import * as ExcelJS from 'exceljs';
import {
  locateHeaders,
  normalizeHeader,
  requireHeaders,
} from './header-locator';

function sheetWithHeaders(headers: string[], headerRow = 1): ExcelJS.Worksheet {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('test');
  worksheet.getRow(headerRow).values = ['', ...headers];
  return worksheet;
}

describe('normalizeHeader', () => {
  it('bỏ khoảng trắng thừa và hạ chữ thường', () => {
    expect(normalizeHeader('  Điểm  tổng kết ')).toBe('điểm tổng kết');
  });

  it('gộp nhiều khoảng trắng liên tiếp và xuống dòng thành một dấu cách', () => {
    expect(normalizeHeader('Mã\n sinh   viên')).toBe('mã sinh viên');
  });

  it('trả chuỗi rỗng cho ô rỗng', () => {
    expect(normalizeHeader('')).toBe('');
  });
});

describe('locateHeaders', () => {
  it('tìm đúng chỉ số cột theo tên, không theo vị trí', () => {
    // Bố cục thật của sheet SOF1021: Điểm tổng kết ở cột 9.
    const worksheet = sheetWithHeaders([
      '#',
      'Mã sinh viên',
      'Họ và tên',
      'Lớp',
      'Quiz 1',
      'Quiz 2',
      'Lab 1',
      'ASM',
      'Điểm tổng kết',
      'Trạng thái',
    ]);
    const map = locateHeaders(worksheet, 1, [
      'Mã sinh viên',
      'Điểm tổng kết',
      'Trạng thái',
    ]);
    expect(map.get('mã sinh viên')).toBe(2);
    expect(map.get('điểm tổng kết')).toBe(9);
    expect(map.get('trạng thái')).toBe(10);
  });

  it('cùng tên header ở vị trí khác vẫn tìm ra — chứng minh không hardcode chỉ số', () => {
    // Bố cục thật của sheet WEB2072: Điểm tổng kết ở cột 24.
    const columns = Array.from(
      { length: 23 },
      (_, index) => `Cột ${index + 1}`,
    );
    columns[1] = 'Mã sinh viên';
    const worksheet = sheetWithHeaders([...columns, 'Điểm tổng kết']);
    const map = locateHeaders(worksheet, 1, ['Mã sinh viên', 'Điểm tổng kết']);
    expect(map.get('điểm tổng kết')).toBe(24);
  });

  it('đọc được header không nằm ở dòng 1', () => {
    // Sheet BL1+BL2 có header ở dòng 8.
    const worksheet = sheetWithHeaders(['Ngành', 'Kỳ'], 8);
    const map = locateHeaders(worksheet, 8, ['Ngành']);
    expect(map.get('ngành')).toBe(1);
  });

  it('bỏ qua header không nằm trong danh sách cần tìm', () => {
    const worksheet = sheetWithHeaders(['Mã sinh viên', 'Lab 1']);
    const map = locateHeaders(worksheet, 1, ['Mã sinh viên']);
    expect(map.has('lab 1')).toBe(false);
    expect(map.size).toBe(1);
  });

  it('giữ cột đầu tiên khi header trùng tên', () => {
    const worksheet = sheetWithHeaders(['Lớp', 'Lớp']);
    const map = locateHeaders(worksheet, 1, ['Lớp']);
    expect(map.get('lớp')).toBe(1);
  });
});

describe('requireHeaders', () => {
  it('không ném khi đủ cột bắt buộc', () => {
    const map = new Map([['mã sinh viên', 2]]);
    expect(() =>
      requireHeaders(map, ['Mã sinh viên'], 'SOF1021'),
    ).not.toThrow();
  });

  it('ném lỗi nêu tên sheet và cột thiếu', () => {
    const map = new Map([['mã sinh viên', 2]]);
    expect(() =>
      requireHeaders(map, ['Mã sinh viên', 'Điểm tổng kết'], 'SOF1021'),
    ).toThrow('Sheet "SOF1021" thiếu cột bắt buộc: Điểm tổng kết');
  });
});
