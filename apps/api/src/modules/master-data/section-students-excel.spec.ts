import {
  generateStudentsExcelTemplate,
  parseStudentsExcelBuffer,
} from './section-students-excel';

describe('section-students-excel', () => {
  it('tạo file mẫu và đọc lại đúng cấu trúc MSSV và Họ tên', async () => {
    const templateBuffer = await generateStudentsExcelTemplate();
    expect(templateBuffer).toBeInstanceOf(Buffer);
    expect(templateBuffer.length).toBeGreaterThan(0);

    const parsed = await parseStudentsExcelBuffer(templateBuffer);
    expect(parsed.length).toBe(1);
    expect(parsed[0].studentCode).toBe('PK04346');
    expect(parsed[0].fullName).toBe('Hoàng Lê Minh Sang');
  });

  it('bỏ qua dòng trống và dòng tiêu đề', async () => {
    const templateBuffer = await generateStudentsExcelTemplate();
    const parsed = await parseStudentsExcelBuffer(templateBuffer);
    const hasHeader = parsed.some((p) => p.studentCode.toUpperCase() === 'MSSV');
    expect(hasHeader).toBe(false);
  });
});
