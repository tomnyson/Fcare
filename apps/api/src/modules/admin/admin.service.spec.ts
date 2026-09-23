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

const auditLog = jest.fn();
const audit = { log: auditLog } as unknown as AuditService;

describe('AdminService — danh sách nhân viên trả kèm loại GV', () => {
  beforeEach(() => jest.clearAllMocks());

  it('select trả kèm lecturerType (Task 13: cột "Loại GV")', async () => {
    const { prisma, findMany } = makePrisma();
    await new AdminService(prisma, audit).list({});
    const [args] = findMany.mock.calls[0] as [FindManyArgs];
    expect(args.select.lecturerType).toBe(true);
  });
});

describe('AdminService.bulkAssignEmails', () => {
  it('cập nhật email công vụ và ghi audit', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'staff-1' });
    const findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'staff-1', staffCode: 'GV001' }]);
    const prisma = {
      staff: { findMany, update },
      $transaction: jest.fn((input: unknown) =>
        typeof input === 'function'
          ? (input as (client: PrismaService) => unknown)(prisma)
          : Promise.all(input as Promise<unknown>[]),
      ),
    } as unknown as PrismaService;
    const service = new AdminService(prisma, audit);
    await expect(
      service.bulkAssignEmails('admin-1', {
        mappings: [{ staffCode: 'GV001', email: 'gv001@fpt.edu.vn' }],
      }),
    ).resolves.toEqual({
      updated: 1,
      newlyAssigned: 1,
      overridden: 0,
      skipped: 0,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { email: 'gv001@fpt.edu.vn' },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_BULK_ASSIGN_STAFF_EMAIL' }),
    );
  });

  it('từ chối email ngoài miền FPT', async () => {
    const prisma = {
      staff: { findMany: jest.fn() },
    } as unknown as PrismaService;
    await expect(
      new AdminService(prisma, audit).bulkAssignEmails('admin-1', {
        mappings: [{ staffCode: 'GV001', email: 'outside@example.com' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('khớp mã nhân viên không phân biệt hoa thường và chuẩn hóa email về chữ thường', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'staff-1' });
    const findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'staff-1', staffCode: 'VANDTB2' }]);
    const prisma = {
      staff: { findMany, update },
      $transaction: jest.fn((input: unknown) =>
        typeof input === 'function'
          ? (input as (client: PrismaService) => unknown)(prisma)
          : Promise.all(input as Promise<unknown>[]),
      ),
    } as unknown as PrismaService;
    const service = new AdminService(prisma, audit);

    // Input có mã chữ thường vandtb2, email có hoa Dieuvtc@FE.EDU.VN
    await expect(
      service.bulkAssignEmails('admin-1', {
        mappings: [{ staffCode: 'vandtb2', email: 'VanDTB2@FE.EDU.VN' }],
      }),
    ).resolves.toEqual({
      updated: 1,
      newlyAssigned: 1,
      overridden: 0,
      skipped: 0,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { email: 'vandtb2@fe.edu.vn' },
    });
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

describe('AdminService — xuất và tạo file Excel template email', () => {
  it('tạo template buffer với cấu trúc manv và email', async () => {
    const prisma = {} as unknown as PrismaService;
    const service = new AdminService(prisma, audit);
    const buffer = await service.getEmailTemplateBuffer();
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('xuất danh sách email nhân viên ra buffer Excel', async () => {
    const prisma = {
      staff: {
        findMany: jest.fn().mockResolvedValue([
          { staffCode: 'VANDTB2', email: 'vandtb2@fe.edu.vn' },
          { staffCode: 'HIEUNT249', email: 'hieunt249@fe.edu.vn' },
        ]),
      },
    } as unknown as PrismaService;
    const service = new AdminService(prisma, audit);
    const buffer = await service.exportEmailsBuffer();
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });
});

describe('AdminService — bulkAssignEmails và overrideExisting', () => {
  it('cho phép ghi đè email nếu overrideExisting = true', async () => {
    const staffUpdate = jest.fn().mockResolvedValue({});
    const staffUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const deleteOAuth = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      staff: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 's1', staffCode: 'VANDTB2', email: 'old@fe.edu.vn' },
            { id: 's2', staffCode: 'HIEUNT249', email: null },
          ])
          .mockResolvedValueOnce([]), // otherStaffWithSameEmail
        update: staffUpdate,
        updateMany: staffUpdateMany,
      },
      staffOAuthIdentity: {
        deleteMany: deleteOAuth,
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma),
      ),
    } as unknown as PrismaService;

    const service = new AdminService(prisma, audit);
    const result = await service.bulkAssignEmails('admin-1', {
      mappings: [
        { staffCode: 'VANDTB2', email: 'vandtb2@fe.edu.vn' },
        { staffCode: 'HIEUNT249', email: 'hieunt249@fe.edu.vn' },
      ],
      overrideExisting: true,
    });

    expect(result).toEqual({
      updated: 2,
      newlyAssigned: 1,
      overridden: 1,
      skipped: 0,
    });
    expect(staffUpdate).toHaveBeenCalledTimes(2);
    // Khi email cũ đổi sang email mới, OAuth identity cũ được xóa
    expect(deleteOAuth).toHaveBeenCalledWith({
      where: { staffId: 's1', provider: 'google' },
    });
  });

  it('bỏ qua nhân viên đã có email nếu overrideExisting = false', async () => {
    const staffUpdate = jest.fn().mockResolvedValue({});
    const staffUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const deleteOAuth = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      staff: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 's1', staffCode: 'VANDTB2', email: 'old@fe.edu.vn' },
            { id: 's2', staffCode: 'HIEUNT249', email: null },
          ])
          .mockResolvedValueOnce([]),
        update: staffUpdate,
        updateMany: staffUpdateMany,
      },
      staffOAuthIdentity: {
        deleteMany: deleteOAuth,
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma),
      ),
    } as unknown as PrismaService;

    const service = new AdminService(prisma, audit);
    const result = await service.bulkAssignEmails('admin-1', {
      mappings: [
        { staffCode: 'VANDTB2', email: 'vandtb2@fe.edu.vn' },
        { staffCode: 'HIEUNT249', email: 'hieunt249@fe.edu.vn' },
      ],
      overrideExisting: false,
    });

    expect(result).toEqual({
      updated: 1,
      newlyAssigned: 1,
      overridden: 0,
      skipped: 1,
    });
    // Chỉ cập nhật s2 (chưa có email)
    expect(staffUpdate).toHaveBeenCalledTimes(1);
    expect(staffUpdate).toHaveBeenCalledWith({
      where: { id: 's2' },
      data: { email: 'hieunt249@fe.edu.vn' },
    });
    expect(deleteOAuth).not.toHaveBeenCalled();
  });

  it('ghi đè toàn bộ nhân viên đã có email khi overrideExisting = true (re-import)', async () => {
    const staffUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      staff: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 's1', staffCode: 'VANDTB2', email: 'vandtb2@fe.edu.vn' },
            { id: 's2', staffCode: 'HIEUNT249', email: 'hieunt249@fe.edu.vn' },
          ])
          .mockResolvedValueOnce([]),
        update: staffUpdate,
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      staffOAuthIdentity: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma),
      ),
    } as unknown as PrismaService;

    const service = new AdminService(prisma, audit);
    const result = await service.bulkAssignEmails('admin-1', {
      mappings: [
        { staffCode: 'VANDTB2', email: 'vandtb2@fe.edu.vn' },
        { staffCode: 'HIEUNT249', email: 'hieunt249@fe.edu.vn' },
      ],
      overrideExisting: true,
    });

    expect(result).toEqual({
      updated: 2,
      newlyAssigned: 0,
      overridden: 2,
      skipped: 0,
    });
    expect(staffUpdate).toHaveBeenCalledTimes(2);
  });
});

