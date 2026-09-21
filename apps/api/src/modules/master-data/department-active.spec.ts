import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { DepartmentsService } from './departments.service';
import { SubjectsService } from './subjects.service';

const departmentFindMany = jest.fn().mockResolvedValue([]);
const departmentFindUnique = jest.fn();
const subjectFindMany = jest.fn().mockResolvedValue([]);
const subjectCreate = jest.fn().mockResolvedValue({ id: 'sub-1' });
const prisma = {
  department: {
    findMany: departmentFindMany,
    findUnique: departmentFindUnique,
  },
  subject: { findMany: subjectFindMany, create: subjectCreate },
} as unknown as PrismaService;

const departments = new DepartmentsService(prisma);

/** Điều kiện `where` của lần gọi findMany đầu tiên. */
function firstWhere(mock: jest.Mock): unknown {
  const [args] = mock.mock.calls[0] as [{ where: unknown }];
  return args.where;
}
const subjects = new SubjectsService(prisma);

describe('Bật/tắt bộ môn theo cơ sở', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mặc định chỉ trả bộ môn đang bật (dropdown tự ẩn bộ môn cơ sở không mở)', async () => {
    await departments.findAll();
    expect(firstWhere(departmentFindMany)).toEqual({
      isActive: true,
    });
  });

  it('includeInactive trả đủ để trang quản lý còn bật lại được', async () => {
    await departments.findAll(true);
    expect(firstWhere(departmentFindMany)).toEqual({});
  });

  it('môn học của bộ môn đã tắt bị ẩn theo', async () => {
    await subjects.findAll();
    expect(firstWhere(subjectFindMany)).toEqual({
      department: { isActive: true },
    });
  });

  it('không cho thêm môn vào bộ môn đang tắt', async () => {
    departmentFindUnique.mockResolvedValueOnce({ isActive: false });
    await expect(
      subjects.create({
        code: 'X1',
        name: 'X',
        credits: 3,
        departmentId: 'd-off',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(subjectCreate).not.toHaveBeenCalled();
  });

  it('thêm môn vào bộ môn đang bật vẫn bình thường', async () => {
    departmentFindUnique.mockResolvedValueOnce({ isActive: true });
    await subjects.create({
      code: 'X1',
      name: 'X',
      credits: 3,
      departmentId: 'd-on',
    });
    expect(subjectCreate).toHaveBeenCalled();
  });
});
