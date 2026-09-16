import type { ImportContext, ParsedRow, PrismaTx } from '../types';
import { SectionListCommitter } from './section-list.committer';

const BASE = {
  code: 'GD21301-MUL2123',
  classCode: 'GD21301',
  subjectCode: 'MUL2123',
  block: 1,
  slot: '1',
  room: 'F302',
  capacity: 29,
  startDate: '2026-05-11T00:00:00.000Z',
  lecturerUsername: 'dungnth6',
};

interface CreateSectionArgs {
  data: {
    code: string;
    term: string;
    subjectId: string;
    lecturerId: string | null;
    startDate: Date | null;
    block: number | null;
    slot: string | null;
    room: string | null;
    capacity: number | null;
  };
}

function row(payload: Record<string, unknown>, rowIndex = 2): ParsedRow {
  return { sheet: 'Danh_sach_lop', rowIndex, payload };
}

function makeTx() {
  return {
    subject: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'sub-mul', code: 'MUL2123' }]),
    },
    staff: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'gv-1', username: 'dungnth6' }]),
    },
    classSection: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'cs-new' }),
      update: jest.fn().mockResolvedValue({ id: 'cs-1' }),
    },
  } as unknown as PrismaTx & {
    subject: { findMany: jest.Mock };
    staff: { findMany: jest.Mock };
    classSection: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
}

/**
 * Đối số của lần gọi đầu tiên. `jest.Mock.mock.calls` là `any[][]` nên đọc
 * trực tiếp sẽ vi phạm lint no-unsafe-member-access — ép kiểu một lần ở đây.
 */
function firstArg<T>(mock: jest.Mock): T {
  const calls = mock.mock.calls as unknown as T[][];
  return calls[0][0];
}

const ctx = { term: 'SU26' } as ImportContext;

describe('SectionListCommitter', () => {
  const committer = new SectionListCommitter();

  it('tạo lớp học phần mới với mã ghép tên lớp + mã môn', async () => {
    const tx = makeTx();

    const result = await committer.commit([row(BASE)], tx, ctx);

    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
    const args = firstArg<CreateSectionArgs>(tx.classSection.create);
    expect(args.data.code).toBe('GD21301-MUL2123');
    expect(args.data.term).toBe('SU26');
    expect(args.data.subjectId).toBe('sub-mul');
    expect(args.data.lecturerId).toBe('gv-1');
    expect(args.data.startDate).toEqual(new Date('2026-05-11T00:00:00.000Z'));
    expect(args.data.capacity).toBe(29);
  });

  it('cập nhật lớp đã tồn tại thay vì tạo trùng', async () => {
    const tx = makeTx();
    tx.classSection.findMany.mockResolvedValue([
      { id: 'cs-1', code: 'GD21301-MUL2123' },
    ]);

    const result = await committer.commit([row(BASE)], tx, ctx);

    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(tx.classSection.create).not.toHaveBeenCalled();
  });

  it('bỏ qua dòng có môn chưa nằm trong danh mục', async () => {
    const tx = makeTx();

    const result = await committer.commit(
      [row({ ...BASE, subjectCode: 'ENT2127', code: 'GD21301-ENT2127' })],
      tx,
      ctx,
    );

    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(tx.classSection.create).not.toHaveBeenCalled();
  });

  it('để trống giảng viên khi username không khớp nhân sự nào', async () => {
    const tx = makeTx();

    await committer.commit(
      [row({ ...BASE, lecturerUsername: 'khongcoai' })],
      tx,
      ctx,
    );

    const args = firstArg<CreateSectionArgs>(tx.classSection.create);
    expect(args.data.lecturerId).toBeNull();
  });

  it('khớp username không phân biệt hoa thường', async () => {
    const tx = makeTx();

    await committer.commit(
      [row({ ...BASE, lecturerUsername: 'DungNTH6' })],
      tx,
      ctx,
    );

    const args = firstArg<CreateSectionArgs>(tx.classSection.create);
    expect(args.data.lecturerId).toBe('gv-1');
  });

  it('khớp giảng viên theo staffCode (manv) không phân biệt hoa thường', async () => {
    const tx = makeTx();
    tx.staff.findMany.mockResolvedValue([
      { id: 'gv-son', staffCode: 'SONLH32', username: null },
    ]);

    await committer.commit(
      [row({ ...BASE, lecturerUsername: 'sonlh32' })],
      tx,
      ctx,
    );

    const args = firstArg<CreateSectionArgs>(tx.classSection.create);
    expect(args.data.lecturerId).toBe('gv-son');
  });

  it('khớp môn học theo altSubjectCode (mã chuyển đổi) khi mã môn không tìm thấy', async () => {
    const tx = makeTx();
    tx.subject.findMany.mockResolvedValue([{ id: 'sub-soa', code: 'SOA204' }]);

    const result = await committer.commit(
      [
        row({
          ...BASE,
          subjectCode: 'SOA2042',
          altSubjectCode: 'SOA204',
          code: 'SA22301-SOA2042',
        }),
      ],
      tx,
      ctx,
    );

    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
    const args = firstArg<CreateSectionArgs>(tx.classSection.create);
    expect(args.data.subjectId).toBe('sub-soa');
  });

  it('chỉ ghi dòng đầu khi cùng một mã lớp xuất hiện hai lần', async () => {
    const tx = makeTx();

    const result = await committer.commit([row(BASE), row(BASE, 3)], tx, ctx);

    expect(result).toEqual({ created: 1, updated: 0, skipped: 1 });
    expect(tx.classSection.create).toHaveBeenCalledTimes(1);
  });

  it('chỉ tra cứu lớp trong đúng kỳ đang import', async () => {
    const tx = makeTx();

    await committer.commit([row(BASE)], tx, ctx);

    const args = firstArg<{ where: { term: string } }>(
      tx.classSection.findMany,
    );
    expect(args.where.term).toBe('SU26');
  });

  it('tự động tạo môn học mới nếu môn học chưa có trong hệ thống', async () => {
    const tx = makeTx();
    tx.subject.findMany.mockResolvedValue([]);
    (tx as any).department = {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'dept-cntt', code: 'CNTT' }]),
    };
    (tx.subject as any).create = jest.fn().mockResolvedValue({
      id: 'sub-new-soa',
      code: 'SOA210',
    });

    const result = await committer.commit(
      [
        row({
          ...BASE,
          subjectCode: 'SOA210',
          subjectName: 'Thiết lập và quản trị mạng máy tính với AI',
          code: 'SA21301-SOA210',
        }),
      ],
      tx,
      ctx,
    );

    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect((tx.subject as any).create).toHaveBeenCalledWith({
      data: {
        code: 'SOA210',
        name: 'Thiết lập và quản trị mạng máy tính với AI',
        credits: 3,
        departmentId: 'dept-cntt',
      },
      select: { id: true, code: true },
    });
    const args = firstArg<CreateSectionArgs>(tx.classSection.create);
    expect(args.data.subjectId).toBe('sub-new-soa');
  });
});
