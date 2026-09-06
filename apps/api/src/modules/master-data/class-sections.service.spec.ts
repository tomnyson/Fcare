import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EnrollmentResult } from '@prisma/client';
import type { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import { ClassSectionsService } from './class-sections.service';
import type { SectionGradeRowDto } from './dto/section-grades.dto';

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
  alertGroupBy: jest.Mock;
}

function makePrisma(): MockHandles {
  const findMany = jest.fn().mockResolvedValue([]);
  const findUnique = jest.fn();
  const enrollmentUpdate = jest.fn().mockResolvedValue({});
  const transaction = jest.fn().mockResolvedValue([]);
  const alertGroupBy = jest.fn().mockResolvedValue([]);
  const prisma = {
    classSection: { findMany, findUnique },
    enrollment: { update: enrollmentUpdate },
    alert: { groupBy: alertGroupBy },
    $transaction: transaction,
  } as unknown as PrismaService;
  return {
    prisma,
    findMany,
    findUnique,
    enrollmentUpdate,
    transaction,
    alertGroupBy,
  };
}

const auditLog = jest.fn();
const audit = { log: auditLog } as unknown as AuditService;

interface FindAllArgs {
  where: { lecturerId?: string | null };
}

/** findGrades và updateGrades đều dùng `select.enrollments.where` (fix vòng 1,
 * mục 5: findGrades đổi từ `include` sang `select` tường minh). */
interface SelectEnrollmentsArgs {
  select: { enrollments: { where: { student: unknown } } };
}

