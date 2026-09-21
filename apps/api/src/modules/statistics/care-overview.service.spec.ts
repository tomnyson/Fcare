import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TermsService } from '../master-data/terms.service';
import {
  buildCareOverview,
  CareOverviewService,
} from './care-overview.service';

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

const DEPARTMENTS = [
  { id: 'dept-se', code: 'SE', name: 'Kỹ thuật phần mềm' },
  { id: 'dept-ia', code: 'IA', name: 'An toàn thông tin' },
];

const STAFF = [
  {
    id: 'gv-a',
    staffCode: 'GVA',
    fullName: 'Giảng viên A',
    departmentId: 'dept-se',
    roles: [{ role: { key: 'LECTURER' } }],
  },
  {
    id: 'gv-b',
    staffCode: 'GVB',
    fullName: 'Giảng viên B',
    departmentId: 'dept-se',
    roles: [{ role: { key: 'LECTURER' } }],
  },
  {
    id: 'ctsv-1',
    staffCode: 'SA1',
    fullName: 'Cán bộ CTSV',
    departmentId: null,
    roles: [{ role: { key: 'SA_OFFICER' } }],
  },
  {
    id: 'gv-off',
    staffCode: 'GVX',
    fullName: 'GV bộ môn đã tắt',
    departmentId: 'dept-off',
    roles: [{ role: { key: 'LECTURER' } }],
  },
];

/** Cặp (người chăm sóc, sinh viên) kèm số lượt trong kỳ. */
const PAIRS = [
  { staffId: 'gv-a', studentId: 'sv-1', _count: { _all: 3 } },
  { staffId: 'gv-a', studentId: 'sv-2', _count: { _all: 1 } },
  { staffId: 'gv-b', studentId: 'sv-1', _count: { _all: 2 } },
  { staffId: 'ctsv-1', studentId: 'sv-3', _count: { _all: 4 } },
  { staffId: 'gv-off', studentId: 'sv-9', _count: { _all: 5 } },
];

function setup(currentTerm: typeof FA26 | null = FA26) {
  const prisma = {
    careLog: { groupBy: jest.fn().mockResolvedValue(PAIRS) },
    staff: { findMany: jest.fn().mockResolvedValue(STAFF) },
    department: { findMany: jest.fn().mockResolvedValue(DEPARTMENTS) },
    alert: {
      groupBy: jest.fn().mockResolvedValue([
        { studentId: 'sv-1', _max: { level: 4 } },
        { studentId: 'sv-2', _max: { level: 2 } },
        { studentId: 'sv-3', _max: { level: 2 } },
      ]),
    },
    term: { findUnique: jest.fn().mockResolvedValue(FA26) },
  };
  const terms = { getCurrentTerm: jest.fn().mockResolvedValue(currentTerm) };
  const service = new CareOverviewService(
    prisma as unknown as PrismaService,
    terms as unknown as TermsService,
  );
  return { prisma, terms, service };
}

