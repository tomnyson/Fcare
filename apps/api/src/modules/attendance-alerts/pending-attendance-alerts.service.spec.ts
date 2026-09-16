import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import { PendingAttendanceAlertsService } from './pending-attendance-alerts.service';

const notContaining = (value: unknown): unknown =>
  expect.not.objectContaining(value);

const lecturer: AuthUser = {
  id: 'gv-chi',
  staffCode: 'GV1',
  fullName: 'Chi',
  roles: ['LECTURER'],
  departmentId: 'dept-se',
  consented: true,
  mustChangePassword: false,
};

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1',
    level: 3,
    status: 'OPEN',
    reason: 'Vắng 3 buổi',
    absentSessions: 3,
    ownerCaredAt: null,
    createdAt: new Date('2026-09-10T00:00:00Z'),
    student: {
      id: 'sv-1',
      studentCode: 'SE1',
      fullName: 'An',
      classCode: 'SE1801',
    },
    classSection: {
      id: 'sec-a',
      code: 'SE101-A',
      lecturerId: 'gv-chi',
      subject: { name: 'Lập trình' },
      lecturer: { fullName: 'Chi' },
    },
    _count: { careLogs: 0 },
    ...overrides,
  };
}

function setup(rows = [alertRow()]) {
  const prisma = {
    alert: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
    $transaction: (promises: unknown[]) => Promise.all(promises),
  };
  return {
    prisma,
    service: new PendingAttendanceAlertsService(
      prisma as unknown as PrismaService,
    ),
  };
}

describe('PendingAttendanceAlertsService.list', () => {
  it('mặc định chỉ lấy cảnh báo ở lớp mình đứng lớp mà mình chưa chăm sóc, trong phạm vi RULE 2', async () => {
    const { service, prisma } = setup();
    const result = await service.list(lecturer, 'FA26', 'owned');
    const expectedWhere = {
      source: 'AUTO_ATTENDANCE',
      term: 'FA26',
      status: { not: 'RESOLVED' },
      student: {
        AND: [
          { enrollments: { some: { classSection: { lecturerId: 'gv-chi' } } } },
        ],
      },
      classSection: { lecturerId: 'gv-chi' },
      ownerCaredAt: null,
    };
    expect(prisma.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        orderBy: [{ level: 'desc' }, { createdAt: 'asc' }],
        take: 100,
      }),
    );
    expect(result).toEqual({
      total: 1,
      ownedTotal: 1,
      items: [
        {
          id: 'alert-1',
          level: 3,
          status: 'OPEN',
          reason: 'Vắng 3 buổi',
          absentSessions: 3,
          ownerCaredAt: null,
          createdAt: new Date('2026-09-10T00:00:00Z'),
          careLogCount: 0,
          isOwner: true,
          student: {
            id: 'sv-1',
            studentCode: 'SE1',
            fullName: 'An',
            classCode: 'SE1801',
          },
          classSection: {
            id: 'sec-a',
            code: 'SE101-A',
            subjectName: 'Lập trình',
            lecturerName: 'Chi',
          },
        },
      ],
    });
  });

  it('scope=all: mọi cảnh báo điểm danh trong phạm vi, isOwner=false ở lớp thầy cô khác, vẫn báo ownedTotal', async () => {
    const { service, prisma } = setup([
      alertRow({
        classSection: {
          id: 'sec-b',
          code: 'SE102-B',
          lecturerId: 'gv-binh',
          subject: { name: 'CSDL' },
          lecturer: { fullName: 'Bình' },
        },
      }),
    ]);
    prisma.alert.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    const result = await service.list(lecturer, 'FA26', 'all');
    expect(prisma.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: notContaining({ ownerCaredAt: null }),
      }),
    );
    expect(result.items[0].isOwner).toBe(false);
    expect(result.total).toBe(5);
    expect(result.ownedTotal).toBe(2);
  });

  it('GV đứng lớp đã chăm sóc → không còn là owner (hết hiện liên tục)', async () => {
    const { service } = setup([
      alertRow({
        ownerCaredAt: new Date('2026-09-11T00:00:00Z'),
        _count: { careLogs: 1 },
      }),
    ]);
    const result = await service.list(lecturer, 'FA26', 'all');
    expect(result.items[0]).toMatchObject({ isOwner: false, careLogCount: 1 });
  });

  it('không lộ dữ liệu ngoài họ tên/mã (RULE 1): select không có email/điện thoại', async () => {
    const { service, prisma } = setup();
    await service.list(lecturer, 'FA26', 'owned');
    const [args] = prisma.alert.findMany.mock.calls[0] as [
      { select: { student: { select: Record<string, boolean> } } },
    ];
    expect(Object.keys(args.select.student.select).sort()).toEqual([
      'classCode',
      'fullName',
      'id',
      'studentCode',
    ]);
  });
});
