import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { deptFilter, isDeptScoped } from '../../common/utils/dept-scope';
import { isPrismaError } from '../../common/utils/prisma-error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BulkAssignMajorDto,
  CreateStudentDto,
  ListStudentsQuery,
  UpdateStudentDto,
} from './dto/student.dto';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: ListStudentsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.StudentWhereInput = {
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.missingMajor ? { majorId: null } : {}),
      // Scope theo bộ môn đặt SAU filter query để luôn thắng với người dùng bị giới hạn.
      ...deptFilter(user),
      ...(query.classCode ? { classCode: query.classCode } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { studentCode: { contains: query.search, mode: 'insensitive' } },
              { fullName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        orderBy: { studentCode: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          major: { select: { id: true, code: true, name: true } },
          department: { select: { id: true, code: true, name: true } },
          _count: {
            select: { alerts: { where: { status: { not: 'RESOLVED' } } } },
          },
        },
      }),
      this.prisma.student.count({ where }),
    ]);

    return { items, meta: { total, page, limit } };
  }

  async findOne(user: AuthUser, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, ...deptFilter(user) },
      include: {
        major: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, code: true, name: true } },
        _count: {
          select: {
            enrollments: true,
            evaluations: true,
            careLogs: true,
            alerts: true,
          },
        },
      },
    });
    if (!student) {
      // Không phân biệt "không tồn tại" và "ngoài phạm vi bộ môn" để tránh dò dữ liệu.
      throw new NotFoundException('Không tìm thấy sinh viên.');
    }
    return student;
  }

  async create(user: AuthUser, dto: CreateStudentDto) {
    const major = await this.prisma.major.findUnique({
      where: { id: dto.majorId },
    });
    if (!major) {
      throw new NotFoundException('Ngành học không tồn tại.');
    }
    this.assertDeptAllowed(user, major.departmentId);

    try {
      return await this.prisma.student.create({
        data: {
          studentCode: dto.studentCode,
          fullName: dto.fullName,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
          majorId: dto.majorId,
          departmentId: major.departmentId,
          cohort: dto.cohort,
          classCode: dto.classCode,
          status: dto.status,
        },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(`MSSV "${dto.studentCode}" đã tồn tại.`);
      }
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateStudentDto) {
    await this.findOne(user, id); // kiểm tra tồn tại + phạm vi bộ môn

    let departmentId: string | undefined;
    if (dto.majorId) {
      const major = await this.prisma.major.findUnique({
        where: { id: dto.majorId },
      });
      if (!major) {
        throw new NotFoundException('Ngành học không tồn tại.');
      }
      this.assertDeptAllowed(user, major.departmentId);
      departmentId = major.departmentId;
    }

    return this.prisma.student.update({
      where: { id },
      data: {
        studentCode: dto.studentCode,
        fullName: dto.fullName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        majorId: dto.majorId,
        departmentId,
        cohort: dto.cohort,
        classCode: dto.classCode,
        status: dto.status,
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    await this.prisma.student.delete({ where: { id } });
    return { deleted: true };
  }

  /** Người dùng bị scope chỉ được thao tác trong bộ môn của mình. */
  private assertDeptAllowed(user: AuthUser, departmentId: string): void {
    if (isDeptScoped(user) && user.departmentId !== departmentId) {
      throw new ForbiddenException(
        'Bạn chỉ được thao tác trên sinh viên thuộc bộ môn của mình.',
      );
    }
  }

  async bulkAssignMajor(
    user: AuthUser,
    dto: BulkAssignMajorDto,
  ): Promise<{ updated: number }> {
    let result: { count: number };
    try {
      result = await this.prisma.student.updateMany({
        // deptFilter nằm trong where: sinh viên ngoài bộ môn không bị đụng tới,
        // và người gọi cũng không biết được id đó có tồn tại hay không (RULE 2).
        where: { id: { in: dto.studentIds }, ...deptFilter(user) },
        data: { majorId: dto.majorId },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Ngành học không tồn tại.');
      }
      throw error;
    }

    if (result.count === 0) {
      throw new NotFoundException(
        'Không có sinh viên nào trong phạm vi truy cập của bạn khớp danh sách đã chọn.',
      );
    }

    await this.audit.log({
      staffId: user.id,
      action: 'STUDENT_BULK_ASSIGN_MAJOR',
      entity: 'Student',
      metadata: { majorId: dto.majorId, updated: result.count },
    });

    return { updated: result.count };
  }
}
