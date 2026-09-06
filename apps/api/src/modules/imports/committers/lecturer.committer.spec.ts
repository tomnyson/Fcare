import type { ImportContext, ParsedRow, PrismaTx } from '../types';
import { LecturerCommitter } from './lecturer.committer';

function row(payload: Record<string, unknown>, rowIndex = 2): ParsedRow {
  return { sheet: 'T.Kê', rowIndex, payload };
}

/** Hình dạng tham số gọi `staff.create` — chỉ để test đọc lại an toàn kiểu. */
interface CreateStaffArgs {
  data: {
    staffCode: string;
    username: string;
    fullName: string;
    lecturerType: 'FULL' | 'PART' | null;
    passwordHash: string;
    mustChangePassword: boolean;
    departmentId?: string | null;
  };
}

/** Hình dạng tham số gọi `staff.update`. */
interface UpdateStaffArgs {
  data: {
    fullName: string;
    lecturerType: 'FULL' | 'PART' | null;
    passwordHash?: string;
    departmentId?: string | null;
  };
}

function makeTx() {
  return {
    staff: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'staff-1',
          username: 'cu1',
          staffCode: 'CU1',
          departmentId: null,
        },
      ]),
      create: jest.fn().mockResolvedValue({ id: 'new-staff' }),
      update: jest.fn().mockResolvedValue({ id: 'staff-1' }),
    },
    role: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'role-lecturer' }),
    },
    staffRole: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    departmentAlias: {
      findMany: jest.fn().mockResolvedValue([
        { alias: 'CNTT', departmentId: 'dept-cntt' },
        { alias: 'UDPM', departmentId: 'dept-udpm' },
      ]),
    },
  } as unknown as PrismaTx & {
    staff: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    role: { findUniqueOrThrow: jest.Mock };
    staffRole: { createMany: jest.Mock };
    departmentAlias: { findMany: jest.Mock };
  };
}

const ctx = { term: 'SU26' } as ImportContext;

describe('LecturerCommitter', () => {
  const committer = new LecturerCommitter();

  it('tạo giảng viên mới kèm mật khẩu tạm và cờ buộc đổi mật khẩu', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ username: 'moi1', fullName: 'GV Mới', lecturerType: 'FULL' })],
      tx,
      ctx,
    );
    const [createArgs] = tx.staff.create.mock.calls[0] as [CreateStaffArgs];
    const data = createArgs.data;
    expect(data.mustChangePassword).toBe(true);
    expect(typeof data.passwordHash).toBe('string');
    expect(data.passwordHash.length).toBeGreaterThan(20);
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
  });

  it('KHÔNG ghi email hay bất kỳ trường PII nào', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ username: 'moi2', fullName: 'GV Hai', lecturerType: 'PART' })],
      tx,
      ctx,
    );
    const [createArgs] = tx.staff.create.mock.calls[0] as [CreateStaffArgs];
    const keys = Object.keys(createArgs.data);
    for (const banned of ['email', 'phone', 'address', 'cccd']) {
      expect(keys.some((key) => key.toLowerCase().includes(banned))).toBe(
        false,
      );
    }
  });

  it('gán vai trò LECTURER cho tài khoản mới', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ username: 'moi3', fullName: 'GV Ba', lecturerType: 'FULL' })],
      tx,
      ctx,
    );
    expect(tx.role.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { key: 'LECTURER' },
    });
    expect(tx.staffRole.createMany).toHaveBeenCalled();
  });

  it('username đã có → chỉ cập nhật họ tên và loại GV, KHÔNG đổi mật khẩu', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ username: 'cu1', fullName: 'Tên Mới', lecturerType: 'PART' })],
      tx,
      ctx,
    );
    const [updateArgs] = tx.staff.update.mock.calls[0] as [UpdateStaffArgs];
    const data = updateArgs.data;
    expect(data).toEqual({ fullName: 'Tên Mới', lecturerType: 'PART' });
    expect(data.passwordHash).toBeUndefined();
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
  });

  it('staffCode sinh từ username viết hoa', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ username: 'vandtb2', fullName: 'GV', lecturerType: 'FULL' })],
      tx,
      ctx,
    );
    const [createArgs] = tx.staff.create.mock.calls[0] as [CreateStaffArgs];
    expect(createArgs.data.staffCode).toBe('VANDTB2');
  });

  it('staffCode đã bị tài khoản khác chiếm → bỏ qua dòng, không ghi đè', async () => {
    const tx = makeTx();
    tx.staff.findMany.mockResolvedValue([
      { id: 'other', username: null, staffCode: 'TRUNG1' },
    ]);
    const result = await committer.commit(
      [row({ username: 'trung1', fullName: 'GV', lecturerType: 'FULL' })],
      tx,
      ctx,
    );
    expect(tx.staff.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });
});

