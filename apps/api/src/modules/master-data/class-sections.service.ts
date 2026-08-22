import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateClassSectionDto,
  ListClassSectionsQuery,
  UpdateClassSectionDto,
} from './dto/class-section.dto';

@Injectable()
export class ClassSectionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: ListClassSectionsQuery) {
    return this.prisma.classSection.findMany({
      where: {
        term: query.term,
        lecturerId: query.lecturerId,
      },
      orderBy: [{ term: 'desc' }, { code: 'asc' }],
      include: {
        subject: true,
        lecturer: { select: { id: true, staffCode: true, fullName: true } },
        _count: { select: { enrollments: true } },
      },
    });
  }

  async create(dto: CreateClassSectionDto) {
    try {
      return await this.prisma.classSection.create({ data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          `Mã lớp học phần "${dto.code}" đã tồn tại.`,
        );
      }
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Môn học hoặc giảng viên không tồn tại.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateClassSectionDto) {
    try {
      return await this.prisma.classSection.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy lớp học phần.');
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.classSection.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy lớp học phần.');
      }
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException(
          'Không thể xóa: lớp học phần đang có sinh viên đăng ký.',
        );
      }
      throw error;
    }
  }
}
