/* eslint-disable @typescript-eslint/unbound-method */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import { StudentAnalysisSourceService } from './student-analysis-source.service';

const adminUser = {
  id: 'admin-1',
  roles: ['ADMIN'],
  departmentId: null,
} as AuthUser;

const lecturerUser = {
  id: 'lecturer-1',
  roles: ['LECTURER'],
  departmentId: 'dept-1',
} as AuthUser;

function makeService() {
  const prisma = {
    student: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    classSection: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;

  return {
    prisma,
    service: new StudentAnalysisSourceService(prisma),
  };
}

describe('StudentAnalysisSourceService.assertCanInitiate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cho phep admin bo qua kiem tra phan cong giang day', async () => {
    const { prisma, service } = makeService();
    const studentFindFirst = prisma.student.findFirst as jest.Mock;
    const classSectionFindFirst = prisma.classSection.findFirst as jest.Mock;
    studentFindFirst.mockResolvedValue({ id: 'student-1' });

    await service.assertCanInitiate(adminUser, 'student-1', '2025A');

    expect(classSectionFindFirst).not.toHaveBeenCalled();
  });

  it('tu choi giang vien khong day sinh vien trong hoc ky duoc chon', async () => {
    const { prisma, service } = makeService();
    const studentFindFirst = prisma.student.findFirst as jest.Mock;
    const classSectionFindFirst = prisma.classSection.findFirst as jest.Mock;
    studentFindFirst.mockResolvedValue({ id: 'student-1' });
    classSectionFindFirst.mockResolvedValue(null);

    await expect(
      service.assertCanInitiate(lecturerUser, 'student-1', '2025A'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('nem NotFound khi sinh vien nam ngoai pham vi quan ly', async () => {
    const { prisma, service } = makeService();
    const studentFindFirst = prisma.student.findFirst as jest.Mock;
    studentFindFirst.mockResolvedValue(null);

    await expect(
      service.assertCanInitiate(lecturerUser, 'student-404', '2025A'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('StudentAnalysisSourceService.buildSnapshot', () => {
  beforeEach(() => jest.clearAllMocks());

  it('redact note va tao hash on dinh tu snapshot', async () => {
    const { prisma, service } = makeService();
    const studentFindUnique = prisma.student.findUnique as jest.Mock;
    studentFindUnique.mockResolvedValue({
      studentCode: 'SV001',
      fullName: 'Nguyen Van A',
      enrollments: [
        {
          attendanceRate: 0.8,
          midtermScore: 6,
          finalScore: 7,
          totalScore: 6.7,
          isExamBanned: false,
          result: 'PASS',
          updatedAt: new Date('2026-08-24T00:00:00.000Z'),
          classSection: {
            term: '2025A',
            subject: { code: 'INT101', name: 'Nhap mon' },
            lecturer: {
              fullName: 'Tran Thi B',
              staffCode: 'GV001',
              username: 'ttb',
            },
          },
        },
      ],
      evaluations: [
        {
          term: '2025A',
          academicScore: 7,
          attitudeScore: 8,
          absentSessions: 1,
          criteria: [{ criterion: 'P_PART_TIME_JOB' }],
          note: 'Nguyen Van A lien he qua email sv001@example.edu',
          updatedAt: new Date('2026-08-24T00:00:00.000Z'),
          lecturer: {
            fullName: 'Tran Thi B',
            staffCode: 'GV001',
            username: 'ttb',
          },
        },
      ],
      careLogs: [],
    });

    const first = await service.buildSnapshot('student-1', '2025A');
    const second = await service.buildSnapshot('student-1', '2025A');

    expect(first.snapshot.evaluations[0]?.note).toContain('[ĐÃ ẨN]');
    expect(first.snapshot.evaluations[0]?.note).not.toContain('Nguyen Van A');
    expect(first.snapshot.evaluations[0]?.note).not.toContain(
      'sv001@example.edu',
    );
    expect(first.hash).toBe(second.hash);
  });

  it('them limitation khi hoc ky trong tam khong co hoc phan', async () => {
    const { prisma, service } = makeService();
    const studentFindUnique = prisma.student.findUnique as jest.Mock;
    studentFindUnique.mockResolvedValue({
      studentCode: 'SV001',
      fullName: 'Nguyen Van A',
      enrollments: [],
      evaluations: [
        {
          term: '2025A',
          academicScore: 7,
          attitudeScore: 8,
          absentSessions: 1,
          criteria: [{ criterion: 'P_PART_TIME_JOB' }],
          note: 'dia chi: 12 Nguyen Hue',
          updatedAt: new Date('2026-08-24T00:00:00.000Z'),
          lecturer: {
            fullName: 'Tran Thi B',
            staffCode: 'GV001',
            username: 'ttb',
          },
        },
      ],
      careLogs: [],
    });

    const result = await service.buildSnapshot('student-1', '2025A');

    expect(result.snapshot.limitations).toContain(
      'Không có dữ liệu học phần cho học kỳ trọng tâm.',
    );
  });
});
