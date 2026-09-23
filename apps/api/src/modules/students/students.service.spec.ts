import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import { StudentsService } from './students.service';

/** Dựng lỗi Prisma known-request giả lập (P2002/P2003/...) — cùng kỹ thuật
 * với `mappings.service.spec.ts` để `isPrismaError` (dựa trên `instanceof`)
 * nhận diện đúng. */
function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: '6.0.0',
  });
}

const adminUser = { id: 'a', roles: ['ADMIN'], departmentId: null } as AuthUser;
const lecturerUser = {
  id: 'l',
  roles: ['LECTURER'],
  departmentId: 'dept-1',
} as AuthUser;
const headOfDeptUser = {
  id: 'h',
  roles: ['HEAD_OF_DEPT'],
  departmentId: 'dept-1',
} as AuthUser;

const findMany = jest.fn().mockResolvedValue([]);
const count = jest.fn().mockResolvedValue(0);
const updateMany = jest.fn();
const majorFindUnique = jest.fn();
const transaction = jest.fn().mockResolvedValue([[], 0]);
const prisma = {
  student: { findMany, count, updateMany },
  major: { findUnique: majorFindUnique },
  $transaction: transaction,
} as unknown as PrismaService;
const auditLog = jest.fn();
const audit = { log: auditLog } as unknown as AuditService;
const service = new StudentsService(prisma, audit);

interface FindManyArgs {
  where: { majorId?: string | null; departmentId?: string; AND?: unknown[] };
}

/**
 * Phạm vi sinh viên của GIẢNG VIÊN: chỉ sinh viên các lớp học phần mình đứng
 * lớp — sinh viên cùng bộ môn nhưng mình không dạy cũng nằm ngoài tầm nhìn.
 */
const LECTURER_SCOPE = [
  { enrollments: { some: { classSection: { lecturerId: 'l' } } } },
];

interface UpdateManyArgs {
  where: { id: { in: string[] }; departmentId?: string };
  data: { majorId: string; departmentId: string };
}

describe('StudentsService.list — missingMajor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('missingMajor=true lọc sinh viên chưa gán ngành', async () => {
    await service.list(adminUser, { missingMajor: true });
    const [args] = findMany.mock.calls[0] as [FindManyArgs];
    expect(args.where.majorId).toBeNull();
  });

  it('missingMajor=false không thêm điều kiện majorId', async () => {
    await service.list(adminUser, {
      missingMajor: false,
    });
    const [args] = findMany.mock.calls[0] as [FindManyArgs];
    expect(args.where.majorId).toBeUndefined();
  });

  it('missingMajor không phá scope của giảng viên', async () => {
    await service.list(lecturerUser, {
      missingMajor: true,
    });
    const [args] = findMany.mock.calls[0] as [FindManyArgs];
    expect(args.where.majorId).toBeNull();
    expect(args.where.AND).toEqual(LECTURER_SCOPE);
  });
});

