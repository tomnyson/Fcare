import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TermsService } from '../master-data/terms.service';
import { CareStaffLogsService } from './care-staff-logs.service';

function makeUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'me',
    staffCode: 'ME',
    fullName: 'Tôi',
    roles: ['ADMIN'],
    departmentId: 'dept-se',
    consented: true,
    mustChangePassword: false,
    ...overrides,
  };
}

const FA26 = {
  code: 'FA26',
  name: 'Fall 2026',
  startDate: new Date('2026-09-01T00:00:00.000Z'),
  endDate: new Date('2026-12-31T23:59:59.999Z'),
};
const FA26_RANGE = { gte: FA26.startDate, lte: FA26.endDate };
const STAFF = { id: 'gv-a', staffCode: 'GVA', fullName: 'Giảng viên A' };
const LOG = { id: 'log-1', content: 'Đã gọi điện', createdAt: new Date() };

function setup(currentTerm: typeof FA26 | null = FA26) {
  const prisma = {
    staff: { findUnique: jest.fn().mockResolvedValue(STAFF) },
    term: { findUnique: jest.fn().mockResolvedValue(FA26) },
    careLog: {
      findMany: jest.fn().mockResolvedValue([LOG]),
      count: jest.fn().mockResolvedValue(3),
      groupBy: jest
        .fn()
        .mockResolvedValue([{ studentId: 'sv-1' }, { studentId: 'sv-2' }]),
    },
  };
  const terms = { getCurrentTerm: jest.fn().mockResolvedValue(currentTerm) };
  const service = new CareStaffLogsService(
    prisma as unknown as PrismaService,
    terms as unknown as TermsService,
  );
  return { prisma, terms, service };
}

describe('CareStaffLogsService.list — lượt chăm sóc của một người trong kỳ', () => {
  it('giảng viên thuần không xem được nhật ký của đồng nghiệp', async () => {
    const { service, prisma } = setup();
    await expect(
      service.list(makeUser({ roles: ['LECTURER'] }), 'gv-a', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.careLog.findMany).not.toHaveBeenCalled();
  });

  it('người chăm sóc không tồn tại → 404', async () => {
    const { service, prisma } = setup();
    prisma.staff.findUnique.mockResolvedValueOnce(null);
    await expect(service.list(makeUser({}), 'gv-x', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('cùng khung kỳ + phạm vi SV với bảng chăm sóc, phân trang, mới nhất trước', async () => {
    const { service, prisma } = setup();
    const result = await service.list(makeUser({}), 'gv-a', {
      page: 2,
      limit: 10,
    });

    const where = { staffId: 'gv-a', createdAt: FA26_RANGE, student: {} };
    expect(prisma.careLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.careLog.count).toHaveBeenCalledWith({ where });
    expect(prisma.careLog.groupBy).toHaveBeenCalledWith({
      by: ['studentId'],
      where,
    });
    expect(result).toEqual({
      staff: STAFF,
      term: FA26,
      caredStudents: 2,
      items: [LOG],
      meta: { total: 3, page: 2, limit: 10 },
    });
  });

  it('SV kèm theo chỉ gồm mã, tên, lớp — không PII', async () => {
    const { service, prisma } = setup();
    await service.list(makeUser({}), 'gv-a', {});
    const [args] = prisma.careLog.findMany.mock.calls[0] as [
      { include: { student: { select: Record<string, boolean> } } },
    ];
    expect(Object.keys(args.include.student.select).sort()).toEqual(
      ['classCode', 'fullName', 'id', 'studentCode'].sort(),
    );
  });

  it('TBM chỉ thấy nhật ký về SV trong phạm vi của mình', async () => {
    const { service, prisma } = setup();
    await service.list(
      makeUser({ id: 'tbm', roles: ['HEAD_OF_DEPT'] }),
      'gv-a',
      {},
    );
    expect(prisma.careLog.count).toHaveBeenCalledWith({
      where: {
        staffId: 'gv-a',
        createdAt: FA26_RANGE,
        student: {
          AND: [
            {
              OR: [
                { departmentId: 'dept-se' },
                {
                  enrollments: {
                    some: { classSection: { lecturerId: 'tbm' } },
                  },
                },
              ],
            },
          ],
        },
      },
    });
  });

  it('chọn kỳ khác → khung thời gian của kỳ đó', async () => {
    const { service, prisma } = setup();
    await service.list(makeUser({}), 'gv-a', { term: 'SU26' });
    expect(prisma.term.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'SU26' } }),
    );
  });

  it('chưa cấu hình học kỳ → danh sách rỗng, không query nhật ký', async () => {
    const { service, prisma } = setup(null);
    const result = await service.list(makeUser({}), 'gv-a', {});
    expect(result).toEqual({
      staff: STAFF,
      term: null,
      caredStudents: 0,
      items: [],
      meta: { total: 0, page: 1, limit: 20 },
    });
    expect(prisma.careLog.findMany).not.toHaveBeenCalled();
  });
});
