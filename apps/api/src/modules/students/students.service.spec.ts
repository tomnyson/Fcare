import { NotFoundException } from '@nestjs/common';
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

const findMany = jest.fn().mockResolvedValue([]);
const count = jest.fn().mockResolvedValue(0);
const updateMany = jest.fn();
const transaction = jest.fn().mockResolvedValue([[], 0]);
const prisma = {
  student: { findMany, count, updateMany },
  $transaction: transaction,
} as unknown as PrismaService;
const auditLog = jest.fn();
const audit = { log: auditLog } as unknown as AuditService;
const service = new StudentsService(prisma, audit);

interface FindManyArgs {
  where: { majorId?: string | null; departmentId?: string };
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
    updateMany.mockResolvedValue({ count: 2 });
    await service.bulkAssignMajor(lecturerUser, {
      studentIds: ['s-1', 's-2'],
      majorId: 'mj-1',
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s-1', 's-2'] }, departmentId: 'dept-1' },
      data: { majorId: 'mj-1' },
    });
  });

  it('trả về đúng số bản ghi thực sự được cập nhật', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const result = await service.bulkAssignMajor(adminUser, {
      studentIds: ['s-1', 's-2'],
      majorId: 'mj-1',
    });
    expect(result).toEqual({ updated: 1 });
  });

  it('không sinh viên nào thuộc phạm vi → NotFoundException, không ghi audit', async () => {
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
    updateMany.mockRejectedValue(prismaError('P2003'));
    await expect(
      service.bulkAssignMajor(adminUser, {
        studentIds: ['s-1'],
        majorId: 'mj-khong-co',
      }),
    ).rejects.toThrow('Ngành học không tồn tại.');
  });

  it('ghi audit log kèm số lượng đã gán', async () => {
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
        metadata: { majorId: 'mj-1', updated: 2 },
      }),
    );
  });
});
