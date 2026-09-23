import { describe, expect, it } from 'vitest';
import type { SectionGradeRow } from '../../lib/types';
import { filterSectionStudents } from './section-students-roster-modal';

describe('SectionStudentsRosterModal filterSectionStudents', () => {
  const mockStudents: SectionGradeRow[] = [
    {
      enrollmentId: 'enr-1',
      studentId: 'std-1',
      studentCode: 'PK04346',
      fullName: 'Hoàng Lê Minh Sang',
      totalScore: 8.5,
      result: 'PASS',
      alertLevel: 0,
    },
    {
      enrollmentId: 'enr-2',
      studentId: 'std-2',
      studentCode: 'PK04347',
      fullName: 'Nguyễn Văn Nam',
      totalScore: null,
      result: 'IN_PROGRESS',
      alertLevel: 1,
    },
  ];

  it('trả về toàn bộ danh sách khi không có query', () => {
    expect(filterSectionStudents(mockStudents, '')).toHaveLength(2);
  });

  it('tìm kiếm theo MSSV không phân biệt hoa thường', () => {
    const result = filterSectionStudents(mockStudents, 'pk04346');
    expect(result).toHaveLength(1);
    expect(result[0].studentCode).toBe('PK04346');
  });

  it('tìm kiếm theo họ và tên không phân biệt hoa thường', () => {
    const result = filterSectionStudents(mockStudents, 'văn nam');
    expect(result).toHaveLength(1);
    expect(result[0].fullName).toBe('Nguyễn Văn Nam');
  });

  it('trả về mảng rỗng khi không có kết quả khớp', () => {
    const result = filterSectionStudents(mockStudents, 'khong-ton-tai');
    expect(result).toHaveLength(0);
  });
});
