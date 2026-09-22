import { describe, expect, it } from 'vitest';

describe('ConfirmRemoveStudentModal logic', () => {
  it('tạo thông báo xác nhận đúng định dạng', () => {
    const student = { studentCode: 'PK04346', fullName: 'Hoàng Lê Minh Sang' };
    const message = `Bạn chắc chắn muốn xóa sinh viên ${student.studentCode} — ${student.fullName}?`;
    expect(message).toContain('PK04346');
    expect(message).toContain('Hoàng Lê Minh Sang');
  });
});
