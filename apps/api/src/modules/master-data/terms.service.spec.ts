import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, TermSeason } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { TermsService } from './terms.service';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: '6.0.0',
  });
}

describe('TermsService', () => {
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const findFirst = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const updateMany = jest.fn();
  const del = jest.fn();
  const countClassSections = jest.fn();
  const transaction = jest.fn();

  const prisma = {
    term: {
      findMany,
      findUnique,
      findFirst,
      create,
      update,
      updateMany,
      delete: del,
    },
    classSection: {
      count: countClassSections,
    },
    $transaction: transaction,
  } as unknown as PrismaService;

  const service = new TermsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('sắp xếp theo năm giảm dần và ngày bắt đầu giảm dần', async () => {
      findMany.mockResolvedValue([]);
      await service.findAll();
      expect(findMany).toHaveBeenCalledWith({
        orderBy: [{ year: 'desc' }, { startDate: 'desc' }],
      });
    });
  });

  describe('getCurrentTerm', () => {
    it('ưu tiên 1: trả về kỳ có cờ isCurrentOverride = true', async () => {
      const overrideTerm = { id: 't1', code: 'SU25', isCurrentOverride: true };
      findFirst.mockResolvedValueOnce(overrideTerm);

      const result = await service.getCurrentTerm();
      expect(result).toEqual(overrideTerm);
      expect(findFirst).toHaveBeenCalledWith({
        where: { isCurrentOverride: true },
      });
    });

    it('ưu tiên 2: nếu không có override, trả về kỳ có startDate <= now <= endDate', async () => {
      findFirst
        .mockResolvedValueOnce(null) // no override
        .mockResolvedValueOnce({ id: 't2', code: 'SP25', isCurrentOverride: false }); // date match

      const result = await service.getCurrentTerm();
      expect(result).toEqual({ id: 't2', code: 'SP25', isCurrentOverride: false });
    });

    it('ưu tiên 3: nếu đang nghỉ giữa kỳ, trả về kỳ sắp tới gần nhất', async () => {
      findFirst
        .mockResolvedValueOnce(null) // no override
        .mockResolvedValueOnce(null) // no date match
        .mockResolvedValueOnce({ id: 't3', code: 'FA25' }); // upcoming nearest

      const result = await service.getCurrentTerm();
      expect(result).toEqual({ id: 't3', code: 'FA25' });
    });

    it('ưu tiên 3 fallback: nếu không có kỳ sắp tới, trả về kỳ vừa kết thúc gần nhất', async () => {
      findFirst
        .mockResolvedValueOnce(null) // no override
        .mockResolvedValueOnce(null) // no date match
        .mockResolvedValueOnce(null) // no upcoming
        .mockResolvedValueOnce({ id: 't4', code: 'SP25' }); // past nearest

      const result = await service.getCurrentTerm();
      expect(result).toEqual({ id: 't4', code: 'SP25' });
    });

    it('trả về null nếu DB chưa có kỳ nào', async () => {
      findFirst.mockResolvedValue(null);
      const result = await service.getCurrentTerm();
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    const validDto = {
      code: 'SP25',
      name: 'Spring 2025',
      season: TermSeason.SPRING,
      year: 2025,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-04-30T23:59:59.999Z',
    };

    it('chặn tạo nếu startDate >= endDate', async () => {
      await expect(
        service.create({
          ...validDto,
          startDate: '2025-05-01T00:00:00.000Z',
          endDate: '2025-04-30T00:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('chặn trùng mã kỳ (P2002)', async () => {
      create.mockRejectedValue(prismaError('P2002'));
      await expect(service.create(validDto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('nếu bật isCurrentOverride, chạy qua transaction để reset cờ các kỳ khác', async () => {
      const createdTerm = { id: 'new-id', ...validDto, isCurrentOverride: true };
      transaction.mockImplementation(async (callback) => {
        const txPrisma = {
          term: {
            updateMany: jest.fn(),
            create: jest.fn().mockResolvedValue(createdTerm),
          },
        };
        return callback(txPrisma);
      });

      const result = await service.create({ ...validDto, isCurrentOverride: true });
      expect(result).toEqual(createdTerm);
      expect(transaction).toHaveBeenCalled();
    });
  });

  describe('setCurrent', () => {
    it('gán cờ override cho kỳ và tắt cờ các kỳ khác trong transaction', async () => {
      findUnique.mockResolvedValue({ id: 't1', code: 'SP25' });
      transaction.mockImplementation(async (callback) => {
        const txPrisma = {
          term: {
            updateMany: jest.fn(),
            update: jest.fn().mockResolvedValue({ id: 't1', isCurrentOverride: true }),
          },
        };
        return callback(txPrisma);
      });

      const result = await service.setCurrent('t1', true);
      expect(result).toEqual({ id: 't1', isCurrentOverride: true });
      expect(transaction).toHaveBeenCalled();
    });

    it('kỳ không tồn tại ném NotFoundException', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.setCurrent('none', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('chặn xóa nếu đã có lớp học phần thuộc kỳ này', async () => {
      findUnique.mockResolvedValue({ id: 't1', code: 'SP25' });
      countClassSections.mockResolvedValue(5);

      await expect(service.delete('t1')).rejects.toBeInstanceOf(BadRequestException);
      expect(del).not.toHaveBeenCalled();
    });

    it('cho phép xóa nếu chưa có lớp học phần nào', async () => {
      findUnique.mockResolvedValue({ id: 't1', code: 'SP25' });
      countClassSections.mockResolvedValue(0);
      del.mockResolvedValue({ id: 't1' });

      await service.delete('t1');
      expect(del).toHaveBeenCalledWith({ where: { id: 't1' } });
    });

    it('kỳ không tồn tại ném NotFoundException', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.delete('none')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
