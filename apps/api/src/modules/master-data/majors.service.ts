import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMajorDto, UpdateMajorDto } from './dto/major.dto';

@Injectable()
export class MajorsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.major.findMany({
      orderBy: { code: 'asc' },
      include: { department: true, _count: { select: { students: true } } },
    });
  }

  async create(dto: CreateMajorDto) {
    try {
      return await this.prisma.major.create({ data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Mã ngành "${dto.code}" đã tồn tại.`);
      }
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Bộ môn không tồn tại.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateMajorDto) {
    try {
      return await this.prisma.major.update({ where: { id }, data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy ngành.');
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.major.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy ngành.');
      }
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException('Không thể xóa: ngành đang có sinh viên.');
      }
      throw error;
    }
  }
}
