import { describe, expect, it } from 'vitest';
import { parseStudentInputText } from './student-input-parser';

describe('AddStudentsModal logic', () => {
  it('lọc danh sách sinh viên hợp lệ để gửi API', () => {
    const input = 'PK04346\tHoàng Lê Minh Sang\nLỖI\nPK04347\tNguyễn Văn Nam';
    const parsed = parseStudentInputText(input);
    const valid = parsed.filter((item) => item.isValid);
    expect(valid).toHaveLength(2);
    expect(valid.map((v) => v.studentCode)).toEqual(['PK04346', 'PK04347']);
  });
});
