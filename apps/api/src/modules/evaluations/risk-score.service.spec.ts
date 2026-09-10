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
});
