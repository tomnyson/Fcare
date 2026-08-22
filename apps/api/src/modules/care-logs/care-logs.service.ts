import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import { deptFilter } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCareLogDto, ListCareLogsQuery } from './dto/care-log.dto';

@Injectable()
export class CareLogsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser, query: ListCareLogsQuery) {
    return this.prisma.careLog.findMany({
      where: {
        studentId: query.studentId,
        student: deptFilter(user),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        staff: { select: { id: true, staffCode: true, fullName: true } },
        student: {
          select: {
            id: true,
            studentCode: true,
            fullName: true,
            classCode: true,
          },
        },
      },
    });
  }

  async create(user: AuthUser, dto: CreateCareLogDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, ...deptFilter(user) },
    });
    if (!student) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong phạm vi quản lý của bạn.',
      );
    }

    return this.prisma.careLog.create({
      data: { ...dto, staffId: user.id },
      include: {
        staff: { select: { id: true, staffCode: true, fullName: true } },
      },
    });
  }
}