describe('CareOverviewService.overview', () => {
  it('giảng viên thuần không xem được bức tranh chăm sóc toàn bộ môn', async () => {
    const { service, prisma } = setup();
    await expect(
      service.overview(makeUser({ roles: ['LECTURER'] })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.careLog.groupBy).not.toHaveBeenCalled();
  });

  it('Admin: gom lượt chăm sóc theo bộ môn của NGƯỜI chăm sóc, đếm SV không trùng', async () => {
    const { service } = setup();
    const result = await service.overview(makeUser({}));

    expect(result.term).toEqual(FA26);
    expect(result.departments).toEqual([
      {
        id: 'dept-se',
        code: 'SE',
        name: 'Kỹ thuật phần mềm',
        careLogs: 6,
        caredStudents: 2,
        lecturers: [
          {
            id: 'gv-a',
            staffCode: 'GVA',
            fullName: 'Giảng viên A',
            careLogs: 4,
            caredStudents: 2,
          },
          {
            id: 'gv-b',
            staffCode: 'GVB',
            fullName: 'Giảng viên B',
            careLogs: 2,
            caredStudents: 1,
          },
        ],
      },
      // Bộ môn không có lượt nào vẫn lên bảng để thấy "chưa chăm sóc".
      {
        id: 'dept-ia',
        code: 'IA',
        name: 'An toàn thông tin',
        careLogs: 0,
        caredStudents: 0,
        lecturers: [],
      },
    ]);
  });

  it('lượt chăm sóc của CTSV tách riêng, không tính vào bộ môn', async () => {
    const { service } = setup();
    const result = await service.overview(makeUser({}));
    expect(result.sa).toEqual({
      careLogs: 4,
      caredStudents: 1,
      staff: [
        {
          id: 'ctsv-1',
          staffCode: 'SA1',
          fullName: 'Cán bộ CTSV',
          careLogs: 4,
          caredStudents: 1,
        },
      ],
    });
  });

  it('SV đang cảnh báo trong kỳ: mỗi SV tính một lần ở mức cao nhất, đủ 4 mức', async () => {
    const { service, prisma } = setup();
    const result = await service.overview(makeUser({}));
    expect(result.warnedByLevel).toEqual([
      { level: 4, students: 1 },
      { level: 3, students: 0 },
      { level: 2, students: 2 },
      { level: 1, students: 0 },
    ]);
    expect(prisma.alert.groupBy).toHaveBeenCalledWith({
      by: ['studentId'],
      _max: { level: true },
      where: {
        AND: [
          { OR: [{ term: 'FA26' }, { term: null, createdAt: FA26_RANGE }] },
          { status: { not: 'RESOLVED' } },
          { student: {} },
        ],
      },
    });
  });

  it('chỉ đếm nhật ký trong khoảng ngày của kỳ, chỉ lấy bộ môn đang bật', async () => {
    const { service, prisma } = setup();
    await service.overview(makeUser({ roles: ['TRAINING_OFFICER'] }));
    expect(prisma.careLog.groupBy).toHaveBeenCalledWith({
      by: ['staffId', 'studentId'],
      _count: { _all: true },
      where: { createdAt: FA26_RANGE, student: {} },
    });
    expect(prisma.department.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  });

  it('Trưởng bộ môn: chỉ SV trong phạm vi và chỉ dòng bộ môn của mình', async () => {
    const { service, prisma } = setup();
    await service.overview(makeUser({ roles: ['HEAD_OF_DEPT'] }));
    const [careArgs] = prisma.careLog.groupBy.mock.calls[0] as [
      { where: { student: unknown } },
    ];
    expect(careArgs.where.student).toEqual({
      AND: [
        {
          OR: [
            { departmentId: 'dept-se' },
            { enrollments: { some: { classSection: { lecturerId: 'me' } } } },
          ],
        },
      ],
    });
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, id: 'dept-se' } }),
    );
  });

  it('kỳ không tồn tại → 404', async () => {
    const { service, prisma } = setup();
    prisma.term.findUnique.mockResolvedValueOnce(null);
    await expect(service.overview(makeUser({}), 'XX99')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('chưa có học kỳ nào → rỗng, không query', async () => {
    const { service, prisma } = setup(null);
    const result = await service.overview(makeUser({}));
    expect(result.term).toBeNull();
    expect(result.departments).toEqual([]);
    expect(result.warnedByLevel.map((row) => row.students)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(prisma.careLog.groupBy).not.toHaveBeenCalled();
  });
});

describe('buildCareOverview', () => {
  it('nhân sự không thuộc bộ môn đang bật và không phải CTSV thì bỏ qua', () => {
    const result = buildCareOverview(PAIRS, STAFF, DEPARTMENTS, []);
    const allLecturers = result.departments.flatMap((d) => d.lecturers);
    expect(allLecturers.map((l) => l.id)).not.toContain('gv-off');
  });
});