/**
 * `Staff.departmentId` rỗng làm `deptFilter` trả `__no_department__` → giảng
 * viên không thấy sinh viên nào. Import phải điền bộ môn suy từ sheet phân công.
 */
describe('LecturerCommitter — gán bộ môn', () => {
  const committer = new LecturerCommitter();

  it('tài khoản mới nhận departmentId khớp alias bộ môn', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({
          username: 'moi1',
          fullName: 'GV Mới',
          lecturerType: 'FULL',
          deptAlias: 'CNTT',
        }),
      ],
      tx,
      ctx,
    );
    const [createArgs] = tx.staff.create.mock.calls[0] as [CreateStaffArgs];
    expect(createArgs.data.departmentId).toBe('dept-cntt');
  });

  it('khớp alias không phân biệt hoa thường và khoảng trắng thừa', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({
          username: 'moi2',
          fullName: 'GV Hai',
          lecturerType: 'FULL',
          deptAlias: '  udpm ',
        }),
      ],
      tx,
      ctx,
    );
    const [createArgs] = tx.staff.create.mock.calls[0] as [CreateStaffArgs];
    expect(createArgs.data.departmentId).toBe('dept-udpm');
  });

  it('alias lạ → để trống bộ môn, KHÔNG đoán', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({
          username: 'moi3',
          fullName: 'GV Ba',
          lecturerType: 'FULL',
          deptAlias: 'BM-LA',
        }),
      ],
      tx,
      ctx,
    );
    const [createArgs] = tx.staff.create.mock.calls[0] as [CreateStaffArgs];
    expect(createArgs.data.departmentId ?? null).toBeNull();
  });

  it('tài khoản cũ đang trống bộ môn → import điền vào (backfill)', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({
          username: 'cu1',
          fullName: 'Tên Mới',
          lecturerType: 'PART',
          deptAlias: 'CNTT',
        }),
      ],
      tx,
      ctx,
    );
    const [updateArgs] = tx.staff.update.mock.calls[0] as [UpdateStaffArgs];
    expect(updateArgs.data.departmentId).toBe('dept-cntt');
  });

  it('tài khoản cũ đã có bộ môn (admin gán tay) → KHÔNG ghi đè', async () => {
    const tx = makeTx();
    tx.staff.findMany.mockResolvedValue([
      {
        id: 'staff-1',
        username: 'cu1',
        staffCode: 'CU1',
        departmentId: 'dept-udpm',
      },
    ]);
    await committer.commit(
      [
        row({
          username: 'cu1',
          fullName: 'Tên Mới',
          lecturerType: 'PART',
          deptAlias: 'CNTT',
        }),
      ],
      tx,
      ctx,
    );
    const [updateArgs] = tx.staff.update.mock.calls[0] as [UpdateStaffArgs];
    expect(updateArgs.data.departmentId).toBeUndefined();
  });

  it('không suy được bộ môn (deptAlias null) → update không đụng tới departmentId', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({
          username: 'cu1',
          fullName: 'Tên Mới',
          lecturerType: 'PART',
          deptAlias: null,
        }),
      ],
      tx,
      ctx,
    );
    const [updateArgs] = tx.staff.update.mock.calls[0] as [UpdateStaffArgs];
    expect(updateArgs.data).toEqual({
      fullName: 'Tên Mới',
      lecturerType: 'PART',
    });
  });
});