describe('AdminService — listAuditLogs', () => {
  it('lọc theo action, staffCode, date range và phân trang đúng', async () => {
    const mockLogs = [
      {
        id: 'log-1',
        action: 'AUTH_LOGIN',
        entity: 'Staff',
        entityId: 'staff-1',
        metadata: { ip: '127.0.0.1' },
        createdAt: new Date('2026-09-20T10:00:00Z'),
        staff: {
          id: 'staff-1',
          staffCode: 'GV001',
          fullName: 'Nguyễn Văn A',
          email: 'gv001@fe.edu.vn',
        },
      },
    ];

    const findMany = jest.fn().mockResolvedValue(mockLogs);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      auditLog: { findMany, count },
    } as unknown as PrismaService;

    const service = new AdminService(prisma, audit);
    const result = await service.listAuditLogs({
      page: 1,
      limit: 20,
      action: 'AUTH_LOGIN',
      staffCode: 'GV001',
      from: '2026-09-20',
      to: '2026-09-21',
    });

    expect(result.items).toEqual(mockLogs);
    expect(result.meta).toEqual({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: { contains: 'AUTH_LOGIN', mode: 'insensitive' },
          staff: { staffCode: { contains: 'GV001', mode: 'insensitive' } },
        }) as unknown,
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});
