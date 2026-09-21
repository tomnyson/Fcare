import type { AuthUser } from '../types/auth-user';
import {
  deptFilter,
  isDeptScoped,
  isStudentInScope,
  lecturerStatsScope,
  sectionScope,
  seesWholeDepartment,
  statsSectionScope,
  statsStudentScope,
  studentScope,
} from './dept-scope';

function makeUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'staff-1',
    staffCode: 'gv.test',
    fullName: 'Test',
    roles: ['LECTURER'],
    departmentId: 'dept-se',
    consented: true,
    mustChangePassword: false,
    ...overrides,
  };
}

describe('deptFilter', () => {
  it('giảng viên bị giới hạn theo bộ môn của mình', () => {
    const user = makeUser({ roles: ['LECTURER'] });
    expect(isDeptScoped(user)).toBe(true);
    expect(deptFilter(user)).toEqual({ departmentId: 'dept-se' });
  });

  it('trưởng bộ môn bị giới hạn theo bộ môn của mình', () => {
    const user = makeUser({ roles: ['HEAD_OF_DEPT'] });
    expect(deptFilter(user)).toEqual({ departmentId: 'dept-se' });
  });

  it('cán bộ đào tạo, CTSV và admin thấy toàn trường', () => {
    for (const role of [
      'ADMIN',
      'TRAINING_OFFICER',
      'SA_OFFICER',
      'SA_HEAD',
    ] as const) {
      const user = makeUser({ roles: [role] });
      expect(isDeptScoped(user)).toBe(false);
      expect(deptFilter(user)).toEqual({});
    }
  });

  it('giảng viên không có bộ môn thì không thấy sinh viên nào', () => {
    const user = makeUser({ roles: ['LECTURER'], departmentId: null });
    expect(deptFilter(user)).toEqual({ departmentId: '__no_department__' });
  });
});

describe('seesWholeDepartment', () => {
  it('chỉ trưởng bộ môn mới thấy trọn bộ môn của mình', () => {
    expect(seesWholeDepartment(makeUser({ roles: ['HEAD_OF_DEPT'] }))).toBe(
      true,
    );
    expect(seesWholeDepartment(makeUser({ roles: ['LECTURER'] }))).toBe(false);
    // Vai trò toàn trường không đi qua nhánh bộ môn nên trả false.
    expect(seesWholeDepartment(makeUser({ roles: ['ADMIN'] }))).toBe(false);
  });
});

/**
 * Giảng viên CHỈ được xem sinh viên của các lớp mình đứng lớp — kể cả sinh viên
 * cùng bộ môn nhưng mình không dạy cũng không được thấy. Trưởng bộ môn vẫn quản
 * cả bộ môn, cộng thêm lớp dạy chéo bộ môn khác.
 */
describe('studentScope', () => {
  const teaching = {
    enrollments: { some: { classSection: { lecturerId: 'staff-1' } } },
  };

  it('giảng viên CHỈ thấy sinh viên lớp mình dạy, không mở theo bộ môn', () => {
    expect(studentScope(makeUser({ roles: ['LECTURER'] }))).toEqual({
      AND: [teaching],
    });
  });

  it('trưởng bộ môn thấy sinh viên bộ môn mình HOẶC lớp mình dạy', () => {
    expect(studentScope(makeUser({ roles: ['HEAD_OF_DEPT'] }))).toEqual({
      AND: [{ OR: [{ departmentId: 'dept-se' }, teaching] }],
    });
  });

  it('vai trò toàn trường không bị giới hạn', () => {
    expect(studentScope(makeUser({ roles: ['ADMIN'] }))).toEqual({});
  });

  it('giảng viên chưa có bộ môn vẫn thấy sinh viên lớp mình dạy', () => {
    expect(
      studentScope(makeUser({ roles: ['LECTURER'], departmentId: null })),
    ).toEqual({ AND: [teaching] });
  });

  it('trưởng bộ môn chưa có bộ môn thì chỉ còn lớp mình dạy', () => {
    expect(
      studentScope(makeUser({ roles: ['HEAD_OF_DEPT'], departmentId: null })),
    ).toEqual({
      AND: [{ OR: [{ departmentId: '__no_department__' }, teaching] }],
    });
  });

  it('bọc trong AND để nơi gọi spread cạnh OR khác mà không nuốt mất scope', () => {
    const where = {
      ...studentScope(makeUser({ roles: ['LECTURER'] })),
      OR: [{ fullName: { contains: 'nguyen' } }],
    };
    expect(where.AND).toHaveLength(1);
    expect(where.OR).toHaveLength(1);
  });
});