/** Phạm vi sinh viên của giảng viên: chỉ sinh viên lớp mình đang dạy. */
function scopeOf(staffId: string) {
  return {
    AND: [{ enrollments: { some: { classSection: { lecturerId: staffId } } } }],
  };
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
        alertLevel: null,
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

  it('giảng viên chỉ thấy sinh viên lớp mình dạy trong lưới điểm (RULE 2)', async () => {
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
    const [args] = findUnique.mock.calls[0] as [SelectEnrollmentsArgs];
    expect(args.select.enrollments.where).toEqual({
      student: scopeOf('staff-2'),
    });
  });

  it('gắn cấp độ cảnh báo chưa xử lý cao nhất vào từng dòng danh sách lớp', async () => {
    const { prisma, findUnique, alertGroupBy } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      code: 'SOF1021.1',
      term: 'FA25',
      subject: { code: 'SOF1021', name: 'Lập trình' },
      enrollments: [
        {
          id: 'enr-1',
          totalScore: null,
          result: EnrollmentResult.IN_PROGRESS,
          student: { id: 'stu-1', studentCode: 'PK1', fullName: 'A' },
        },
        {
          id: 'enr-2',
          totalScore: null,
          result: EnrollmentResult.IN_PROGRESS,
          student: { id: 'stu-2', studentCode: 'PK2', fullName: 'B' },
        },
      ],
    });
    alertGroupBy.mockResolvedValue([
      { studentId: 'stu-2', _max: { level: 3 } },
    ]);

    const result = await new ClassSectionsService(prisma, audit).findGrades(
      user,
      'cs-1',
    );

    expect(result.rows.map((row) => row.alertLevel)).toEqual([null, 3]);
  });

  it('chỉ hỏi cảnh báo chưa xử lý của đúng sinh viên trong lớp', async () => {
    const { prisma, findUnique, alertGroupBy } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [
        {
          id: 'enr-1',
          totalScore: null,
          result: EnrollmentResult.IN_PROGRESS,
          student: { id: 'stu-1', studentCode: 'PK1', fullName: 'A' },
        },
      ],
    });

    await new ClassSectionsService(prisma, audit).findGrades(user, 'cs-1');

    const [args] = alertGroupBy.mock.calls[0] as [
      {
        by: string[];
        where: { studentId: { in: string[] }; status: { in: string[] } };
        _max: { level: boolean };
      },
    ];
    expect(args.by).toEqual(['studentId']);
    expect(args.where.studentId.in).toEqual(['stu-1']);
    expect(args.where.status.in).toEqual(['OPEN', 'ACKNOWLEDGED']);
    expect(args._max.level).toBe(true);
  });

  it('lớp rỗng thì không truy vấn bảng cảnh báo', async () => {
    const { prisma, findUnique, alertGroupBy } = makePrisma();
    findUnique.mockResolvedValue({ id: 'cs-1', enrollments: [] });

    const result = await new ClassSectionsService(prisma, audit).findGrades(
      user,
      'cs-1',
    );

    expect(result.rows).toEqual([]);
    expect(alertGroupBy).not.toHaveBeenCalled();
  });

  it('cập nhật điểm chạy trong đúng một transaction', async () => {
    const { prisma, findUnique, transaction } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [
        { id: 'enr-1', totalScore: null, result: EnrollmentResult.IN_PROGRESS },
      ],
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
      enrollments: [
        { id: 'enr-1', totalScore: null, result: EnrollmentResult.IN_PROGRESS },
      ],
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

  it('cập nhật điểm cũng lọc enrollment theo phạm vi người gọi (RULE 2)', async () => {
    const { prisma, findUnique } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [
        { id: 'enr-1', totalScore: null, result: EnrollmentResult.IN_PROGRESS },
      ],
    });
    const lecturer = {
      id: 'staff-2',
      roles: ['LECTURER'],
      departmentId: 'dept-1',
    } as AuthUser;
    await new ClassSectionsService(prisma, audit).updateGrades(
      lecturer,
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
    const [args] = findUnique.mock.calls[0] as [SelectEnrollmentsArgs];
    expect(args.select.enrollments.where).toEqual({
      student: scopeOf('staff-2'),
    });
  });

  it('thiếu totalScore trong payload → ghi null (xóa điểm)', async () => {
    const { prisma, findUnique, enrollmentUpdate } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [
        { id: 'enr-1', totalScore: 5, result: EnrollmentResult.FAIL },
      ],
    });
    await new ClassSectionsService(prisma, audit).updateGrades(user, 'cs-1', {
      rows: [
        {
          enrollmentId: 'enr-1',
          result: EnrollmentResult.FAIL,
        } as unknown as SectionGradeRowDto,
      ],
    });
    expect(enrollmentUpdate).toHaveBeenCalledWith({
      where: { id: 'enr-1' },
      data: { totalScore: null, result: EnrollmentResult.FAIL },
    });
  });

  it('enrollmentId trùng trong payload → BadRequestException, không chạy transaction', async () => {
    const { prisma, findUnique, transaction } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [
        { id: 'enr-1', totalScore: null, result: EnrollmentResult.IN_PROGRESS },
      ],
    });
    await expect(
      new ClassSectionsService(prisma, audit).updateGrades(user, 'cs-1', {
        rows: [
          {
            enrollmentId: 'enr-1',
            totalScore: 8,
            result: EnrollmentResult.PASS,
          },
          {
            enrollmentId: 'enr-1',
            totalScore: 9,
            result: EnrollmentResult.PASS,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('ghi audit log khi sửa điểm', async () => {
    const { prisma, findUnique } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [
        { id: 'enr-1', totalScore: null, result: EnrollmentResult.IN_PROGRESS },
      ],
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

  it('ghi audit log kèm changes đúng giá trị cũ và mới của dòng bị đổi', async () => {
    const { prisma, findUnique } = makePrisma();
    findUnique.mockResolvedValue({
      id: 'cs-1',
      enrollments: [
        { id: 'enr-1', totalScore: 5, result: EnrollmentResult.FAIL },
      ],
    });
    await new ClassSectionsService(prisma, audit).updateGrades(user, 'cs-1', {
      rows: [
        { enrollmentId: 'enr-1', totalScore: 8, result: EnrollmentResult.PASS },
      ],
    });
    const [entry] = auditLog.mock.calls[0] as [
      { metadata: { changes: unknown } },
    ];
    expect(entry.metadata.changes).toEqual([
      {
        enrollmentId: 'enr-1',
        from: { totalScore: 5, result: EnrollmentResult.FAIL },
        to: { totalScore: 8, result: EnrollmentResult.PASS },
      },
    ]);
  });
});
