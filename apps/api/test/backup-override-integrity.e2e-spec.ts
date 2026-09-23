import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { BackupService } from '../src/modules/backup/backup.service';
import { PgRunnerService } from '../src/modules/backup/pg-runner.service';

describe('Backup Restore Override & Anti-Duplication Integrity (E2E)', () => {
  let service: BackupService;
  let prisma: PrismaService;
  const testStorageDir = path.join(__dirname, 'test-e2e-storage');
  const dirtyStaffCode = 'dirty.test.staff';

  /**
   * Xoá dữ liệu rác còn sót lại từ lần chạy trước.
   * Nếu bước restore thất bại giữa chừng, bản ghi rác vẫn nằm lại trong DB và
   * mọi lần chạy sau đều hỏng ở bước `staff.create` do trùng unique `staffCode`.
   * Dọn trước và sau mỗi lần chạy để test luôn lặp lại được.
   */
  const removeDirtyStaff = () =>
    prisma.staff.deleteMany({ where: { staffCode: dirtyStaffCode } });

  beforeAll(async () => {
    if (!fs.existsSync(testStorageDir)) {
      fs.mkdirSync(testStorageDir, { recursive: true });
    }

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: path.resolve(__dirname, '../.env'),
        }),
      ],
      providers: [
        BackupService,
        PgRunnerService,
        PrismaService,
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string, defaultValue?: string) => {
          if (key === 'BACKUP_STORAGE_DIR') return testStorageDir;
          if (key === 'DATABASE_URL') return process.env.DATABASE_URL;
          return defaultValue;
        },
      })
      .compile();

    service = module.get<BackupService>(BackupService);
    prisma = module.get<PrismaService>(PrismaService);

    await removeDirtyStaff();
  });

  afterAll(async () => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
    await removeDirtyStaff();
    await prisma.$disconnect();
  });

  it('khi phục hồi backup, phải xóa sạch dữ liệu thừa, không nhân đôi và bảo toàn unique index', async () => {
    // 1. Tạo bản backup chuẩn ban đầu
    const cleanBackup = await service.createBackup({
      type: 'MANUAL',
      comment: 'Clean Baseline for Override Test',
    });
    expect(fs.existsSync(cleanBackup.filepath)).toBe(true);

    const initialStaffCount = await prisma.staff.count();

    // 2. Chèn dữ liệu giả lập "rác / thay đổi sau backup"
    const dirtyStaff = await prisma.staff.create({
      data: {
        staffCode: dirtyStaffCode,
        fullName: 'Nhân viên rác thử nghiệm ghi đè',
        passwordHash: 'dummy_hash',
      },
    });
    expect(dirtyStaff.id).toBeDefined();

    const countWithDirty = await prisma.staff.count();
    expect(countWithDirty).toBe(initialStaffCount + 1);

    // 3. Thực hiện restore bản cleanBackup
    const restoreResult = await service.restoreBackup(cleanBackup.id, {
      confirmation: 'XAC NHAN',
      staffId: 'admin-tester',
    });
    expect(restoreResult.success).toBe(true);

    // 4. Kiểm tra tính toàn vẹn sau khi restore:
    // a) Dữ liệu rác dirtyStaffCode phải biến mất hoàn toàn (đã bị ghi đè sạch sẽ)
    const foundDirty = await prisma.staff.findUnique({
      where: { staffCode: dirtyStaffCode },
    });
    expect(foundDirty).toBeNull();

    // b) Số lượng staff phải quay về chính xác số ban đầu
    const countAfterRestore = await prisma.staff.count();
    expect(countAfterRestore).toBe(initialStaffCount);

    // c) Không có bất kỳ mã nhân viên nào bị trùng lặp
    const duplicates: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(`
      SELECT "staffCode", count(*) 
      FROM staff 
      GROUP BY "staffCode" 
      HAVING count(*) > 1;
    `);
    expect(duplicates).toEqual([]);

    // d) Unique index staff_staffCode_key phải tồn tại nguyên vẹn
    const indexes: Array<{ indexname: string }> = await prisma.$queryRawUnsafe(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'staff' AND indexname = 'staff_staffCode_key';
    `);
    expect(indexes.length).toBe(1);

    // e) Tài khoản admin phải có đầy đủ vai trò ADMIN
    const admin = await prisma.staff.findUnique({
      where: { staffCode: 'admin' },
      include: { roles: { include: { role: true } } },
    });
    expect(admin).not.toBeNull();
    const roles = admin?.roles.map((r) => r.role.key) ?? [];
    expect(roles).toContain('ADMIN');
  });
});
