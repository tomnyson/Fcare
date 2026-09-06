import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.department.findMany({
      orderBy: { code: 'asc' },
      include: {
        _count: { select: { students: true, staff: true, majors: true } },
      },
    });
  }

  async create(dto: CreateDepartmentDto) {
    try {
      return await this.prisma.department.create({ data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Mã bộ môn "${dto.code}" đã tồn tại.`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    try {
      return await this.prisma.department.update({ where: { id }, data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy bộ môn.');
      }
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Mã bộ môn "${dto.code}" đã tồn tại.`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.department.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy bộ môn.');
      }
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException(
          'Không thể xóa: bộ môn đang có dữ liệu liên kết.',
        );
      }
      throw error;
    }
  }
}
