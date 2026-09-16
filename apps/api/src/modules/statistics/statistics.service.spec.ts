import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TermsService } from '../master-data/terms.service';
import { StatisticsService } from './statistics.service';

const lecturer: AuthUser = {
  id: 'gv-chi',
  staffCode: 'GV1',
  fullName: 'Chi',
  roles: ['LECTURER'],
  departmentId: 'dept-se',
  consented: true,
  mustChangePassword: false,
};

function setup(currentTerm: { code: string } | null = { code: 'FA26' }) {
  const prisma = {
    student: {
      count: jest.fn().mockResolvedValue(12),
      groupBy: jest
        .fn()
        .mockResolvedValue([{ status: 'STUDYING', _count: { _all: 12 } }]),
    },
    alert: {
      groupBy: jest.fn().mockResolvedValue([{ level: 2, _count: { _all: 3 } }]),
      count: jest.fn().mockResolvedValue(2),
    },
    careLog: { count: jest.fn().mockResolvedValue(5) },
  };
  const terms = { getCurrentTerm: jest.fn().mockResolvedValue(currentTerm) };
  const service = new StatisticsService(
    prisma as unknown as PrismaService,
    terms as unknown as TermsService,
  );
  return { prisma, terms, service };
}

describe('StatisticsService.overview', () => {
  it('giữ nguyên số liệu cũ và thêm số cảnh báo điểm danh GV đứng lớp chưa chăm sóc', async () => {
    const { service, prisma } = setup();
    const result = await service.overview(lecturer);
    expect(result).toEqual({
      totalStudents: 12,
      careLogsLast30Days: 5,
      studentsByStatus: [{ status: 'STUDYING', count: 12 }],
      openAlertsByLevel: [{ level: 2, count: 3 }],
      attendancePending: 2,
    });
    expect(prisma.alert.count).toHaveBeenCalledWith({
      where: {
        source: 'AUTO_ATTENDANCE',
        term: 'FA26',
        status: { not: 'RESOLVED' },
        ownerCaredAt: null,
        classSection: { lecturerId: 'gv-chi' },
        student: {
          AND: [
            {
              enrollments: { some: { classSection: { lecturerId: 'gv-chi' } } },
            },
          ],
        },
      },
    });
  });

  it('chưa cấu hình học kỳ hiện tại → attendancePending = 0, không query alert.count', async () => {
    const { service, prisma } = setup(null);
    const result = await service.overview(lecturer);
    expect(result.attendancePending).toBe(0);
    expect(prisma.alert.count).not.toHaveBeenCalled();
  });
});
