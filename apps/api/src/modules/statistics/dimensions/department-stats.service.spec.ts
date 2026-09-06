import { StudentStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/types/auth-user';
import type { PrismaService } from '../../../prisma/prisma.service';
import { DepartmentStatsService } from './department-stats.service';

const TEACHING = {
  enrollments: { some: { classSection: { lecturerId: 'staff-1' } } },
};

function makeUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'staff-1',
    roles: ['LECTURER'],
    departmentId: 'dept-1',
    ...overrides,
  } as AuthUser;
}

interface Handles {
  service: DepartmentStatsService;
  departmentFindMany: jest.Mock;
  studentGroupBy: jest.Mock;
  alertFindMany: jest.Mock;
}

/** Hai bộ môn: "dept-1" là bộ môn của người dùng, "dept-2" là nơi dạy chéo. */
function setup(): Handles {
  const departmentFindMany = jest.fn().mockResolvedValue([
    {
      id: 'dept-1',
      code: 'SE',
      name: 'Kỹ thuật phần mềm',
      _count: { staff: 9 },
    },
    {
      id: 'dept-2',
      code: 'IA',
      name: 'An toàn thông tin',
      _count: { staff: 4 },
    },
  ]);
  const studentGroupBy = jest.fn().mockResolvedValue([
    {
      departmentId: 'dept-1',
      status: StudentStatus.STUDYING,
      _count: { _all: 3 },
    },
    {
      departmentId: 'dept-2',
      status: StudentStatus.STUDYING,
      _count: { _all: 2 },
    },
  ]);
  const alertFindMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    department: { findMany: departmentFindMany },
    student: { groupBy: studentGroupBy },
    alert: { findMany: alertFindMany },
  } as unknown as PrismaService;
  return {
    service: new DepartmentStatsService(prisma),
    departmentFindMany,
    studentGroupBy,
    alertFindMany,
  };
}

interface WhereArgs {
  where?: { OR?: unknown[] };
}

describe('DepartmentStatsService.list', () => {
  it('RULE 2: giảng viên chỉ đếm sinh viên mình dạy và không thấy tổng nhân sự', async () => {
    const { service, departmentFindMany, studentGroupBy } = setup();

    const rows = await service.list(makeUser({}));

    // Bộ môn hiện ra là bộ môn CÓ sinh viên trong phạm vi — không tự thêm bộ môn mình.
    const [deptArgs] = departmentFindMany.mock.calls[0] as [WhereArgs];
    expect(deptArgs.where?.OR).toEqual([
      { students: { some: { AND: [TEACHING] } } },
    ]);
    const [groupArgs] = studentGroupBy.mock.calls[0] as [
      { where: { AND?: unknown[] } },
    ];
    expect(groupArgs.where.AND).toEqual([TEACHING]);
    // Sĩ số lấy từ groupBy đã scope, KHÔNG phải _count thô của bộ môn.
    expect(rows.map((row) => row.totalStudents)).toEqual([3, 2]);
    expect(rows.map((row) => row.totalStaff)).toEqual([null, null]);
  });

  it('trưởng bộ môn thấy tổng nhân sự của bộ môn MÌNH, bộ môn dạy chéo thì không', async () => {
    const { service, departmentFindMany } = setup();

    const rows = await service.list(makeUser({ roles: ['HEAD_OF_DEPT'] }));

    const [deptArgs] = departmentFindMany.mock.calls[0] as [WhereArgs];
    expect(deptArgs.where?.OR).toEqual([
      {
        students: {
          some: { AND: [{ OR: [{ departmentId: 'dept-1' }, TEACHING] }] },
        },
      },
      { id: 'dept-1' },
    ]);
    expect(rows.map((row) => row.totalStaff)).toEqual([9, null]);
  });

  it('vai trò toàn trường thấy mọi bộ môn kèm tổng nhân sự', async () => {
    const { service, departmentFindMany } = setup();

    const rows = await service.list(makeUser({ roles: ['ADMIN'] }));

    const [deptArgs] = departmentFindMany.mock.calls[0] as [WhereArgs];
    expect(deptArgs.where).toEqual({});
    expect(rows.map((row) => row.totalStaff)).toEqual([9, 4]);
  });
});
