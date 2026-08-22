import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  ClassMajorRulesService,
  DepartmentAliasesService,
} from './mappings.service';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: '6.0.0',
  });
}

describe('DepartmentAliasesService', () => {
  const findMany = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const del = jest.fn();
  const prisma = {
    departmentAlias: { findMany, create, update, delete: del },
  } as unknown as PrismaService;
  const service = new DepartmentAliasesService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('liệt kê kèm bộ môn, sắp xếp theo alias', async () => {
    findMany.mockResolvedValue([]);
    await service.findAll();
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { alias: 'asc' },
      include: { department: { select: { id: true, code: true, name: true } } },
    });
  });

  it('alias trùng → ConflictException nêu rõ alias', async () => {
    create.mockRejectedValue(prismaError('P2002'));
    await expect(
      service.create({ alias: 'Lịch tool', departmentId: 'd1' }),
    ).rejects.toThrow(/Lịch tool/);
  });

  it('alias trùng → đúng loại ConflictException', async () => {
    create.mockRejectedValue(prismaError('P2002'));
    await expect(
      service.create({ alias: 'Lịch tool', departmentId: 'd1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('bộ môn không tồn tại → NotFoundException', async () => {
    create.mockRejectedValue(prismaError('P2003'));
    await expect(
      service.create({ alias: 'X', departmentId: 'khong-co' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sửa bản ghi không tồn tại → NotFoundException', async () => {
    update.mockRejectedValue(prismaError('P2025'));
    await expect(service.update('x', { alias: 'Y' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('xóa thành công trả { deleted: true }', async () => {
    del.mockResolvedValue({});
    await expect(service.remove('x')).resolves.toEqual({ deleted: true });
  });
});

describe('ClassMajorRulesService', () => {
  const findMany = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const del = jest.fn();
  const prisma = {
    classMajorRule: { findMany, create, update, delete: del },
  } as unknown as PrismaService;
  const service = new ClassMajorRulesService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('chuẩn hoá tiền tố về chữ in hoa trước khi lưu', async () => {
    create.mockResolvedValue({});
    await service.create({ classPrefix: 'ai', majorId: 'm1' });
    expect(create).toHaveBeenCalledWith({
      data: { classPrefix: 'AI', majorId: 'm1' },
    });
  });

  it('tiền tố trùng → ConflictException', async () => {
    create.mockRejectedValue(prismaError('P2002'));
    await expect(
      service.create({ classPrefix: 'AI', majorId: 'm1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sửa cũng chuẩn hoá tiền tố', async () => {
    update.mockResolvedValue({});
    await service.update('r1', { classPrefix: 'wd' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { classPrefix: 'WD' },
    });
  });
});
