import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import { CareStatisticsService } from './care-statistics.service';

const containing = (value: unknown): unknown => expect.objectContaining(value);

const user: AuthUser = {
  id: 'head',
  staffCode: 'H',
  fullName: 'Head',
  roles: ['ADMIN'],
  departmentId: 'dept',
  consented: true,
  mustChangePassword: false,
};
const term = {
  code: 'FA26',
  name: 'Fall 2026',
  startDate: new Date('2026-09-01T00:00:00Z'),
  endDate: new Date('2026-12-31T23:59:59.999Z'),
};
const student = {
  id: 'student',
  studentCode: 'SV1',
  fullName: 'Student',
  classCode: 'IT1',
};
const lecturer = {
  id: 'teacher',
  staffCode: 'GV1',
  fullName: 'Teacher',
  department: { code: 'IT', name: 'IT' },
};
const section = (id: string) => ({
  id,
  code: id,
  subject: { name: 'Subject' },
  lecturer,
  enrollments: [{ student }],
});

function setup() {
  const prisma = {
    term: { findUnique: jest.fn().mockResolvedValue(term) },
    classSection: {
      findMany: jest.fn().mockResolvedValue([section('A'), section('B')]),
    },
    evaluation: { findMany: jest.fn().mockResolvedValue([]) },
    careLog: { findMany: jest.fn().mockResolvedValue([]) },
    discussionMessage: { findMany: jest.fn().mockResolvedValue([]) },
    alert: { findMany: jest.fn().mockResolvedValue([]) },
    attendance: [] as unknown[],
  };
  // Hai truy vấn cùng model alert: cảnh báo theo mức (không source) và
  // cảnh báo điểm danh tự động (source = AUTO_ATTENDANCE).
  prisma.alert.findMany.mockImplementation(
    ({ where }: { where: { source?: string } }) =>
      Promise.resolve(
        where.source === 'AUTO_ATTENDANCE' ? prisma.attendance : [],
      ),
  );
  return {
    prisma,
    service: new CareStatisticsService(prisma as unknown as PrismaService),
  };
}

