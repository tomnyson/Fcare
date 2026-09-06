import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubjectDto, UpdateSubjectDto } from './dto/subject.dto';

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.subject.findMany({
      orderBy: { code: 'asc' },
      include: {
        department: true,
        _count: { select: { classSections: true } },
      },
    });
  }

  async create(dto: CreateSubjectDto) {
    try {
      return await this.prisma.subject.create({ data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Mã môn học "${dto.code}" đã tồn tại.`);
      }
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Bộ môn không tồn tại.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateSubjectDto) {
    try {
      return await this.prisma.subject.update({ where: { id }, data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy môn học.');
      }
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Mã môn học "${dto.code}" đã tồn tại.`);
      }
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Bộ môn không tồn tại.');
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.subject.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy môn học.');
      }
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException(
          'Không thể xóa: môn học đang có lớp học phần.',
        );
      }
      throw error;
    }
  }
}
