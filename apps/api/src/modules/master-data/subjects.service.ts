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

  /** Môn học của bộ môn đã tắt bị ẩn theo — bật lại bộ môn là hiện lại. */
  findAll() {
    return this.prisma.subject.findMany({
      where: { department: { isActive: true } },
      orderBy: { code: 'asc' },
      include: {
        department: true,
        _count: { select: { classSections: true } },
      },
    });
  }

  async create(dto: CreateSubjectDto) {
    await this.assertDepartmentActive(dto.departmentId);
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
    if (dto.departmentId) await this.assertDepartmentActive(dto.departmentId);
    try {
      return await this.prisma.subject.update({ where: { id }, data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy môn học.');
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

  /** Không cho gắn môn vào bộ môn đã tắt: môn sẽ biến mất ngay khỏi danh sách. */
  private async assertDepartmentActive(departmentId: string) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { isActive: true },
    });
    if (department && !department.isActive) {
      throw new ConflictException(
        'Bộ môn đang tắt — bật bộ môn trước khi thêm môn học.',
      );
    }
  }
}
