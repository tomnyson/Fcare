import { BadRequestException } from '@nestjs/common';
import type { RoleKey } from '@fcare/shared-types';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { AdminService } from './admin.service';

interface FindManyArgs {
  select: Record<string, unknown>;
}

function makePrisma() {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    staff: { findMany },
  } as unknown as PrismaService;
  return { prisma, findMany };
}

/** Prisma đủ dùng cho `update()`: nạp bản ghi hiện có rồi chạy transaction. */
function makeUpdatePrisma(existing: {
  departmentId: string | null;
  roles: readonly RoleKey[];
}) {
  const staffUpdate = jest.fn().mockResolvedValue({ id: 'target' });
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const createMany = jest.fn().mockResolvedValue({ count: 1 });
  const tx = {
    staffRole: { deleteMany, createMany },
    refreshToken: { updateMany: jest.fn() },
    staff: { update: staffUpdate },
  };
  const prisma = {
    staff: {
      findUnique: jest.fn().mockResolvedValue({
        departmentId: existing.departmentId,
        roles: existing.roles.map((key) => ({ role: { key } })),
      }),
    },
    role: {
      findMany: jest.fn(({ where }: { where: { key: { in: RoleKey[] } } }) =>
        Promise.resolve(
          where.key.in.map((key) => ({ id: `role-${key}`, key })),
        ),
      ),
    },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  return { prisma, deleteMany, createMany, staffUpdate };
}

const audit = { log: jest.fn() } as unknown as AuditService;

describe('AdminService — danh sách nhân viên trả kèm loại GV', () => {
  beforeEach(() => jest.clearAllMocks());

  it('select trả kèm lecturerType (Task 13: cột "Loại GV")', async () => {
    const { prisma, findMany } = makePrisma();
    await new AdminService(prisma, audit).list({});
    const [args] = findMany.mock.calls[0] as [FindManyArgs];
    expect(args.select.lecturerType).toBe(true);
  });
});

describe('AdminService.update — gán vai trò', () => {
  beforeEach(() => jest.clearAllMocks());

  it('thay toàn bộ vai trò cũ bằng danh sách mới', async () => {
    const { prisma, deleteMany, createMany } = makeUpdatePrisma({
      departmentId: 'dept-1',
      roles: ['LECTURER'],
    });

    await new AdminService(prisma, audit).update('admin-1', 'target', {
      roles: ['LECTURER', 'HEAD_OF_DEPT'],
    });

    expect(deleteMany).toHaveBeenCalledWith({ where: { staffId: 'target' } });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { staffId: 'target', roleId: 'role-LECTURER' },
        { staffId: 'target', roleId: 'role-HEAD_OF_DEPT' },
      ],
    });
  });

  it('chặn gán GV/TBM cho nhân viên chưa có bộ môn (RULE 2)', async () => {
    const { prisma } = makeUpdatePrisma({
      departmentId: null,
      roles: ['TRAINING_OFFICER'],
    });

    await expect(
      new AdminService(prisma, audit).update('admin-1', 'target', {
        roles: ['LECTURER'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('chặn admin tự gỡ vai trò ADMIN của chính mình', async () => {
    const { prisma, deleteMany } = makeUpdatePrisma({
      departmentId: null,
      roles: ['ADMIN'],
    });

    await expect(
      new AdminService(prisma, audit).update('admin-1', 'admin-1', {
        roles: ['TRAINING_OFFICER'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('chặn admin tự khóa tài khoản của chính mình', async () => {
    const { prisma } = makeUpdatePrisma({
      departmentId: null,
      roles: ['ADMIN'],
    });

    await expect(
      new AdminService(prisma, audit).update('admin-1', 'admin-1', {
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('vẫn cho admin tự đổi họ tên khi giữ nguyên vai trò ADMIN', async () => {
    const { prisma, staffUpdate } = makeUpdatePrisma({
      departmentId: null,
      roles: ['ADMIN'],
    });

    await new AdminService(prisma, audit).update('admin-1', 'admin-1', {
      fullName: 'Nguyễn Quản Trị',
      roles: ['ADMIN', 'TRAINING_OFFICER'],
    });

    expect(staffUpdate).toHaveBeenCalled();
  });
});
