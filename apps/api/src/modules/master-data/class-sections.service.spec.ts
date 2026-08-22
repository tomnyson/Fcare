import { NotFoundException } from '@nestjs/common';
import { EnrollmentResult } from '@prisma/client';
import type { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import { ClassSectionsService } from './class-sections.service';

const user = {
  id: 'staff-1',
  roles: ['ADMIN'],
  departmentId: null,
} as AuthUser;

interface MockHandles {
  prisma: PrismaService;
  findMany: jest.Mock;
  findUnique: jest.Mock;
  enrollmentUpdate: jest.Mock;
  transaction: jest.Mock;
}

function makePrisma(): MockHandles {
  const findMany = jest.fn().mockResolvedValue([]);
  const findUnique = jest.fn();
  const enrollmentUpdate = jest.fn().mockResolvedValue({});
  const transaction = jest.fn().mockResolvedValue([]);
  const prisma = {
    classSection: { findMany, findUnique },
    enrollment: { update: enrollmentUpdate },
    $transaction: transaction,
  } as unknown as PrismaService;
  return { prisma, findMany, findUnique, enrollmentUpdate, transaction };
}

const auditLog = jest.fn();
const audit = { log: auditLog } as unknown as AuditService;

interface FindAllArgs {
  where: { lecturerId?: string | null };
}

interface FindUniqueArgs {
  include: { enrollments: { where: { student: { departmentId?: string } } } };
}

describe('ClassSectionsService — lọc lớp chưa phân công', () => {
  beforeEach(() => jest.clearAllMocks());

  it('unassigned=true lọc lecturerId null', async () => {
    const { prisma, findMany } = makePrisma();
    await new ClassSectionsService(prisma, audit).findAll({ unassigned: true });
    const [args] = findMany.mock.calls[0] as [FindAllArgs];
    expect(args.where.lecturerId).toBeNull();
  });

  it('không truyền unassigned thì không lọc theo lecturerId', async () => {
    const { prisma, findMany } = makePrisma();
    await new ClassSectionsService(prisma, audit).findAll({});
    const [args] = findMany.mock.calls[0] as [FindAllArgs];
    expect(args.where.lecturerId).toBeUndefined();
  });

  it('lọc theo lecturerId cụ thể vẫn hoạt động như cũ', async () => {
    const { prisma, findMany } = makePrisma();
    await new ClassSectionsService(prisma, audit).findAll({
      lecturerId: 'gv-1',
    });
    const [args] = findMany.mock.calls[0] as [FindAllArgs];
    expect(args.where.lecturerId).toBe('gv-1');
  });
});

describe('ClassSectionsService — bảng điểm lớp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trả danh sách sinh viên kèm điểm tổng kết và kết quả', async () => {
    const { prisma, findUnique } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      code: 'SOF1021-SD20301-SU26',
      term: 'SU26',
      subject: { code: 'SOF1021', name: 'Lập trình' },
      enrollments: [
        {
          id: 'enr-1',
          totalScore: 7.5,
          result: EnrollmentResult.PASS,
          student: {
            id: 'stu-1',
            studentCode: 'PK1',
            fullName: 'Nguyễn Văn A',
          },
        },
      ],
    });
    const result = await new ClassSectionsService(prisma, audit).findGrades(
      user,
      'cs-1',
    );
    expect(result.rows).toEqual([
      {
        enrollmentId: 'enr-1',
        studentId: 'stu-1',
        studentCode: 'PK1',
        fullName: 'Nguyễn Văn A',
        totalScore: 7.5,
        result: EnrollmentResult.PASS,
      },
    ]);
  });

  it('lớp không tồn tại → NotFoundException', async () => {
    const { prisma, findUnique } = makePrisma();
    findUnique.mockResolvedValue(null);
    await expect(
      new ClassSectionsService(prisma, audit).findGrades(user, 'khong-co'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('giảng viên chỉ thấy sinh viên bộ môn mình trong lưới điểm (RULE 2)', async () => {
    const { prisma, findUnique } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [],
    });
    const lecturer = {
      id: 'staff-2',
      roles: ['LECTURER'],
      departmentId: 'bm-1',
    } as AuthUser;
    await new ClassSectionsService(prisma, audit).findGrades(lecturer, 'cs-1');
    const [args] = findUnique.mock.calls[0] as [FindUniqueArgs];
    expect(args.include.enrollments.where).toEqual({
      student: { departmentId: 'bm-1' },
    });
  });

  it('cập nhật điểm chạy trong đúng một transaction', async () => {
    const { prisma, findUnique, transaction } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [{ id: 'enr-1' }],
    });
    const result = await new ClassSectionsService(prisma, audit).updateGrades(
      user,
      'cs-1',
      {
        rows: [
          {
            enrollmentId: 'enr-1',
            totalScore: 8,
            result: EnrollmentResult.PASS,
          },
        ],
      },
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ updated: 1 });
  });

  it('từ chối enrollmentId không thuộc lớp — chặn sửa điểm lớp khác', async () => {
    const { prisma, findUnique, transaction } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [{ id: 'enr-1' }],
    });
    await expect(
      new ClassSectionsService(prisma, audit).updateGrades(user, 'cs-1', {
        rows: [
          {
            enrollmentId: 'enr-lop-khac',
            totalScore: 8,
            result: EnrollmentResult.PASS,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('ghi audit log khi sửa điểm', async () => {
    const { prisma, findUnique } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [{ id: 'enr-1' }],
    });
    await new ClassSectionsService(prisma, audit).updateGrades(user, 'cs-1', {
      rows: [
        { enrollmentId: 'enr-1', totalScore: 8, result: EnrollmentResult.PASS },
      ],
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 'staff-1',
        action: 'SECTION_GRADES_UPDATE',
        entity: 'ClassSection',
        entityId: 'cs-1',
      }),
    );
  });
});
