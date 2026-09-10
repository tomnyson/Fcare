import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateClassMajorRuleDto,
  CreateDepartmentAliasDto,
  CreateMajorAliasDto,
  UpdateClassMajorRuleDto,
  UpdateDepartmentAliasDto,
  UpdateMajorAliasDto,
} from './dto/mapping.dto';

@Injectable()
export class DepartmentAliasesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.departmentAlias.findMany({
      orderBy: { alias: 'asc' },
      include: { department: { select: { id: true, code: true, name: true } } },
    });
  }

  async create(dto: CreateDepartmentAliasDto) {
    try {
      return await this.prisma.departmentAlias.create({ data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Nhãn "${dto.alias}" đã được ánh xạ.`);
      }
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Bộ môn không tồn tại.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateDepartmentAliasDto) {
    try {
      return await this.prisma.departmentAlias.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy ánh xạ bộ môn.');
      }
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Nhãn "${dto.alias}" đã được ánh xạ.`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.departmentAlias.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy ánh xạ bộ môn.');
      }
      throw error;
    }
  }
}

@Injectable()
export class ClassMajorRulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.classMajorRule.findMany({
      orderBy: { classPrefix: 'asc' },
      include: { major: { select: { id: true, code: true, name: true } } },
    });
  }

  async create(dto: CreateClassMajorRuleDto) {
    const data = { ...dto, classPrefix: dto.classPrefix.toUpperCase() };
    try {
      return await this.prisma.classMajorRule.create({ data });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          `Tiền tố lớp "${data.classPrefix}" đã có quy tắc.`,
        );
      }
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Ngành học không tồn tại.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateClassMajorRuleDto) {
    const data = {
      ...dto,
      ...(dto.classPrefix
        ? { classPrefix: dto.classPrefix.toUpperCase() }
        : {}),
    };
    try {
      return await this.prisma.classMajorRule.update({ where: { id }, data });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy quy tắc lớp → ngành.');
      }
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          `Tiền tố lớp "${data.classPrefix}" đã có quy tắc.`,
        );
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.classMajorRule.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy quy tắc lớp → ngành.');
      }
      throw error;
    }
  }
}

/**
 * Ánh xạ mã ngành trong file Excel → ngành trong hệ thống. File DSSV lớp môn
 * dùng mã ngành riêng của phòng đào tạo ("LTWE02", "DIMA01"), không trùng
 * `Major.code`. Thiếu ánh xạ thì sinh viên vẫn được tạo nhưng để trống ngành
 * (xem `RosterCommitter`) — KHÔNG bỏ dòng, khác với ánh xạ bộ môn.
 */
@Injectable()
export class MajorAliasesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.majorAlias.findMany({
      orderBy: { alias: 'asc' },
      include: { major: { select: { id: true, code: true, name: true } } },
    });
  }

  async create(dto: CreateMajorAliasDto) {
    try {
      return await this.prisma.majorAlias.create({ data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Nhãn "${dto.alias}" đã được ánh xạ.`);
      }
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Ngành học không tồn tại.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateMajorAliasDto) {
    try {
      return await this.prisma.majorAlias.update({ where: { id }, data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy ánh xạ ngành.');
      }
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`Nhãn "${dto.alias}" đã được ánh xạ.`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.majorAlias.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Không tìm thấy ánh xạ ngành.');
      }
      throw error;
    }
  }
}
