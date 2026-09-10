import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  attendanceRateFrom,
  parseAbsence,
  parseJsDateString,
  pickDataSheet,
} from './term-file-utils';

function workbookWith(
  sheets: readonly { name: string; headers: string[] }[],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    workbook.addWorksheet(sheet.name).getRow(1).values = sheet.headers;
  }
  return workbook;
}

describe('parseJsDateString', () => {
  it('đọc chuỗi Date.toString() của JS trong file nhà trường gửi', () => {
    expect(
      parseJsDateString('Mon Aug 03 2026 07:00:00 GMT+0700 (Indochina Time)'),
    ).toBe('2026-08-03T00:00:00.000Z');
  });

  it('bỏ qua giờ và múi giờ, chỉ giữ phần ngày', () => {
    // Cùng một ngày dù ô ghi 00:00 hay 07:00 — tránh lệch ngày khi đổi múi giờ.
    expect(
      parseJsDateString('Tue May 12 2026 00:00:00 GMT+0700 (Indochina Time)'),
    ).toBe('2026-05-12T00:00:00.000Z');
  });

  it('trả null cho chuỗi rỗng hoặc định dạng khác', () => {
    expect(parseJsDateString('')).toBeNull();
    expect(parseJsDateString('11/05/2026')).toBeNull();
    expect(parseJsDateString('Mon Foo 03 2026')).toBeNull();
  });

  it('trả null cho ngày không tồn tại', () => {
    expect(parseJsDateString('Mon Feb 30 2026 00:00:00 GMT+0700')).toBeNull();
  });
});

describe('parseAbsence', () => {
  it('tách "2 / 18 buổi" thành số buổi nghỉ và tổng số buổi', () => {
    expect(parseAbsence('2 / 18 buổi')).toEqual({
      absentSessions: 2,
      totalSessions: 18,
    });
  });

  it('chấp nhận biến thể khoảng trắng', () => {
    expect(parseAbsence('3/17buổi')).toEqual({
      absentSessions: 3,
      totalSessions: 17,
    });
  });

  it('giữ nguyên "0 / 0 buổi" — lớp chưa điểm danh buổi nào', () => {
    expect(parseAbsence('0 / 0 buổi')).toEqual({
      absentSessions: 0,
      totalSessions: 0,
    });
  });

  it('trả null cho ô rỗng hoặc không đúng định dạng', () => {
    expect(parseAbsence('')).toBeNull();
    expect(parseAbsence('chưa có')).toBeNull();
  });

  it('trả null khi số buổi nghỉ vượt tổng số buổi — dữ liệu mâu thuẫn', () => {
    expect(parseAbsence('20 / 18 buổi')).toBeNull();
  });
});

describe('attendanceRateFrom', () => {
  it('quy đổi số buổi nghỉ thành tỉ lệ chuyên cần 0..100', () => {
    expect(attendanceRateFrom({ absentSessions: 2, totalSessions: 10 })).toBe(
      80,
    );
  });

  it('làm tròn tới một chữ số thập phân', () => {
    expect(attendanceRateFrom({ absentSessions: 2, totalSessions: 18 })).toBe(
      88.9,
    );
  });

  it('trả null khi tổng số buổi bằng 0 — không chia cho 0', () => {
    expect(
      attendanceRateFrom({ absentSessions: 0, totalSessions: 0 }),
    ).toBeNull();
  });
});

describe('pickDataSheet', () => {
  const REQUIRED = ['Mã', 'Tên lớp', 'Mã môn'] as const;

  it('chọn sheet theo header, không theo tên sheet', () => {
    // Tên sheet chứa timestamp sinh tự động ("export_1788585247 (2)") nên
    // KHÔNG hardcode được — phải nhận diện bằng header.
    const workbook = workbookWith([
      { name: 'export_1788585247 (2)', headers: ['Mã', 'Tên lớp', 'Mã môn'] },
    ]);
    expect(pickDataSheet(workbook, 1, REQUIRED).worksheet.name).toBe(
      'export_1788585247 (2)',
    );
  });

  it('bỏ qua sheet ghi chú, lấy sheet có đủ cột bắt buộc', () => {
    const workbook = workbookWith([
      { name: 'Ghi chú', headers: ['Nội dung'] },
      { name: 'export_1 (2)', headers: ['Mã', 'Tên lớp', 'Mã môn', 'Điểm'] },
    ]);
    expect(pickDataSheet(workbook, 1, REQUIRED).worksheet.name).toBe(
      'export_1 (2)',
    );
  });

  it('trả bản đồ header → chỉ số cột của sheet đã chọn', () => {
    const workbook = workbookWith([
      { name: 'data', headers: ['STT', 'Mã', 'Tên lớp', 'Mã môn'] },
    ]);
    const { headers } = pickDataSheet(workbook, 1, REQUIRED);
    expect(headers.get('mã')).toBe(2);
    expect(headers.get('mã môn')).toBe(4);
  });

  it('ném lỗi nêu rõ sheet nào có gì khi không sheet nào khớp', () => {
    const workbook = workbookWith([{ name: 'Ghi chú', headers: ['Nội dung'] }]);
    expect(() => pickDataSheet(workbook, 1, REQUIRED)).toThrow(
      BadRequestException,
    );
    expect(() => pickDataSheet(workbook, 1, REQUIRED)).toThrow(/Ghi chú/);
  });
});
