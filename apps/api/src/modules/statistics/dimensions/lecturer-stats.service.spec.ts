import type { AuthUser } from '../../../common/types/auth-user';
import type { PrismaService } from '../../../prisma/prisma.service';
import { LecturerStatsService } from './lecturer-stats.service';

const adminUser = {
  id: 'ad',
  staffCode: 'AD',
  fullName: 'Quản trị',
  roles: ['ADMIN'],
  departmentId: null,
  consented: true,
  mustChangePassword: false,
} as AuthUser;

const lecturerUser = {
  id: 'gv-1',
  staffCode: 'GV1',
  fullName: 'Giảng viên',
  roles: ['LECTURER'],
  departmentId: 'dept-1',
  consented: true,
  mustChangePassword: false,
} as AuthUser;

interface StaffWhereArgs {
  where: { AND: unknown[] };
}

interface EvaluationWhereArgs {
  where: { term?: string; student?: unknown };
}

function setup() {
  const staffFindMany = jest.fn().mockResolvedValue([
    {
      id: 'gv-1',
      staffCode: 'GV1',
      fullName: 'Trần Minh Hoạt',
      department: { code: 'SE', name: 'Kỹ thuật phần mềm' },
    },
  ]);
  const sectionFindMany = jest.fn().mockResolvedValue([
    { id: 'cs-1', lecturerId: 'gv-1' },
    { id: 'cs-2', lecturerId: 'gv-1' },
    { id: 'cs-3', lecturerId: null }, // lớp chưa phân công GV — phải bị bỏ qua
  ]);
  const enrollmentGroupBy = jest.fn();
  enrollmentGroupBy
    .mockResolvedValueOnce([
      { classSectionId: 'cs-1', result: 'PASS', _count: { _all: 9 } },
      { classSectionId: 'cs-2', result: 'FAIL', _count: { _all: 1 } },
      { classSectionId: 'cs-3', result: 'PASS', _count: { _all: 5 } },
    ])
    .mockResolvedValueOnce([{ classSectionId: 'cs-1', _count: { _all: 2 } }]);
  const evaluationGroupBy = jest
    .fn()
    .mockResolvedValue([{ lecturerId: 'gv-1', _count: { _all: 4 } }]);
  const prisma = {
    staff: { findMany: staffFindMany },
    classSection: { findMany: sectionFindMany },
    enrollment: { groupBy: enrollmentGroupBy },
    evaluation: { groupBy: evaluationGroupBy },
  } as unknown as PrismaService;
  return {
    service: new LecturerStatsService(prisma),
    staffFindMany,
    evaluationGroupBy,
  };
}

describe('LecturerStatsService.list', () => {
  it('cộng dồn các lớp của cùng giảng viên', async () => {
    const { service } = setup();
    const [row] = await service.list(adminUser);
    expect(row).toMatchObject({
      staffCode: 'GV1',
      sectionCount: 2,
      total: 10,
      pass: 9,
      fail: 1,
      examBanned: 2,
      passRate: 90,
      evaluationCount: 4,
    });
  });

  it('lớp chưa phân công giảng viên không rơi vào dòng của ai', async () => {
    const { service } = setup();
    const rows = await service.list(adminUser);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(10); // không cộng 5 của cs-3
  });

  it('RULE 2: giảng viên thuần chỉ truy vấn đúng dòng của mình', async () => {
    const { service, staffFindMany } = setup();
    await service.list(lecturerUser);
    const [staffArgs] = staffFindMany.mock.calls[0] as [StaffWhereArgs];
    expect(staffArgs.where.AND).toContainEqual({ id: 'gv-1' });
  });

  it('RULE 2: số đánh giá đã nhập cũng bị chặn theo phạm vi sinh viên', async () => {
    const { service, evaluationGroupBy } = setup();
    await service.list(lecturerUser);
    const [evaluationArgs] = evaluationGroupBy.mock.calls[0] as [
      EvaluationWhereArgs,
    ];
    expect(evaluationArgs.where.student).toEqual({
      AND: [
        {
          enrollments: {
            some: {
              classSection: {
                lecturerId: 'gv-1',
                subject: { departmentId: 'dept-1' },
              },
            },
          },
        },
      ],
    });
  });

  it('lọc kỳ áp cho cả số đánh giá đã nhập', async () => {
    const { service, evaluationGroupBy } = setup();
    await service.list(adminUser, 'SU25');
    const [evaluationArgs] = evaluationGroupBy.mock.calls[0] as [
      EvaluationWhereArgs,
    ];
    expect(evaluationArgs.where.term).toBe('SU25');
  });
});
