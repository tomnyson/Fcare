import { RiskScoreService } from './risk-score.service';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';

const user = {
  id: 'gv-1',
  roles: ['LECTURER'],
  departmentId: 'bm-1',
} as unknown as AuthUser;

describe('RiskScoreService', () => {
  it('chuyển dòng Prisma sang đầu vào của hàm thuần rồi trả bản phân rã', async () => {
    const prisma = {
      evaluation: {
        findMany: jest.fn().mockResolvedValue([
          {
            academicScore: 3,
            attitudeScore: 3,
            absentSessions: 3,
            criteria: [{ criterion: 'P_DROPOUT_INTENT' }],
            classSection: { enrollments: [{ absentSessions: 0 }] },
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new RiskScoreService(prisma);
    const result = await service.forStudentTerm(user, 'sv-1', 'SU25');

    // R_L 3 + R_A 3 + R_C 3 + R_P 9 = 18 -> cấp 4
    expect(result.drs).toBe(18);
    expect(result.drsLevel).toBe(4);
    expect(result.evaluationCount).toBe(1);
  });

  it('lọc nhận xét bằng studentScope để giảng viên không thấy ngoài phạm vi', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { evaluation: { findMany } } as unknown as PrismaService;
    await new RiskScoreService(prisma).forStudentTerm(user, 'sv-1', 'SU25');
    const calls = findMany.mock.calls as [{ where: Record<string, unknown> }][];
    const where = calls[0][0].where;
    expect(where.student).toBeDefined();
    expect(where.studentId).toBe('sv-1');
    expect(where.term).toBe('SU25');
  });

  it('giảng viên bỏ trống số buổi vắng thì lấy số buổi nghỉ từ dữ liệu điểm danh của lớp đó', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        academicScore: 10,
        attitudeScore: 10,
        absentSessions: null,
        criteria: [],
        classSection: { enrollments: [{ absentSessions: 3 }] },
      },
    ]);
    const prisma = { evaluation: { findMany } } as unknown as PrismaService;
    const result = await new RiskScoreService(prisma).forStudentTerm(
      user,
      'sv-1',
      'SU25',
    );

    expect(result.components.RC).toBe(3);
    const calls = findMany.mock.calls as [
      {
        select: {
          classSection: { select: { enrollments: { where: unknown } } };
        };
      },
    ][];
    // Chỉ lấy enrollment của đúng sinh viên này trong lớp học phần.
    expect(calls[0][0].select.classSection.select.enrollments.where).toEqual({
      studentId: 'sv-1',
    });
  });

  it('số giảng viên tự ghi được ưu tiên hơn dữ liệu điểm danh', async () => {
    const prisma = {
      evaluation: {
        findMany: jest.fn().mockResolvedValue([
          {
            academicScore: 10,
            attitudeScore: 10,
            absentSessions: 2,
            criteria: [],
            classSection: { enrollments: [{ absentSessions: 5 }] },
          },
        ]),
      },
    } as unknown as PrismaService;
    const result = await new RiskScoreService(prisma).forStudentTerm(
      user,
      'sv-1',
      'SU25',
    );
    expect(result.components.RC).toBe(2);
  });

  it('không có cả hai nguồn thì R_C = 0', async () => {
    const prisma = {
      evaluation: {
        findMany: jest.fn().mockResolvedValue([
          {
            academicScore: 10,
            attitudeScore: 10,
            absentSessions: null,
            criteria: [],
            classSection: { enrollments: [] },
          },
        ]),
      },
    } as unknown as PrismaService;
    const result = await new RiskScoreService(prisma).forStudentTerm(
      user,
      'sv-1',
      'SU25',
    );
    expect(result.components.RC).toBe(0);
  });
});