describe('CareStatisticsService', () => {
  it('rejects ordinary lecturers for reads and exports before querying data', async () => {
    const { service, prisma } = setup();
    const lecturerUser: AuthUser = { ...user, roles: ['LECTURER'] };
    await expect(
      service.list(lecturerUser, { term: 'FA26' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.export(lecturerUser, { term: 'FA26' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.term.findUnique).not.toHaveBeenCalled();
  });

  it('requires a configured term', async () => {
    const { service, prisma } = setup();
    await expect(service.list(user, { term: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.term.findUnique.mockResolvedValue(null);
    await expect(service.list(user, { term: 'FA26' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('keeps department scope even with an additional school-wide role', async () => {
    const { service, prisma } = setup();
    await service.list(
      { ...user, roles: ['HEAD_OF_DEPT', 'SA_OFFICER'] },
      { term: 'FA26' },
    );
    expect(prisma.classSection.findMany).toHaveBeenCalledWith(
      containing({
        where: {
          AND: [
            { term: 'FA26', lecturerId: { not: null } },
            {
              AND: [
                {
                  OR: [
                    { subject: { departmentId: 'dept' } },
                    { lecturerId: 'head' },
                  ],
                },
              ],
            },
            { lecturer: { departmentId: 'dept' } },
          ],
        },
        select: containing({
          enrollments: containing({
            where: {
              student: {
                AND: [
                  {
                    OR: [
                      { departmentId: 'dept' },
                      {
                        enrollments: {
                          some: { classSection: { lecturerId: 'head' } },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          }),
        }),
      }),
    );
  });

  it('matches evaluations to the class and de-duplicates teacher students', async () => {
    const { service, prisma } = setup();
    prisma.evaluation.findMany.mockResolvedValue([
      {
        id: 'e1',
        lecturerId: 'teacher',
        classSectionId: 'A',
        studentId: 'student',
        academicScore: 8,
        attitudeScore: 2,
        absentSessions: 0,
        note: 'Tốt',
        criteria: [],
        lecturer: { staffCode: 'GV1', fullName: 'Teacher' },
        updatedAt: term.startDate,
      },
      {
        id: 'e2',
        lecturerId: 'other',
        classSectionId: 'C', // Khác section B
        studentId: 'student',
        academicScore: 5,
        attitudeScore: 2,
        absentSessions: 1,
        note: null,
        criteria: [],
        lecturer: { staffCode: 'GV2', fullName: 'Other' },
        updatedAt: term.startDate,
      },
    ]);
    const report = await service.list(user, { term: 'FA26' });
    expect(report.lecturers[0]).toMatchObject({
      studentCount: 1,
      caredCount: 1,
      evaluationCount: 1,
      careRate: 100,
    });
    expect(report.lecturers[0].sections.map((row) => row.caredCount)).toEqual([
      1, 0,
    ]);
    expect(prisma.evaluation.findMany).toHaveBeenCalledWith(
      containing({
        where: containing({
          term: 'FA26',
          classSectionId: { in: ['A', 'B'] },
        }),
      }),
    );
  });

  it('counts own logs once per teacher, uses inclusive dates and includes resolved alerts', async () => {
    const { service, prisma } = setup();
    prisma.careLog.findMany.mockResolvedValue([
      {
        id: 'l1',
        staffId: 'teacher',
        studentId: 'student',
        channel: 'IN_PERSON',
        content: 'Chăm sóc',
        outcome: 'Tốt',
        nextAction: 'Theo dõi',
        staff: { staffCode: 'GV1', fullName: 'Teacher' },
        createdAt: term.startDate,
      },
      {
        id: 'l2',
        staffId: 'teacher',
        studentId: 'student',
        channel: 'ONLINE',
        content: 'Hỏi thăm',
        outcome: null,
        nextAction: null,
        staff: { staffCode: 'GV1', fullName: 'Teacher' },
        createdAt: term.endDate,
      },
    ]);
    prisma.alert.findMany.mockImplementation(
      ({ where }: { where: { source?: string } }) =>
        Promise.resolve(
          where.source === 'AUTO_ATTENDANCE'
            ? []
            : [
                { studentId: 'student', level: 2 },
                { studentId: 'student', level: 4 },
              ],
        ),
    );
    const report = await service.list(user, { term: 'FA26' });
    expect(report.lecturers[0]).toMatchObject({
      studentCount: 1,
      careLogCount: 2,
      caredCount: 1,
    });
    for (const row of report.lecturers[0].sections) {
      expect(row.students[0]).toMatchObject({
        careLogCount: 2,
        lastCareAt: term.endDate.toISOString(),
        alertLevel: 4,
      });
    }
    expect(prisma.careLog.findMany).toHaveBeenCalledWith(
      containing({
        where: containing({
          createdAt: { gte: term.startDate, lte: term.endDate },
        }),
      }),
    );
    expect(prisma.alert.findMany).toHaveBeenCalledWith({
      where: {
        studentId: { in: ['student'] },
        createdAt: { gte: term.startDate, lte: term.endDate },
      },
      select: { studentId: true, level: true },
    });
  });

  it('preserves teachers with no care, handles empty classes and filters student rows', async () => {
    const { service, prisma } = setup();
    expect(
      (await service.list(user, { term: 'FA26' })).lecturers[0],
    ).toMatchObject({ studentCount: 1, caredCount: 0, uncaredCount: 1 });
    expect(
      (await service.list(user, { term: 'FA26', status: 'cared' })).lecturers,
    ).toEqual([]);
    const filtered = await service.list(user, {
      term: 'FA26',
      status: 'uncared',
      lecturerId: 'teacher',
    });
    expect(filtered.lecturers[0].sections).toHaveLength(2);
    prisma.classSection.findMany.mockResolvedValue([
      { ...section('empty'), enrollments: [] },
    ]);
    expect(
      (await service.list(user, { term: 'FA26' })).lecturers[0],
    ).toMatchObject({ studentCount: 0, careRate: null });
  });

  it('gắn cảnh báo điểm danh mới nhất theo lớp và đếm GV đứng lớp đã chăm sóc', async () => {
    const { service, prisma } = setup();
    prisma.attendance = [
      {
        studentId: 'student',
        classSectionId: 'A',
        level: 2,
        absentSessions: 2,
        ownerCaredAt: null,
        createdAt: new Date('2026-09-10T00:00:00Z'),
        _count: { careLogs: 0 },
      },
      {
        studentId: 'student',
        classSectionId: 'A',
        level: 3,
        absentSessions: 3,
        ownerCaredAt: new Date('2026-09-15T00:00:00Z'),
        createdAt: new Date('2026-09-14T00:00:00Z'),
        _count: { careLogs: 1 },
      },
      {
        studentId: 'student',
        classSectionId: 'B',
        level: 2,
        absentSessions: 2,
        ownerCaredAt: null,
        createdAt: new Date('2026-09-14T00:00:00Z'),
        _count: { careLogs: 2 },
      },
    ];
    const report = await service.list(user, { term: 'FA26' });
    const [sectionA, sectionB] = report.lecturers[0].sections;
    expect(sectionA.students[0].attendanceAlert).toMatchObject({
      level: 3,
      absentSessions: 3,
      careLogCount: 1,
    });
    expect(sectionA.attendanceAlerts).toEqual({
      total: 1,
      caredByOwner: 1,
      caredByOthers: 0,
      pending: 0,
    });
    expect(sectionB.attendanceAlerts).toEqual({
      total: 1,
      caredByOwner: 0,
      caredByOthers: 1,
      pending: 1,
    });
    // Cấp giảng viên cộng theo lớp (cùng một sinh viên ở 2 lớp = 2 cảnh báo).
    expect(report.lecturers[0].attendanceAlerts).toEqual({
      total: 2,
      caredByOwner: 1,
      caredByOthers: 1,
      pending: 1,
    });
    expect(prisma.alert.findMany).toHaveBeenCalledWith(
      containing({
        where: {
          source: 'AUTO_ATTENDANCE',
          term: 'FA26',
          classSectionId: { in: ['A', 'B'] },
          studentId: { in: ['student'] },
        },
      }),
    );
  });

  it('exports three sheets using the same filtered totals and explicit metadata', async () => {
    const { service } = setup();
    const buffer = await service.export(user, {
      term: 'FA26',
      status: 'uncared',
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Tổng hợp giáo viên',
      'Theo lớp',
      'Chi tiết sinh viên',
    ]);
    expect(workbook.worksheets[0].getCell('E6').value).toBe(1);
    expect(workbook.worksheets[0].getCell('G6').value).toBe(1);
    expect(workbook.worksheets[1].rowCount).toBe(7);
    expect(workbook.worksheets[2].getCell('L6').value).toBe('Không có');
    expect(workbook.worksheets[0].getCell('A3').value).toContain(
      'Chưa chăm sóc',
    );
    // 4 cột điểm danh mới ở cuối sheet tổng hợp: CB, GV lớp đã CS, GV khác, chờ.
    expect(workbook.worksheets[0].getCell('L5').value).toBe('CB điểm danh');
    expect(workbook.worksheets[0].getCell('O6').value).toBe(0);
    expect(workbook.worksheets[2].getCell('M6').value).toBe('Không có');
    expect(workbook.worksheets[2].getCell('N6').value).toBe('—');
  });

  it('exports detailed care report with note, logs, and discussion columns when mode is detailed', async () => {
    const { service, prisma } = setup();
    prisma.evaluation.findMany.mockResolvedValue([
      {
        id: 'e1',
        lecturerId: 'teacher',
        classSectionId: 'A',
        studentId: 'student',
        academicScore: 9,
        attitudeScore: 1,
        absentSessions: 0,
        note: 'Cần chú ý thái độ',
        criteria: [{ criterion: 'P_DROPOUT_INTENT' }],
        lecturer: { staffCode: 'GV1', fullName: 'Teacher' },
        updatedAt: term.startDate,
      },
    ]);
    prisma.careLog.findMany.mockResolvedValue([
      {
        id: 'l1',
        staffId: 'teacher',
        studentId: 'student',
        channel: 'IN_PERSON',
        content: 'Gặp gỡ động viên',
        outcome: 'Ổn định',
        nextAction: 'Theo dõi tiếp',
        staff: { staffCode: 'GV1', fullName: 'Teacher' },
        createdAt: term.startDate,
      },
    ]);
    prisma.discussionMessage.findMany.mockResolvedValue([
      {
        id: 'd1',
        studentId: 'student',
        authorId: 'teacher',
        body: 'Thầy cô lưu ý em này',
        createdAt: term.startDate,
        author: { staffCode: 'GV1', fullName: 'Teacher' },
      },
    ]);

    const buffer = await service.export(user, {
      term: 'FA26',
      mode: 'detailed',
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets[0].name).toBe('Chi tiết nội dung chăm sóc');
    expect(workbook.worksheets[0].getCell('L6').value).toContain(
      'Cần chú ý thái độ',
    );
    expect(workbook.worksheets[0].getCell('M6').value).toContain(
      'Gặp gỡ động viên',
    );
    expect(workbook.worksheets[0].getCell('N6').value).toContain(
      'Thầy cô lưu ý em này',
    );
    expect(workbook.worksheets[0].getCell('O5').value).toBe('CB điểm danh');
  });
});