describe('StudentsService.bulkAssignMajor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('chỉ đụng tới sinh viên trong bộ môn của người dùng (RULE 2)', async () => {
    majorFindUnique.mockResolvedValue({ id: 'mj-1', departmentId: 'dept-1' });
    updateMany.mockResolvedValue({ count: 2 });
    await service.bulkAssignMajor(lecturerUser, {
      studentIds: ['s-1', 's-2'],
      majorId: 'mj-1',
    });
    const [args] = updateMany.mock.calls[0] as [UpdateManyArgs];
    expect(args.where).toEqual({
      id: { in: ['s-1', 's-2'] },
      departmentId: 'dept-1',
    });
  });

  it('trả về đúng số bản ghi thực sự được cập nhật', async () => {
    majorFindUnique.mockResolvedValue({ id: 'mj-1', departmentId: 'dept-x' });
    updateMany.mockResolvedValue({ count: 1 });
    const result = await service.bulkAssignMajor(adminUser, {
      studentIds: ['s-1', 's-2'],
      majorId: 'mj-1',
    });
    expect(result).toEqual({ updated: 1 });
  });

  it('không sinh viên nào thuộc phạm vi → NotFoundException, không ghi audit', async () => {
    majorFindUnique.mockResolvedValue({ id: 'mj-1', departmentId: 'dept-1' });
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.bulkAssignMajor(lecturerUser, {
        studentIds: ['s-ngoai-bo-mon'],
        majorId: 'mj-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('majorId không tồn tại (P2003) → NotFoundException nêu rõ ngành', async () => {
    // major vẫn tồn tại lúc findUnique (qua bước kiểm dept), nhưng bị xóa
    // xen giữa hai truy vấn khiến updateMany đụng khóa ngoại — đúng nhánh
    // phòng thủ P2003 mà fix vòng 1 mục 2 yêu cầu giữ lại.
    majorFindUnique.mockResolvedValue({
      id: 'mj-khong-co',
      departmentId: 'dept-x',
    });
    updateMany.mockRejectedValue(prismaError('P2003'));
    await expect(
      service.bulkAssignMajor(adminUser, {
        studentIds: ['s-1'],
        majorId: 'mj-khong-co',
      }),
    ).rejects.toThrow('Ngành học không tồn tại.');
  });

  it('majorId không tồn tại ngay từ đầu → NotFoundException, không gọi updateMany', async () => {
    majorFindUnique.mockResolvedValue(null);
    await expect(
      service.bulkAssignMajor(adminUser, {
        studentIds: ['s-1'],
        majorId: 'mj-khong-co',
      }),
    ).rejects.toThrow('Ngành học không tồn tại.');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('ghi audit log kèm số lượng đã gán', async () => {
    majorFindUnique.mockResolvedValue({ id: 'mj-1', departmentId: 'dept-y' });
    updateMany.mockResolvedValue({ count: 2 });
    await service.bulkAssignMajor(adminUser, {
      studentIds: ['s-1', 's-2'],
      majorId: 'mj-1',
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 'a',
        action: 'STUDENT_BULK_ASSIGN_MAJOR',
        entity: 'Student',
        metadata: { majorId: 'mj-1', studentIds: ['s-1', 's-2'], updated: 2 },
      }),
    );
  });

  it('HEAD_OF_DEPT gán ngành thuộc bộ môn khác → ForbiddenException, không gọi updateMany', async () => {
    majorFindUnique.mockResolvedValue({ id: 'mj-2', departmentId: 'dept-2' });
    await expect(
      service.bulkAssignMajor(headOfDeptUser, {
        studentIds: ['s-1'],
        majorId: 'mj-2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('updateMany được gọi với data chứa cả majorId lẫn departmentId đúng của major', async () => {
    majorFindUnique.mockResolvedValue({ id: 'mj-1', departmentId: 'dept-9' });
    updateMany.mockResolvedValue({ count: 1 });
    await service.bulkAssignMajor(adminUser, {
      studentIds: ['s-1'],
      majorId: 'mj-1',
    });
    const [args] = updateMany.mock.calls[0] as [UpdateManyArgs];
    expect(args.data).toEqual({ majorId: 'mj-1', departmentId: 'dept-9' });
  });
});

describe('StudentsService.remove — giữ lịch sử phân tích AI', () => {
  it('không xóa sinh viên đã có hồ sơ phân tích', async () => {
    const deleteStudent = jest.fn();
    const localPrisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'student-1',
          major: null,
          department: null,
          _count: { enrollments: 0, evaluations: 0, careLogs: 0, alerts: 0 },
        }),
        delete: deleteStudent,
      },
      studentTermAnalysis: { count: jest.fn().mockResolvedValue(1) },
    } as unknown as PrismaService;
    const localService = new StudentsService(localPrisma, audit);

    await expect(
      localService.remove(adminUser, 'student-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(deleteStudent).not.toHaveBeenCalled();
  });
});

/** Bộ lọc kỳ + giảng viên đi qua quan hệ enrollments → classSection. */
interface ListFindManyArgs {
  where: {
    majorId?: string | null;
    departmentId?: string;
    AND?: unknown[];
    OR?: unknown[];
    classCode?: string;
    enrollments?: {
      some: {
        classSectionId?: string;
        classSection: { term?: string; lecturerId?: string };
      };
    };
  };
}

describe('StudentsService.list — lọc theo ngành, kỳ, giảng viên', () => {
  beforeEach(() => jest.clearAllMocks());

  it('majorId lọc đúng ngành', async () => {
    await service.list(adminUser, { majorId: 'mj-1' });
    const [args] = findMany.mock.calls[0] as [ListFindManyArgs];
    expect(args.where.majorId).toBe('mj-1');
  });

  it('missingMajor thắng majorId khi bật cả hai', async () => {
    await service.list(adminUser, { majorId: 'mj-1', missingMajor: true });
    const [args] = findMany.mock.calls[0] as [ListFindManyArgs];
    expect(args.where.majorId).toBeNull();
  });

  it('term lọc theo học kỳ của lớp học phần đã đăng ký', async () => {
    await service.list(adminUser, { term: 'SU25' });
    const [args] = findMany.mock.calls[0] as [ListFindManyArgs];
    expect(args.where.enrollments?.some.classSection).toEqual({ term: 'SU25' });
  });

  it('lecturerId lọc theo giảng viên phụ trách lớp học phần', async () => {
    await service.list(adminUser, { lecturerId: 'gv-1' });
    const [args] = findMany.mock.calls[0] as [ListFindManyArgs];
    expect(args.where.enrollments?.some.classSection).toEqual({
      lecturerId: 'gv-1',
    });
  });

  it('kỳ + giảng viên gộp vào CÙNG một lớp học phần, không phải hai điều kiện rời', async () => {
    await service.list(adminUser, { term: 'SU25', lecturerId: 'gv-1' });
    const [args] = findMany.mock.calls[0] as [ListFindManyArgs];
    expect(args.where.enrollments).toEqual({
      some: { classSection: { term: 'SU25', lecturerId: 'gv-1' } },
    });
  });

  it('sectionId lọc đúng sinh viên của một lớp học phần', async () => {
    await service.list(adminUser, { sectionId: 'cs-1' });
    const [args] = findMany.mock.calls[0] as [ListFindManyArgs];
    expect(args.where.enrollments).toEqual({
      some: { classSectionId: 'cs-1', classSection: {} },
    });
  });

  it('không lọc kỳ/giảng viên/lớp học phần thì không đụng tới quan hệ enrollments', async () => {
    await service.list(adminUser, { classCode: 'SE1901' });
    const [args] = findMany.mock.calls[0] as [ListFindManyArgs];
    expect(args.where.enrollments).toBeUndefined();
    expect(args.where.classCode).toBe('SE1901');
  });

  it('RULE 2: giảng viên truyền ngành/GV bộ môn khác vẫn bị giới hạn phạm vi mình', async () => {
    await service.list(lecturerUser, {
      majorId: 'mj-cua-bo-mon-khac',
      lecturerId: 'gv-bo-mon-khac',
      term: 'SU25',
    });
    const [args] = findMany.mock.calls[0] as [ListFindManyArgs];
    // "Lớp mình dạy" gắn vào CHÍNH lượt đăng ký đang lọc: GV khác ≠ mình → rỗng.
    expect(args.where.AND).toEqual([
      {
        enrollments: {
          some: {
            AND: [
              { classSection: { term: 'SU25', lecturerId: 'gv-bo-mon-khac' } },
              { classSection: { lecturerId: 'l' } },
            ],
          },
        },
      },
    ]);
  });

  it('RULE 2: ô tìm kiếm dùng OR nhưng KHÔNG được nuốt mất scope', async () => {
    await service.list(lecturerUser, { search: 'nguyen' });
    const [args] = findMany.mock.calls[0] as [ListFindManyArgs];
    // Scope nằm trong AND nên tồn tại song song với OR của tìm kiếm.
    expect(args.where.AND).toEqual(LECTURER_SCOPE);
    expect(args.where.OR).toHaveLength(2);
  });

  it('count dùng đúng where với findMany để phân trang không lệch', async () => {
    await service.list(adminUser, { term: 'SU25', majorId: 'mj-1' });
    const [findArgs] = findMany.mock.calls[0] as [ListFindManyArgs];
    const [countArgs] = count.mock.calls[0] as [ListFindManyArgs];
    expect(countArgs.where).toEqual(findArgs.where);
  });
});

describe('StudentsService.filterOptions', () => {
  interface ScopedArgs {
    where?: {
      departmentId?: string;
      AND?: unknown[];
      OR?: unknown[];
      subject?: { departmentId?: string };
      classSections?: { some: unknown };
    };
    select?: Record<string, boolean>;
  }

  /** Lớp học phần trong tầm nhìn của giảng viên: chỉ lớp mình đứng tên. */
  const LECTURER_SECTION_SCOPE = [{ lecturerId: 'l' }];

  function setup() {
    const studentGroupBy = jest.fn().mockResolvedValue([
      { classCode: 'SE1901', majorId: 'mj-1' },
      { classCode: 'SE1901', majorId: 'mj-2' },
      { classCode: 'SE1902', majorId: null },
    ]);
    const majorFindMany = jest
      .fn()
      .mockResolvedValue([
        { id: 'mj-1', code: 'SE', name: 'Kỹ thuật phần mềm' },
      ]);
    const sectionGroupBy = jest
      .fn()
      .mockResolvedValue([{ term: 'SU25' }, { term: 'SP25' }]);
    const staffFindMany = jest
      .fn()
      .mockResolvedValue([
        { id: 'gv-1', staffCode: 'GV001', fullName: 'Trần Bình' },
      ]);
    const sectionFindMany = jest.fn().mockResolvedValue([
      {
        id: 'cs-1',
        code: 'COM2013-WD21301-SU26',
        term: 'SU25',
        subject: { code: 'COM2013', name: 'Web design' },
      },
    ]);
    const departmentFindMany = jest
      .fn()
      .mockResolvedValue([
        { id: 'dept-1', code: 'CNTT', name: 'Công nghệ thông tin' },
      ]);
    const localPrisma = {
      student: { groupBy: studentGroupBy },
      major: { findMany: majorFindMany },
      classSection: { groupBy: sectionGroupBy, findMany: sectionFindMany },
      staff: { findMany: staffFindMany },
      department: { findMany: departmentFindMany },
    } as unknown as PrismaService;
    return {
      service: new StudentsService(localPrisma, audit),
      departmentFindMany,
      studentGroupBy,
      majorFindMany,
      sectionGroupBy,
      staffFindMany,
      sectionFindMany,
    };
  }

  it('trả về 6 danh sách option ở dạng phẳng', async () => {
    const { service: local } = setup();

    await expect(local.filterOptions(adminUser)).resolves.toEqual({
      terms: ['SU25', 'SP25'],
      classCodes: ['SE1901', 'SE1902'],
      classMajors: { SE1901: ['mj-1', 'mj-2'], SE1902: [] },
      majors: [{ id: 'mj-1', code: 'SE', name: 'Kỹ thuật phần mềm' }],
      lecturers: [{ id: 'gv-1', staffCode: 'GV001', fullName: 'Trần Bình' }],
      sections: [
        {
          id: 'cs-1',
          code: 'COM2013-WD21301-SU26',
          term: 'SU25',
          subject: { code: 'COM2013', name: 'Web design' },
        },
      ],
      departments: [
        { id: 'dept-1', code: 'CNTT', name: 'Công nghệ thông tin' },
      ],
    });
  });

  it('gom lớp và ngành trong một truy vấn scope để ô Ngành lọc theo Lớp', async () => {
    const { service: local, studentGroupBy } = setup();

    await local.filterOptions(lecturerUser);

    const [args] = studentGroupBy.mock.calls[0] as [
      { by: string[]; where: ScopedArgs['where'] },
    ];
    expect(args.by).toEqual(['classCode', 'majorId']);
    expect(args.where?.AND).toEqual(LECTURER_SCOPE);
  });

  it('RULE 2: bộ môn trong option chỉ gồm bộ môn có sinh viên trong phạm vi', async () => {
    const { service: local, departmentFindMany } = setup();

    await local.filterOptions(lecturerUser);

    const [args] = departmentFindMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(args.where).toEqual({
      isActive: true,
      students: { some: { AND: LECTURER_SCOPE } },
    });
  });

  it('vai trò toàn trường thấy mọi bộ môn đang hoạt động', async () => {
    const { service: local, departmentFindMany } = setup();

    await local.filterOptions(adminUser);

    const [args] = departmentFindMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(args.where).toEqual({ isActive: true });
  });

  it('RULE 2: danh sách lớp học phần trong bộ lọc bị giới hạn theo sectionScope', async () => {
    const { service: local, sectionFindMany } = setup();

    await local.filterOptions(lecturerUser);

    const [args] = sectionFindMany.mock.calls[0] as [ScopedArgs];
    expect(args.where?.AND).toEqual(LECTURER_SECTION_SCOPE);
  });

  it('vai trò toàn trường không bị giới hạn bộ môn', async () => {
    const { service: local, studentGroupBy, majorFindMany } = setup();

    await local.filterOptions(adminUser);

    const [studentArgs] = studentGroupBy.mock.calls[0] as [ScopedArgs];
    const [majorArgs] = majorFindMany.mock.calls[0] as [ScopedArgs];
    expect(studentArgs.where?.departmentId).toBeUndefined();
    expect(majorArgs.where?.departmentId).toBeUndefined();
  });

  it('RULE 2: giảng viên chỉ thấy lớp, ngành, kỳ và GV trong phạm vi mình', async () => {
    const {
      service: local,
      studentGroupBy,
      majorFindMany,
      sectionGroupBy,
      staffFindMany,
    } = setup();

    await local.filterOptions(lecturerUser);

    const [studentArgs] = studentGroupBy.mock.calls[0] as [ScopedArgs];
    const [majorArgs] = majorFindMany.mock.calls[0] as [ScopedArgs];
    const [sectionArgs] = sectionGroupBy.mock.calls[0] as [ScopedArgs];
    const [staffArgs] = staffFindMany.mock.calls[0] as [ScopedArgs];

    expect(studentArgs.where?.AND).toEqual(LECTURER_SCOPE);
    // Chỉ ngành của sinh viên mình đang dạy — KHÔNG liệt kê ngành của bộ môn.
    expect(majorArgs.where?.OR).toEqual([
      { students: { some: { AND: LECTURER_SCOPE } } },
    ]);
    // Lớp học phần không có departmentId — scope qua GV phụ trách.
    expect(sectionArgs.where?.AND).toEqual(LECTURER_SECTION_SCOPE);
    expect(staffArgs.where?.classSections?.some).toEqual({
      AND: LECTURER_SECTION_SCOPE,
    });
  });

  it('RULE 1: option giảng viên chỉ gồm id, mã và họ tên — không trường PII nào khác', async () => {
    const { service: local, staffFindMany } = setup();

    await local.filterOptions(adminUser);

    const [staffArgs] = staffFindMany.mock.calls[0] as [ScopedArgs];
    expect(Object.keys(staffArgs.select ?? {}).sort()).toEqual([
      'fullName',
      'id',
      'staffCode',
    ]);
  });
});

describe('StudentsService.list — cột số buổi vắng', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lọc enrollments theo cùng điều kiện kỳ/lớp HP với bộ lọc', async () => {
    await service.list(adminUser, { term: 'FA26', sectionId: 'cs-1' });
    const [args] = findMany.mock.calls[0] as [
      { include: { enrollments: { where: unknown; select: unknown } } },
    ];
    expect(args.include.enrollments).toEqual({
      where: { classSectionId: 'cs-1', classSection: { term: 'FA26' } },
      select: { absentSessions: true },
    });
  });

  it('cộng tổng buổi vắng, lấy max theo lớp HP và bỏ mảng enrollments thô', async () => {
    transaction.mockResolvedValueOnce([
      [
        {
          id: 's1',
          enrollments: [
            { absentSessions: 2 },
            { absentSessions: null },
            { absentSessions: 3 },
          ],
        },
        { id: 's2', enrollments: [{ absentSessions: null }] },
        { id: 's3', enrollments: [] },
      ],
      3,
    ]);
    const result = await service.list(adminUser, { term: 'FA26' });
    expect(result.items).toEqual([
      { id: 's1', absentSessions: 5, maxSectionAbsent: 3 },
      { id: 's2', absentSessions: null, maxSectionAbsent: null },
      { id: 's3', absentSessions: null, maxSectionAbsent: null },
    ]);
  });
});

