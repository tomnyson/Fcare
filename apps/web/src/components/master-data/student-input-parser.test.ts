import { describe, expect, it } from 'vitest';
import { parseStudentInputText } from './student-input-parser';

describe('parseStudentInputText', () => {
  it('phân tích định dạng cách nhau bằng tab (copy từ Excel/Sheets)', () => {
    const text = 'PK04346\tHoàng Lê Minh Sang\nPK04347\tNguyễn Văn A';
    const result = parseStudentInputText(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      studentCode: 'PK04346',
      fullName: 'Hoàng Lê Minh Sang',
      isValid: true,
    });
  });

  it('phân tích định dạng cách nhau bằng dấu phẩy hoặc gạch ngang', () => {
    const text = 'PK04346, Hoàng Lê Minh Sang\nPK04347 - Nguyễn Văn A';
    const result = parseStudentInputText(text);
    expect(result).toHaveLength(2);
    expect(result[0].isValid).toBe(true);
    expect(result[1].isValid).toBe(true);
  });

  it('phân tích định dạng cách nhau bằng khoảng trắng', () => {
    const text = 'PK04346   Hoàng Lê Minh Sang';
    const result = parseStudentInputText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      studentCode: 'PK04346',
      fullName: 'Hoàng Lê Minh Sang',
      isValid: true,
    });
  });

  it('bỏ qua dòng trống và header', () => {
    const text = 'MSSV\tHọ tên\n\nPK04346\tHoàng Lê Minh Sang';
    const result = parseStudentInputText(text);
    expect(result).toHaveLength(1);
    expect(result[0].studentCode).toBe('PK04346');
  });

  it('báo lỗi khi thiếu họ tên hoặc mã sinh viên không hợp lệ', () => {
    const text = 'PK04346\n@@@@ Tên Lỗi';
    const result = parseStudentInputText(text);
    expect(result).toHaveLength(2);
    expect(result[0].isValid).toBe(false);
    expect(result[0].error).toContain('họ tên');
  });
});
