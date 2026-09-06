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
    expect(args.where.AND).toEqual(LECTURER_SCOPE);
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
    const studentGroupBy = jest
      .fn()
      .mockResolvedValue([{ classCode: 'SE1901' }, { classCode: 'SE1902' }]);
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
    const localPrisma = {
      student: { groupBy: studentGroupBy },
      major: { findMany: majorFindMany },
      classSection: { groupBy: sectionGroupBy, findMany: sectionFindMany },
      staff: { findMany: staffFindMany },
    } as unknown as PrismaService;
    return {
      service: new StudentsService(localPrisma, audit),
      studentGroupBy,
      majorFindMany,
      sectionGroupBy,
      staffFindMany,
      sectionFindMany,
    };
  }

  it('trả về 5 danh sách option ở dạng phẳng', async () => {
    const { service: local } = setup();

    await expect(local.filterOptions(adminUser)).resolves.toEqual({
      terms: ['SU25', 'SP25'],
      classCodes: ['SE1901', 'SE1902'],
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
    });
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
