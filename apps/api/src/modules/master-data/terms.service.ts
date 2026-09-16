import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTermDto, UpdateTermDto } from './dto/term.dto';

@Injectable()
export class TermsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.term.findMany({
      orderBy: [{ year: 'desc' }, { startDate: 'desc' }],
    });
  }

  async findOne(id: string) {
    const term = await this.prisma.term.findUnique({ where: { id } });
    if (!term) {
      throw new NotFoundException(`Không tìm thấy học kỳ với id ${id}`);
    }
    return term;
  }

  async getCurrentTerm() {
    // 1. Ưu tiên Admin Override
    const override = await this.prisma.term.findFirst({
      where: { isCurrentOverride: true },
    });
    if (override) return override;

    // 2. Theo ngày thực tế
    const now = new Date();
    const currentByDate = await this.prisma.term.findFirst({
      where: {
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });
    if (currentByDate) return currentByDate;

    // 3. Fallback: Kỳ sắp tới gần nhất
    const upcoming = await this.prisma.term.findFirst({
      where: { startDate: { gt: now } },
      orderBy: { startDate: 'asc' },
    });
    if (upcoming) return upcoming;

    // 4. Fallback: Kỳ vừa kết thúc gần nhất
    const past = await this.prisma.term.findFirst({
      where: { endDate: { lt: now } },
      orderBy: { endDate: 'desc' },
    });
    if (past) return past;

    return null;
  }

  async create(dto: CreateTermDto) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (start >= end) {
      throw new BadRequestException('Ngày bắt đầu phải nhỏ hơn ngày kết thúc');
    }

    try {
      if (dto.isCurrentOverride) {
        return await this.prisma.$transaction(async (tx) => {
          await tx.term.updateMany({ data: { isCurrentOverride: false } });
          return tx.term.create({
            data: {
              ...dto,
              code: dto.code.trim().toUpperCase(),
              startDate: start,
              endDate: end,
            },
          });
        });
      }

      return await this.prisma.term.create({
        data: {
          ...dto,
          code: dto.code.trim().toUpperCase(),
          startDate: start,
          endDate: end,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Mã học kỳ "${dto.code}" đã tồn tại`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateTermDto) {
    const current = await this.findOne(id);

    const start = dto.startDate ? new Date(dto.startDate) : current.startDate;
    const end = dto.endDate ? new Date(dto.endDate) : current.endDate;

    if (start >= end) {
      throw new BadRequestException('Ngày bắt đầu phải nhỏ hơn ngày kết thúc');
    }

    try {
      if (dto.isCurrentOverride) {
        return await this.prisma.$transaction(async (tx) => {
          await tx.term.updateMany({ data: { isCurrentOverride: false } });
          return tx.term.update({
            where: { id },
            data: {
              ...dto,
              ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}),
              startDate: start,
              endDate: end,
            },
          });
        });
      }

      return await this.prisma.term.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}),
          startDate: start,
          endDate: end,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(`Mã học kỳ "${dto.code}" đã tồn tại`);
        }
        if (error.code === 'P2025') {
          throw new NotFoundException(`Không tìm thấy học kỳ với id ${id}`);
        }
      }
      throw error;
    }
  }

  async setCurrent(id: string, isCurrent: boolean) {
    const term = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      await tx.term.updateMany({ data: { isCurrentOverride: false } });
      return tx.term.update({
        where: { id: term.id },
        data: { isCurrentOverride: isCurrent },
      });
    });
  }

  async delete(id: string) {
    const term = await this.findOne(id);

    const relatedClassSections = await this.prisma.classSection.count({
      where: { term: term.code },
    });

    if (relatedClassSections > 0) {
      throw new BadRequestException(
        `Không thể xóa học kỳ ${term.code} vì đang có ${relatedClassSections} lớp học phần liên kết.`,
      );
    }

    return this.prisma.term.delete({
      where: { id },
    });
  }
}
