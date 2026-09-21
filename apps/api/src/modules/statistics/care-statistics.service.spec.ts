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
    // Mặc định SV có một cảnh báo không gắn lớp → xuất hiện ở mọi lớp.
    levelAlerts: [
      { studentId: 'student', classSectionId: null, level: 1 },
    ] as unknown[],
  };
  // Hai truy vấn cùng model alert: cảnh báo theo mức (không source) và
  // cảnh báo điểm danh tự động (source = AUTO_ATTENDANCE).
  prisma.alert.findMany.mockImplementation(
    ({ where }: { where: { source?: string } }) =>
      Promise.resolve(
        where.source === 'AUTO_ATTENDANCE'
          ? prisma.attendance
          : prisma.levelAlerts,
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

  it('Cán bộ Đào tạo xem được thống kê chăm sóc toàn trường', async () => {
    const { service, prisma } = setup();
    const trainingUser: AuthUser = {
      ...user,
      roles: ['TRAINING_OFFICER'],
      departmentId: null,
    };
    await expect(
      service.list(trainingUser, { term: 'FA26' }),
    ).resolves.toBeDefined();
    const [sectionArgs] = prisma.classSection.findMany.mock.calls[0] as [
      { where: { AND: unknown[] } },
    ];
    // Không bị thu về phạm vi bộ môn như TBM.
    expect(sectionArgs.where.AND.slice(1)).toEqual([{}, { lecturer: {} }]);
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
    // Nhận xét vẫn được đếm, nhưng KHÔNG tính là đã chăm sóc.
    expect(report.lecturers[0]).toMatchObject({
      studentCount: 1,
      caredCount: 0,
      evaluationCount: 1,
      careRate: 0,
    });
    expect(
      report.lecturers[0].sections.map((row) => row.evaluationCount),
    ).toEqual([1, 0]);
    expect(prisma.evaluation.findMany).toHaveBeenCalledWith(
      containing({
        where: containing({
          term: 'FA26',
          classSectionId: { in: ['A', 'B'] },
        }),
      }),
    );
  });

  it('chỉ nhật ký chăm sóc mới tính là đã chăm sóc — nhận xét, thảo luận thì không', async () => {
    const { service, prisma } = setup();
    prisma.classSection.findMany.mockResolvedValue([section('A')]);
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

    const noLog = await service.list(user, { term: 'FA26' });
    const [row] = noLog.lecturers[0].sections[0].students;
    expect(row).toMatchObject({
      cared: false,
      evaluationCount: 1,
      discussionCount: 1,
      careLogCount: 0,
      lastCareAt: null,
    });
    expect(noLog.lecturers[0]).toMatchObject({ caredCount: 0, careRate: 0 });

    prisma.careLog.findMany.mockResolvedValue([
      {
        id: 'l1',
        staffId: 'teacher',
        studentId: 'student',
        channel: 'IN_PERSON',
        content: 'Gặp',
        outcome: null,
        nextAction: null,
        staff: { staffCode: 'GV1', fullName: 'Teacher' },
        createdAt: term.endDate,
      },
    ]);
    const withLog = await service.list(user, { term: 'FA26' });
    expect(withLog.lecturers[0].sections[0].students[0]).toMatchObject({
      cared: true,
      lastCareAt: term.endDate.toISOString(),
    });
    expect(withLog.lecturers[0]).toMatchObject({
      caredCount: 1,
      careRate: 100,
    });
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
                { studentId: 'student', classSectionId: null, level: 2 },
                { studentId: 'student', classSectionId: null, level: 4 },
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
      select: { studentId: true, classSectionId: true, level: true },
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

  it('chỉ tính SV có cảnh báo: tỷ lệ trên SV cảnh báo, sĩ số vẫn là mọi SV', async () => {
    const { service, prisma } = setup();
    const calm = { ...student, id: 'calm', studentCode: 'SV2' };
    const other = { ...student, id: 'other', studentCode: 'SV3' };
    prisma.classSection.findMany.mockResolvedValue([
      {
        ...section('A'),
        enrollments: [{ student }, { student: calm }, { student: other }],
      },
    ]);
    prisma.levelAlerts = [
      { studentId: 'student', classSectionId: 'A', level: 3 },
      { studentId: 'other', classSectionId: 'A', level: 2 },
      // Cảnh báo ở lớp khác không làm SV hiện trong lớp A.
      { studentId: 'calm', classSectionId: 'Z', level: 4 },
    ];
    prisma.careLog.findMany.mockResolvedValue([
      {
        id: 'l1',
        staffId: 'teacher',
        studentId: 'student',
        channel: 'IN_PERSON',
        content: 'Gặp',
        outcome: null,
        nextAction: null,
        staff: { staffCode: 'GV1', fullName: 'Teacher' },
        createdAt: term.startDate,
      },
    ]);
    const report = await service.list(user, { term: 'FA26' });
    const [sectionA] = report.lecturers[0].sections;
    expect(sectionA.students.map((row) => row.id)).toEqual([
      'student',
      'other',
    ]);
    expect(sectionA).toMatchObject({
      studentCount: 3,
      alertedStudentCount: 2,
      caredCount: 1,
      uncaredCount: 1,
      careRate: 50,
    });
    expect(sectionA.students[0].alertLevel).toBe(3);

    // Lọc trạng thái chỉ lọc danh sách, tỷ lệ vẫn tính trên mọi SV cảnh báo.
    const cared = await service.list(user, { term: 'FA26', status: 'cared' });
    expect(cared.lecturers[0].sections[0].students.map((r) => r.id)).toEqual([
      'student',
    ]);
    expect(cared.lecturers[0]).toMatchObject({
      studentCount: 3,
      alertedStudentCount: 2,
      careRate: 50,
    });
  });

  it('lớp không có SV cảnh báo: tỷ lệ trống, không lên file chi tiết', async () => {
    const { service, prisma } = setup();
    prisma.levelAlerts = [];
    const report = await service.list(user, { term: 'FA26' });
    expect(report.lecturers[0]).toMatchObject({
      studentCount: 1,
      alertedStudentCount: 0,
      careRate: null,
    });
    const buffer = await service.export(user, {
      term: 'FA26',
      mode: 'detailed',
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets[0].rowCount).toBe(5);
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

  it('lọc theo bộ môn của giảng viên, luôn AND với phạm vi người xem', async () => {
    const { service, prisma } = setup();
    await service.list(user, { term: 'FA26', departmentId: 'dept-it' });
    expect(prisma.classSection.findMany).toHaveBeenCalledWith(
      containing({
        where: {
          AND: expect.arrayContaining([
            { lecturer: { departmentId: 'dept-it' } },
          ]) as unknown,
        },
      }),
    );
  });

  it('đếm lượt cảnh báo theo lớp môn và lượt nhật ký do chính GV đứng lớp ghi', async () => {
    const { service, prisma } = setup();
    prisma.careLog.findMany.mockResolvedValue([
      {
        id: 'l1',
        staffId: 'teacher',
        studentId: 'student',
        channel: 'IN_PERSON',
        content: 'GV gặp',
        outcome: null,
        nextAction: null,
        staff: { staffCode: 'GV1', fullName: 'Teacher' },
        createdAt: term.startDate,
      },
      {
        id: 'l2',
        staffId: 'sa',
        studentId: 'student',
        channel: 'ONLINE',
        content: 'CTSV gọi',
        outcome: null,
        nextAction: null,
        staff: { staffCode: 'CT1', fullName: 'SA' },
        createdAt: term.startDate,
      },
    ]);
    prisma.alert.findMany.mockImplementation(
      ({ where }: { where: { source?: string } }) =>
        Promise.resolve(
          where.source === 'AUTO_ATTENDANCE'
            ? []
            : [
                { studentId: 'student', classSectionId: 'A', level: 2 },
                { studentId: 'student', classSectionId: null, level: 3 },
                { studentId: 'student', classSectionId: 'B', level: 4 },
              ],
        ),
    );
    const report = await service.list(user, { term: 'FA26' });
    const [sectionA, sectionB] = report.lecturers[0].sections;
    expect(sectionA).toMatchObject({
      alertedStudentCount: 1,
      careLogCount: 2,
      ownerCareLogCount: 1,
    });
    expect(sectionA.students[0].alertCount).toBe(2);
    expect(sectionB).toMatchObject({
      alertedStudentCount: 1,
      ownerCareLogCount: 1,
    });
    expect(sectionB.students[0].alertCount).toBe(2);
  });

  it('xuất tổng hợp: mỗi dòng một lớp môn với đúng 11 cột yêu cầu', async () => {
    const { service, prisma } = setup();
    prisma.evaluation.findMany.mockResolvedValue([
      {
        id: 'e1',
        lecturerId: 'teacher',
        classSectionId: 'A',
        studentId: 'student',
        academicScore: 5,
        attitudeScore: 5,
        absentSessions: 0,
        note: null,
        criteria: [],
        lecturer: { staffCode: 'GV1', fullName: 'Teacher' },
        updatedAt: term.startDate,
      },
    ]);
    const buffer = await service.export(user, { term: 'FA26' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Tổng hợp theo lớp môn',
      'Tổng hợp giảng viên',
    ]);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(5).values).toEqual([
      undefined,
      'Acc GV',
      'Họ tên GV',
      'Bộ môn',
      'Lớp môn',
      'Sĩ số SV',
      'Lượt cảnh báo',
      'Lượt chăm sóc',
      'Tỷ lệ chăm sóc',
      'Lượt nhận xét',
      'Lượt nhật ký',
      'Lượt GV chăm sóc',
    ]);
    expect(sheet.getRow(6).values).toEqual([
      undefined,
      'GV1',
      'Teacher',
      'IT',
      'A',
      1,
      1,
      // Chỉ có nhận xét, chưa có nhật ký → chưa tính là đã chăm sóc.
      0,
      '0%',
      1,
      0,
      0,
    ]);
    expect(sheet.getCell('D7').value).toBe('B');
    expect(sheet.getCell('H7').value).toBe('0%');
    expect(sheet.rowCount).toBe(7);
  });

  it('xuất chi tiết: mỗi lần chăm sóc một cột "Nhật ký chăm sóc lần X", cũ nhất trước', async () => {
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
    // Prisma trả mới nhất trước — file xuất phải đảo lại thành lần 1 = sớm nhất.
    prisma.careLog.findMany.mockResolvedValue([
      {
        id: 'l2',
        staffId: 'teacher',
        studentId: 'student',
        channel: 'ONLINE',
        content: 'Hỏi thăm lần hai',
        outcome: null,
        nextAction: null,
        staff: { staffCode: 'GV1', fullName: 'Teacher' },
        createdAt: new Date('2026-09-05T08:30:00Z'),
      },
      {
        id: 'l1',
        staffId: 'sa',
        studentId: 'student',
        channel: 'IN_PERSON',
        content: 'Gặp gỡ động viên',
        outcome: null,
        nextAction: null,
        staff: { staffCode: 'CT1', fullName: 'SA' },
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
    prisma.alert.findMany.mockImplementation(
      ({ where }: { where: { source?: string } }) =>
        Promise.resolve(
          where.source === 'AUTO_ATTENDANCE'
            ? []
            : [{ studentId: 'student', classSectionId: 'A', level: 4 }],
        ),
    );

    const buffer = await service.export(user, {
      term: 'FA26',
      mode: 'detailed',
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Chi tiết nội dung chăm sóc',
    ]);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(5).values).toEqual([
      undefined,
      'Acc GV',
      'Họ tên GV',
      'Bộ môn',
      'Lớp môn',
      'Tên môn học',
      'Mã SV',
      'Họ tên SV',
      'Trạng thái',
      'Mức cảnh báo',
      'Nhận xét của GV (Nguyên nhân cần chăm sóc)',
      'Nhật ký chăm sóc lần 1',
      'Nhật ký chăm sóc lần 2',
      'Trao đổi thảo luận giữa GV & CB',
    ]);
    expect(sheet.getCell('E6').value).toBe('Subject');
    expect(sheet.getCell('H6').value).toBe('Đã chăm sóc');
    expect(sheet.getCell('I6').value).toBe('Mức 4 - Khẩn cấp');
    expect(sheet.getCell('J6').value).toContain('Ý định nghỉ học');
    expect(sheet.getCell('J6').value).toContain('Cần chú ý thái độ');
    expect(sheet.getCell('K6').value).toBe(
      '07:00 01/09/2026 — Acc CT1 — Gặp gỡ động viên',
    );
    expect(sheet.getCell('L6').value).toBe(
      '15:30 05/09/2026 — Acc GV1 — Hỏi thăm lần hai',
    );
    expect(sheet.getCell('M6').value).toContain('Thầy cô lưu ý em này');
    // Cảnh báo chỉ gắn lớp A → SV không lên dòng của lớp B.
    expect(sheet.rowCount).toBe(6);
  });

  it('xuất chi tiết vẫn có cột "Nhật ký chăm sóc lần 1" khi chưa ai chăm sóc', async () => {
    const { service } = setup();
    const buffer = await service.export(user, {
      term: 'FA26',
      mode: 'detailed',
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell('H6').value).toBe('Chưa chăm sóc');
    expect(sheet.getCell('I6').value).toBe('Mức 1 - Thấp');
    expect(sheet.getCell('K5').value).toBe('Nhật ký chăm sóc lần 1');
    expect(sheet.getCell('L5').value).toBe('Trao đổi thảo luận giữa GV & CB');
  });
});
