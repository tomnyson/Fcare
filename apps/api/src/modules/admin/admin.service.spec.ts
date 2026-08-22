import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { AdminService } from './admin.service';
import type { ListStaffQuery } from './dto/staff.dto';

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

const audit = {} as AuditService;

describe('AdminService — danh sách nhân viên trả kèm loại GV', () => {
  beforeEach(() => jest.clearAllMocks());

  it('select trả kèm lecturerType và username (Task 13: cột "Loại GV")', async () => {
    const { prisma, findMany } = makePrisma();
    await new AdminService(prisma, audit).list({} as ListStaffQuery);
    const [args] = findMany.mock.calls[0] as [FindManyArgs];
    expect(args.select.lecturerType).toBe(true);
    expect(args.select.username).toBe(true);
  });
});
