import { NotFoundException } from '@nestjs/common';
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

/** Thống kê của giảng viên: SV học lớp mình dạy của môn thuộc bộ môn mình. */
const LECTURER_SCOPE = {
  AND: [
    {
      enrollments: {
        some: {
          classSection: {
            lecturerId: 'gv-chi',
            subject: { departmentId: 'dept-se' },
          },
        },
      },
    },
  ],
};

const FA26 = {
  code: 'FA26',
  name: 'Fall 2026',
  startDate: new Date('2026-09-01T00:00:00.000Z'),
  endDate: new Date('2026-12-31T23:59:59.999Z'),
};
const SU26 = {
  code: 'SU26',
  name: 'Summer 2026',
  startDate: new Date('2026-05-01T00:00:00.000Z'),
  endDate: new Date('2026-08-31T23:59:59.999Z'),
};

const FA26_RANGE = { gte: FA26.startDate, lte: FA26.endDate };
/** Cảnh báo tay chưa gắn kỳ được tính theo ngày tạo nằm trong kỳ. */
const FA26_ALERTS = {
  OR: [{ term: 'FA26' }, { term: null, createdAt: FA26_RANGE }],
};

function setup(currentTerm: typeof FA26 | null = FA26) {
  const prisma = {
    student: {
      count: jest.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(4),
      groupBy: jest
        .fn()
        .mockResolvedValue([{ status: 'STUDYING', _count: { _all: 12 } }]),
    },
    alert: {
      groupBy: jest.fn().mockResolvedValue([{ level: 2, _count: { _all: 3 } }]),
      count: jest.fn().mockResolvedValue(2),
    },
    careLog: {
      count: jest.fn().mockResolvedValueOnce(9).mockResolvedValueOnce(5),
    },
    term: { findUnique: jest.fn().mockResolvedValue(SU26) },
  };
  const terms = { getCurrentTerm: jest.fn().mockResolvedValue(currentTerm) };
  const service = new StatisticsService(
    prisma as unknown as PrismaService,
    terms as unknown as TermsService,
  );
  return { prisma, terms, service };
}

describe('StatisticsService.overview — chỉ thống kê trong một kỳ', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-21T00:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  it('không truyền kỳ → dùng kỳ hiện tại, trả đủ 4 chỉ số của kỳ', async () => {
    const { service } = setup();
    const result = await service.overview(lecturer);
    expect(result).toEqual({
      term: FA26,
      totalStudents: 12,
      warnedStudents: 4,
      careLogsInTerm: 9,
      careLogsLast7Days: 5,
      studentsByStatus: [{ status: 'STUDYING', count: 12 }],
      openAlertsByLevel: [{ level: 2, count: 3 }],
      attendancePending: 2,
    });
  });

  it('tổng SV chỉ đếm SV có đăng ký lớp học phần của kỳ (không cộng dồn các kỳ)', async () => {
    const { service, prisma } = setup();
    await service.overview(lecturer);
    expect(prisma.student.count).toHaveBeenNthCalledWith(1, {
      where: {
        AND: [
          LECTURER_SCOPE,
          { enrollments: { some: { classSection: { term: 'FA26' } } } },
        ],
      },
    });
  });

  it('cảnh báo mở và SV diện cảnh báo chỉ tính cảnh báo thuộc kỳ', async () => {
    const { service, prisma } = setup();
    await service.overview(lecturer);
    expect(prisma.alert.groupBy).toHaveBeenCalledWith({
      by: ['level'],
      _count: { _all: true },
      where: {
        AND: [
          FA26_ALERTS,
          { status: { not: 'RESOLVED' } },
          { student: LECTURER_SCOPE },
        ],
      },
    });
    expect(prisma.student.count).toHaveBeenNthCalledWith(2, {
      where: {
        AND: [
          LECTURER_SCOPE,
          {
            alerts: {
              some: { AND: [FA26_ALERTS, { status: { not: 'RESOLVED' } }] },
            },
          },
        ],
      },
    });
  });

  it('lượt chăm sóc đếm trong kỳ, kèm 7 ngày gần nhất (không vượt đầu kỳ)', async () => {
    const { service, prisma } = setup();
    await service.overview(lecturer);
    expect(prisma.careLog.count).toHaveBeenNthCalledWith(1, {
      where: { createdAt: FA26_RANGE, student: LECTURER_SCOPE },
    });
    expect(prisma.careLog.count).toHaveBeenNthCalledWith(2, {
      where: {
        createdAt: {
          gte: new Date('2026-09-14T00:00:00.000Z'),
          lte: FA26.endDate,
        },
        student: LECTURER_SCOPE,
      },
    });
  });

  it('chọn kỳ khác → số liệu theo kỳ đó, badge điểm danh vẫn theo kỳ hiện tại', async () => {
    const { service, prisma } = setup();
    const result = await service.overview(lecturer, 'SU26');
    expect(result.term).toEqual(SU26);
    expect(prisma.term.findUnique).toHaveBeenCalledWith({
      where: { code: 'SU26' },
      select: { code: true, name: true, startDate: true, endDate: true },
    });
    expect(prisma.alert.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ term: 'FA26' }) as unknown,
      }),
    );
  });

  it('kỳ không tồn tại → 404', async () => {
    const { service, prisma } = setup();
    prisma.term.findUnique.mockResolvedValueOnce(null);
    await expect(service.overview(lecturer, 'XX99')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('chưa cấu hình học kỳ nào → trả 0, không query số liệu', async () => {
    const { service, prisma } = setup(null);
    const result = await service.overview(lecturer);
    expect(result).toMatchObject({
      term: null,
      totalStudents: 0,
      warnedStudents: 0,
      careLogsInTerm: 0,
      attendancePending: 0,
    });
    expect(prisma.student.count).not.toHaveBeenCalled();
    expect(prisma.alert.count).not.toHaveBeenCalled();
  });
});
