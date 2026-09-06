import type { AuthUser } from '../../../common/types/auth-user';
import type { PrismaService } from '../../../prisma/prisma.service';
import { SubjectStatsService } from './subject-stats.service';

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

/** Hai lớp học phần của cùng môn PRF192 — số liệu phải cộng dồn về một dòng. */
const SECTIONS = [
  {
    id: 'cs-1',
    subject: {
      id: 'sub-1',
      code: 'PRF192',
      name: 'Lập trình cơ bản',
      credits: 3,
      department: { code: 'SE', name: 'Kỹ thuật phần mềm' },
    },
  },
  {
    id: 'cs-2',
    subject: {
      id: 'sub-1',
      code: 'PRF192',
      name: 'Lập trình cơ bản',
      credits: 3,
      department: { code: 'SE', name: 'Kỹ thuật phần mềm' },
    },
  },
];

interface SectionWhereArgs {
  where: { term?: string };
}

interface GroupByWhereArgs {
  where: { classSection: unknown };
}

function setup() {
  const sectionFindMany = jest.fn().mockResolvedValue(SECTIONS);
  const enrollmentGroupBy = jest.fn();
  // 1: kết quả theo lớp · 2: cấm thi · 3: điểm trung bình
  enrollmentGroupBy
    .mockResolvedValueOnce([
      { classSectionId: 'cs-1', result: 'PASS', _count: { _all: 8 } },
      { classSectionId: 'cs-1', result: 'FAIL', _count: { _all: 2 } },
      { classSectionId: 'cs-2', result: 'PASS', _count: { _all: 6 } },
      { classSectionId: 'cs-2', result: 'IN_PROGRESS', _count: { _all: 4 } },
    ])
    .mockResolvedValueOnce([{ classSectionId: 'cs-1', _count: { _all: 1 } }])
    .mockResolvedValueOnce([
      {
        classSectionId: 'cs-1',
        _avg: { totalScore: 7 },
        _count: { totalScore: 10 },
      },
      {
        classSectionId: 'cs-2',
        _avg: { totalScore: 8 },
        _count: { totalScore: 10 },
      },
    ]);
  const prisma = {
    classSection: { findMany: sectionFindMany },
    enrollment: { groupBy: enrollmentGroupBy },
  } as unknown as PrismaService;
  return {
    service: new SubjectStatsService(prisma),
    sectionFindMany,
    enrollmentGroupBy,
  };
}

describe('SubjectStatsService.list', () => {
  it('cộng dồn nhiều lớp học phần về một dòng môn học', async () => {
    const { service } = setup();
    const [row] = await service.list(adminUser);
    expect(row).toMatchObject({
      code: 'PRF192',
      sectionCount: 2,
      total: 20,
      pass: 14,
      fail: 2,
      inProgress: 4,
      examBanned: 1,
    });
  });

  it('tỷ lệ đạt chỉ tính trên số đã có kết quả, không tính đang học', async () => {
    const { service } = setup();
    const [row] = await service.list(adminUser);
    // 14 đạt / (14 đạt + 2 trượt) = 87.5%
    expect(row.passRate).toBe(87.5);
  });

  it('điểm trung bình là bình quân có trọng số theo số bài có điểm', async () => {
    const { service } = setup();
    const [row] = await service.list(adminUser);
    // (7*10 + 8*10) / 20 = 7.5
    expect(row.avgScore).toBe(7.5);
  });

  it('RULE 2: mọi truy vấn đều mang phạm vi lớp học phần của người xem', async () => {
    const { service, sectionFindMany, enrollmentGroupBy } = setup();
    await service.list(lecturerUser, 'SU25');
    const scoped = { term: 'SU25', AND: [{ lecturerId: 'gv-1' }] };
    const [sectionArgs] = sectionFindMany.mock.calls[0] as [SectionWhereArgs];
    expect(sectionArgs.where).toEqual(scoped);
    for (const call of enrollmentGroupBy.mock.calls as [GroupByWhereArgs][]) {
      expect(call[0].where.classSection).toEqual(scoped);
    }
  });

  it('không lọc kỳ thì term là undefined chứ không phải chuỗi rỗng', async () => {
    const { service, sectionFindMany } = setup();
    await service.list(adminUser);
    const [sectionArgs] = sectionFindMany.mock.calls[0] as [SectionWhereArgs];
    expect(sectionArgs.where.term).toBeUndefined();
  });
});
