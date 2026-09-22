import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AddStudentsToSectionDto, AddStudentItemDto } from './add-students-to-section.dto';

describe('AddStudentsToSectionDto', () => {
  it('hợp lệ khi có danh sách sinh viên đúng định dạng', async () => {
    const dto = plainToInstance(AddStudentsToSectionDto, {
      students: [
        { studentCode: 'PK04346', fullName: 'Hoàng Lê Minh Sang' },
        { studentCode: 'PK04347', fullName: 'Nguyễn Văn Nam' },
      ],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('báo lỗi khi danh sách sinh viên rỗng hoặc thiếu trường', async () => {
    const dto = plainToInstance(AddStudentsToSectionDto, {
      students: [{ studentCode: '', fullName: '' }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