describe('StudentsService.list — sắp xếp theo số buổi vắng / cảnh báo mở', () => {
  const idsFindMany = jest.fn();
  const enrollmentGroupBy = jest.fn();
  const alertGroupBy = jest.fn();
  const sortPrisma = {
    student: { findMany: idsFindMany },
    enrollment: { groupBy: enrollmentGroupBy },
    alert: { groupBy: alertGroupBy },
  } as unknown as PrismaService;
  const sortService = new StudentsService(sortPrisma, audit);

  const STUDENTS = [
    { id: 's1', studentCode: 'SE001', classCode: 'SE1901' },
    { id: 's2', studentCode: 'SE002', classCode: 'SE1901' },
    { id: 's3', studentCode: 'SE003', classCode: 'SE1901' },
    { id: 's4', studentCode: 'SE004', classCode: 'SE1901' },
  ];

  /** Lần 1 lấy toàn bộ id trong phạm vi; lần 2 nạp chi tiết trang (thứ tự DB ngẫu nhiên). */
  function mockStudents() {
    idsFindMany.mockReset();
    idsFindMany.mockResolvedValueOnce(STUDENTS);
    idsFindMany.mockImplementationOnce(
      ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          [...where.id.in].reverse().map((id) => ({ id, enrollments: [] })),
        ),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockStudents();
    enrollmentGroupBy.mockResolvedValue([
      { studentId: 's1', _sum: { absentSessions: 2 } },
      { studentId: 's2', _sum: { absentSessions: 7 } },
      { studentId: 's3', _sum: { absentSessions: 2 } },
    ]);
    alertGroupBy.mockResolvedValue([
      { studentId: 's2', _count: { _all: 1 } },
      { studentId: 's4', _count: { _all: 3 } },
    ]);
  });

  it('absentSessions desc: nhiều vắng lên đầu, hoà thì theo MSSV, chưa có dữ liệu xuống cuối', async () => {
    const result = await sortService.list(adminUser, {
      sortBy: 'absentSessions',
      sortDir: 'desc',
    });
    expect(result.items.map((s) => s.id)).toEqual(['s2', 's1', 's3', 's4']);
    expect(result.meta).toEqual({ total: 4, page: 1, limit: 20 });
  });

  it('absentSessions asc: chưa có dữ liệu vẫn nằm cuối', async () => {
    const result = await sortService.list(adminUser, {
      sortBy: 'absentSessions',
      sortDir: 'asc',
    });
    expect(result.items.map((s) => s.id)).toEqual(['s1', 's3', 's2', 's4']);
  });

  it('openAlerts desc: không có cảnh báo mở tính là 0', async () => {
    const result = await sortService.list(adminUser, {
      sortBy: 'openAlerts',
      sortDir: 'desc',
    });
    expect(result.items.map((s) => s.id)).toEqual(['s4', 's2', 's1', 's3']);
    expect(enrollmentGroupBy).not.toHaveBeenCalled();
  });

  it('cắt trang SAU khi sắp xếp và chỉ nạp chi tiết của trang đó', async () => {
    const result = await sortService.list(adminUser, {
      sortBy: 'openAlerts',
      sortDir: 'desc',
      page: 2,
      limit: 2,
    });
    expect(result.items.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(result.meta).toEqual({ total: 4, page: 2, limit: 2 });
    const [detailArgs] = idsFindMany.mock.calls[1] as [
      { where: { id: { in: string[] } } },
    ];
    expect(detailArgs.where.id.in).toEqual(['s1', 's3']);
  });

  it('số liệu gom theo đúng phạm vi sinh viên và kỳ đang lọc (RULE 2)', async () => {
    await sortService.list(lecturerUser, {
      sortBy: 'absentSessions',
      term: 'FA26',
    });
    const [idArgs] = idsFindMany.mock.calls[0] as [
      { where: { AND?: unknown[] } },
    ];
    // SV lớp mình dạy TRONG FA26 — không lọt SV kỳ trước nay học lớp người khác.
    expect(idArgs.where.AND).toEqual([
      {
        enrollments: {
          some: {
            AND: [
              { classSection: { term: 'FA26' } },
              { classSection: { lecturerId: 'l' } },
            ],
          },
        },
      },
    ]);
    const [groupArgs] = enrollmentGroupBy.mock.calls[0] as [
      {
        by: string[];
        where: { classSection: unknown; student: { AND?: unknown[] } };
      },
    ];
    expect(groupArgs.by).toEqual(['studentId']);
    expect(groupArgs.where.classSection).toEqual({ term: 'FA26' });
    expect(groupArgs.where.student.AND).toEqual(idArgs.where.AND);
  });

  it('gom theo lớp (A→Z) trước, rồi mới xếp theo chỉ số trong từng lớp', async () => {
    idsFindMany.mockReset();
    idsFindMany.mockResolvedValueOnce([
      { id: 's1', studentCode: 'SE001', classCode: 'SE1902' },
      { id: 's2', studentCode: 'SE002', classCode: 'SE1901' },
      { id: 's3', studentCode: 'SE003', classCode: 'SE1902' },
      { id: 's4', studentCode: 'SE004', classCode: 'SE1901' },
    ]);
    idsFindMany.mockImplementationOnce(
      ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ id, enrollments: [] }))),
    );
    // s2=7, s4=null (lớp SE1901); s1=2, s3=2 (lớp SE1902)
    const result = await sortService.list(adminUser, {
      sortBy: 'absentSessions',
      sortDir: 'desc',
    });
    expect(result.items.map((s) => s.id)).toEqual(['s2', 's4', 's1', 's3']);
    const [idArgs] = idsFindMany.mock.calls[0] as [
      { select: Record<string, boolean> },
    ];
    expect(idArgs.select).toEqual({
      id: true,
      studentCode: true,
      classCode: true,
    });
  });

  it('cảnh báo mở gom theo phạm vi và bỏ cảnh báo đã xử lý', async () => {
    await sortService.list(lecturerUser, { sortBy: 'openAlerts' });
    const [groupArgs] = alertGroupBy.mock.calls[0] as [
      { where: { status: unknown; student: { AND?: unknown[] } } },
    ];
    expect(groupArgs.where.status).toEqual({ not: 'RESOLVED' });
    expect(groupArgs.where.student.AND).toEqual(LECTURER_SCOPE);
  });
});
