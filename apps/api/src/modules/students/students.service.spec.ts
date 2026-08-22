import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
  where: { majorId?: string | null; departmentId?: string };
}

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

  it('missingMajor không phá scope bộ môn của giảng viên', async () => {
    await service.list(lecturerUser, {
      missingMajor: true,
    });
    const [args] = findMany.mock.calls[0] as [FindManyArgs];
    expect(args.where.majorId).toBeNull();
    expect(args.where.departmentId).toBe('dept-1');
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