describe('sectionScope', () => {
  it('giảng viên chỉ thấy lớp mình đứng tên dạy', () => {
    expect(sectionScope(makeUser({ roles: ['LECTURER'] }))).toEqual({
      AND: [{ lecturerId: 'staff-1' }],
    });
  });

  it('trưởng bộ môn thấy lớp của bộ môn mình HOẶC lớp mình dạy', () => {
    expect(sectionScope(makeUser({ roles: ['HEAD_OF_DEPT'] }))).toEqual({
      AND: [
        {
          OR: [
            { subject: { departmentId: 'dept-se' } },
            { lecturerId: 'staff-1' },
          ],
        },
      ],
    });
  });

  it('vai trò toàn trường không bị giới hạn', () => {
    expect(sectionScope(makeUser({ roles: ['TRAINING_OFFICER'] }))).toEqual({});
  });
});

describe('isStudentInScope', () => {
  function makePrisma(count: number) {
    const student = { count: jest.fn().mockResolvedValue(count) };
    return { prisma: { student }, count: student.count };
  }

  it('vai trò toàn trường luôn trong phạm vi, không cần truy vấn', async () => {
    const { prisma, count } = makePrisma(0);
    await expect(
      isStudentInScope(prisma, makeUser({ roles: ['ADMIN'] }), 'sv-1'),
    ).resolves.toBe(true);
    expect(count).not.toHaveBeenCalled();
  });

  it('đếm theo đúng id sinh viên kèm scope', async () => {
    const { prisma, count } = makePrisma(1);
    await expect(
      isStudentInScope(prisma, makeUser({ roles: ['LECTURER'] }), 'sv-1'),
    ).resolves.toBe(true);
    expect(count).toHaveBeenCalledWith({
      where: {
        id: 'sv-1',
        ...studentScope(makeUser({ roles: ['LECTURER'] })),
      },
    });
  });

  it('không khớp bản ghi nào → ngoài phạm vi', async () => {
    const { prisma } = makePrisma(0);
    await expect(
      isStudentInScope(prisma, makeUser({ roles: ['LECTURER'] }), 'sv-1'),
    ).resolves.toBe(false);
  });
});

describe('lecturerStatsScope', () => {
  it('giảng viên thuần chỉ thấy đúng dòng của chính mình', () => {
    expect(lecturerStatsScope(makeUser({ roles: ['LECTURER'] }))).toEqual({
      id: 'staff-1',
    });
  });

  it('trưởng bộ môn thấy giảng viên bộ môn mình', () => {
    expect(lecturerStatsScope(makeUser({ roles: ['HEAD_OF_DEPT'] }))).toEqual({
      departmentId: 'dept-se',
    });
  });

  it('trưởng bộ môn chưa gán bộ môn thì không thấy ai', () => {
    expect(
      lecturerStatsScope(
        makeUser({ roles: ['HEAD_OF_DEPT'], departmentId: null }),
      ),
    ).toEqual({ departmentId: '__no_department__' });
  });

  it('vai trò toàn trường thấy tất cả', () => {
    for (const role of [
      'ADMIN',
      'TRAINING_OFFICER',
      'SA_OFFICER',
      'SA_HEAD',
    ] as const) {
      expect(lecturerStatsScope(makeUser({ roles: [role] }))).toEqual({});
    }
  });

  it('giảng viên kiêm trưởng bộ môn được tính theo vai rộng hơn', () => {
    expect(
      lecturerStatsScope(makeUser({ roles: ['LECTURER', 'HEAD_OF_DEPT'] })),
    ).toEqual({ departmentId: 'dept-se' });
  });
});

describe('statsStudentScope / statsSectionScope — thống kê của giảng viên chỉ trong bộ môn mình', () => {
  const ownSections = {
    lecturerId: 'staff-1',
    subject: { departmentId: 'dept-se' },
  };

  it('giảng viên: SV học lớp mình dạy của môn thuộc bộ môn mình (không xét bộ môn của SV)', () => {
    expect(statsStudentScope(makeUser({ roles: ['LECTURER'] }))).toEqual({
      AND: [{ enrollments: { some: { classSection: ownSections } } }],
    });
  });

  it('giảng viên: lớp mình dạy của môn thuộc bộ môn mình', () => {
    expect(statsSectionScope(makeUser({ roles: ['LECTURER'] }))).toEqual({
      AND: [ownSections],
    });
  });

  it('giảng viên chưa có bộ môn thì không thấy gì', () => {
    const user = makeUser({ roles: ['LECTURER'], departmentId: null });
    expect(statsSectionScope(user)).toEqual({
      AND: [
        {
          lecturerId: 'staff-1',
          subject: { departmentId: '__no_department__' },
        },
      ],
    });
  });

  it('trưởng bộ môn và vai trò toàn trường giữ nguyên phạm vi thường', () => {
    for (const roles of [['HEAD_OF_DEPT'], ['ADMIN']] as AuthUser['roles'][]) {
      const user = makeUser({ roles });
      expect(statsStudentScope(user)).toEqual(studentScope(user));
      expect(statsSectionScope(user)).toEqual(sectionScope(user));
    }
  });
});
