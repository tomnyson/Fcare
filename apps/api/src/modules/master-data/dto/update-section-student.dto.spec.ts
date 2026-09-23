import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EnrollmentResult } from '@prisma/client';
import { UpdateSectionStudentDto } from './update-section-student.dto';

describe('UpdateSectionStudentDto', () => {
  it('hợp lệ khi truyền họ tên hoặc điểm hợp lệ', async () => {
    const dto = plainToInstance(UpdateSectionStudentDto, {
      fullName: 'Hoàng Lê Minh Sang',
      totalScore: 8.5,
      result: EnrollmentResult.PASS,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('báo lỗi khi điểm tổng kết vượt quá thang điểm 0..10', async () => {
    const dto = plainToInstance(UpdateSectionStudentDto, {
      totalScore: 12,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
