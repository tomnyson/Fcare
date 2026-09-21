import type { AuthUser } from '../../../common/types/auth-user';
import type { PrismaService } from '../../../prisma/prisma.service';
import { ClassStatsService } from './class-stats.service';

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

const headUser = {
  id: 'gv-1',
  staffCode: 'GV1',
  fullName: 'Trưởng bộ môn',
  roles: ['HEAD_OF_DEPT'],
  departmentId: 'dept-1',
  consented: true,
  mustChangePassword: false,
} as AuthUser;

/** Hai lớp học phần: `cs-1` đã có kết quả, `cs-2` còn đang học hết. */
const SECTIONS = [
  {
    id: 'cs-1',
    code: 'PRF192-SE1701',
    term: 'SU25',
    subject: { code: 'PRF192', name: 'Lập trình cơ bản' },
    lecturer: { staffCode: 'GV1', fullName: 'Trần Minh Hoạt' },
    _count: { enrollments: 12 },
  },
  {
    id: 'cs-2',
    code: 'MAE101-SE1702',
    term: 'SU25',
    subject: { code: 'MAE101', name: 'Toán rời rạc' },
    lecturer: null,
    _count: { enrollments: 5 },
  },
];

interface SectionWhereArgs {
  where: { term?: string; block?: number };
}

interface GroupByWhereArgs {
  where: { classSection: unknown };
}

function setup() {
  const sectionFindMany = jest.fn().mockResolvedValue(SECTIONS);
  const enrollmentGroupBy = jest.fn();
  // 1: kết quả theo lớp · 2: cấm thi
  enrollmentGroupBy
    .mockResolvedValueOnce([
      { classSectionId: 'cs-1', result: 'PASS', _count: { _all: 9 } },
      { classSectionId: 'cs-1', result: 'FAIL', _count: { _all: 3 } },
      { classSectionId: 'cs-2', result: 'IN_PROGRESS', _count: { _all: 5 } },
    ])
    .mockResolvedValueOnce([{ classSectionId: 'cs-1', _count: { _all: 2 } }]);
  const prisma = {
    classSection: { findMany: sectionFindMany },
    enrollment: { groupBy: enrollmentGroupBy },
  } as unknown as PrismaService;
  return {
    service: new ClassStatsService(prisma),
    sectionFindMany,
    enrollmentGroupBy,
  };
}

describe('ClassStatsService.list', () => {
  it('gộp đạt / trượt / đang học / cấm thi về đúng dòng lớp học phần', async () => {
    const { service } = setup();
    const [first, second] = await service.list(adminUser);
    expect(first).toMatchObject({
      id: 'cs-1',
      code: 'PRF192-SE1701',
      term: 'SU25',
      subject: { code: 'PRF192', name: 'Lập trình cơ bản' },
      lecturer: { staffCode: 'GV1', fullName: 'Trần Minh Hoạt' },
      total: 12,
      pass: 9,
      fail: 3,
      inProgress: 0,
      examBanned: 2,
    });
    expect(second).toMatchObject({
      id: 'cs-2',
      lecturer: null,
      total: 5,
      pass: 0,
      fail: 0,
      inProgress: 5,
      examBanned: 0,
    });
  });

  it('tỷ lệ đạt tính trên số đã có kết quả, chưa có kết quả thì null', async () => {
    const { service } = setup();
    const [first, second] = await service.list(adminUser);
    // 9 đạt / (9 đạt + 3 trượt) = 75%
    expect(first.passRate).toBe(75);
    expect(second.passRate).toBeNull();
  });

  it('RULE 2: giảng viên thuần chỉ truy vấn lớp mình đứng lớp', async () => {
    const { service, sectionFindMany, enrollmentGroupBy } = setup();
    await service.list(lecturerUser, 'SU25');
    // Giảng viên chỉ thống kê lớp mình dạy CỦA bộ môn mình .
    const scoped = {
      term: 'SU25',
      AND: [{ lecturerId: 'gv-1', subject: { departmentId: 'dept-1' } }],
    };
    const [sectionArgs] = sectionFindMany.mock.calls[0] as [SectionWhereArgs];
    expect(sectionArgs.where).toEqual(scoped);
    for (const call of enrollmentGroupBy.mock.calls as [GroupByWhereArgs][]) {
      expect(call[0].where.classSection).toEqual(scoped);
    }
  });

  it('RULE 2: trưởng bộ môn thấy thêm lớp của môn thuộc bộ môn mình', async () => {
    const { service, sectionFindMany, enrollmentGroupBy } = setup();
    await service.list(headUser, 'SU25');
    const scoped = {
      term: 'SU25',
      AND: [
        {
          OR: [{ subject: { departmentId: 'dept-1' } }, { lecturerId: 'gv-1' }],
        },
      ],
    };
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
    expect(sectionArgs.where).not.toHaveProperty('block');
  });

  it('lọc theo block (1|2) cộng với kỳ — áp cho cả sĩ số lẫn kết quả', async () => {
    const { service, sectionFindMany, enrollmentGroupBy } = setup();
    await service.list(adminUser, 'SU25', 2);
    const [sectionArgs] = sectionFindMany.mock.calls[0] as [SectionWhereArgs];
    expect(sectionArgs.where).toEqual({ term: 'SU25', block: 2 });
    for (const call of enrollmentGroupBy.mock.calls as [GroupByWhereArgs][]) {
      expect(call[0].where.classSection).toEqual({ term: 'SU25', block: 2 });
    }
  });
});
