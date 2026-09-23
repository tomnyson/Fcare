import { PrismaClient } from '@prisma/client';

describe('Staff Role & Data Integrity', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('phải có chỉ mục duy nhất staff_staffCode_key trong PostgreSQL', async () => {
    const indexes: Array<{ indexname: string }> = await prisma.$queryRawUnsafe(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'staff' AND indexname = 'staff_staffCode_key';
    `);

    expect(indexes.length).toBe(1);
    expect(indexes[0].indexname).toBe('staff_staffCode_key');
  });

  it('không được có bất kỳ mã nhân viên trùng lặp nào trong bảng staff', async () => {
    const duplicates: Array<{ staffCode: string; count: bigint }> =
      await prisma.$queryRawUnsafe(`
      SELECT "staffCode", COUNT(*) as count 
      FROM staff 
      GROUP BY "staffCode" 
      HAVING COUNT(*) > 1;
    `);

    expect(duplicates).toEqual([]);
  });

  it('tài khoản admin khi query bằng prisma.staff.findUnique phải trả về đầy đủ vai trò ADMIN', async () => {
    const admin = await prisma.staff.findUnique({
      where: { staffCode: 'admin' },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    expect(admin).not.toBeNull();
    const roleKeys = admin?.roles.map((r) => r.role.key) ?? [];
    expect(roleKeys).toContain('ADMIN');
  });
});
