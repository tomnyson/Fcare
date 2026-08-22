import type { ImportContext, ParsedRow, PrismaTx } from '../types';
import { ScheduleCommitter } from './schedule.committer';

const BASE = {
  block: 1,
  slot: 'S1',
  weekdays: '246',
  room: 'P301',
  capacity: 30,
  trainingTime: 'AM',
  startDate: null,
  totalHours: 45,
};

/** Hình dạng tham số gọi `classSection.create` — chỉ để test đọc lại an toàn kiểu. */
interface CreateSectionArgs {
  data: {
    code: string;
    term: string;
    subjectId: string;
    lecturerId: string | null;
    startDate: Date | null;
  };
}

function row(payload: Record<string, unknown>, rowIndex = 9): ParsedRow {
  return { sheet: 'BL1+BL2', rowIndex, payload };
}

function makeTx() {
  return {
    subject: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'sub-ita', code: 'ITA107' }]),
    },
    staff: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'gv-1', fullName: 'Nguyễn Văn Thật', username: null },
        ]),
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

const ctx = { term: 'SU26' } as ImportContext;

describe('ScheduleCommitter', () => {
  const committer = new ScheduleCommitter();

  it('tạo lớp mới với mã ghép mã môn + lớp + học kỳ', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({
          subjectCode: 'ITA107',
          classCode: 'AI21301',
          lecturerName: null,
          ...BASE,
        }),
      ],
      tx,
      ctx,
    );
    const [createArgs] = tx.classSection.create.mock.calls[0] as [
      CreateSectionArgs,
    ];
    expect(createArgs.data).toMatchObject({
      code: 'ITA107-AI21301-SU26',
      term: 'SU26',
      subjectId: 'sub-ita',
      lecturerId: null,
    });
  });

  it('gán lecturerId khi tên giảng viên khớp Staff', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({
          subjectCode: 'ITA107',
          classCode: 'AI21301',
          lecturerName: 'Nguyễn Văn Thật',
          ...BASE,
        }),
      ],
      tx,
      ctx,
    );
    const [createArgs] = tx.classSection.create.mock.calls[0] as [
      CreateSectionArgs,
    ];
    expect(createArgs.data.lecturerId).toBe('gv-1');
  });

  it('tên giảng viên không khớp Staff nào → lecturerId null, KHÔNG tạo Staff mới', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [
        row({
          subjectCode: 'ITA107',
          classCode: 'AI21301',
          lecturerName: 'Người Lạ',
          ...BASE,
        }),
      ],
      tx,
      ctx,
    );
    const [createArgs] = tx.classSection.create.mock.calls[0] as [
      CreateSectionArgs,
    ];
    expect(createArgs.data.lecturerId).toBeNull();
    expect(result.created).toBe(1);
  });

  it('khớp tên bỏ qua hoa thường và khoảng trắng thừa', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({
          subjectCode: 'ITA107',
          classCode: 'AI21301',
          lecturerName: '  nguyễn văn thật ',
          ...BASE,
        }),
      ],
      tx,
      ctx,
    );
    const [createArgs] = tx.classSection.create.mock.calls[0] as [
      CreateSectionArgs,
    ];
    expect(createArgs.data.lecturerId).toBe('gv-1');
  });

  it('môn chưa có trong DB → bỏ qua dòng, không tạo lớp mồ côi', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [
        row({
          subjectCode: 'KHONGCO',
          classCode: 'AI21301',
          lecturerName: null,
          ...BASE,
        }),
      ],
      tx,
      ctx,
    );
    expect(tx.classSection.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('lớp đã tồn tại theo (code, term) → cập nhật, không tạo trùng', async () => {
    const tx = makeTx();
    tx.classSection.findMany.mockResolvedValue([
      { id: 'cs-1', code: 'ITA107-AI21301-SU26' },
    ]);
    const result = await committer.commit(
      [
        row({
          subjectCode: 'ITA107',
          classCode: 'AI21301',
          lecturerName: null,
          ...BASE,
        }),
      ],
      tx,
      ctx,
    );
    expect(tx.classSection.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cs-1' } }),
    );
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
  });

  it('chuyển startDate ISO thành Date', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({
          subjectCode: 'ITA107',
          classCode: 'AI21301',
          lecturerName: null,
          ...BASE,
          startDate: '2026-05-11T00:00:00.000Z',
        }),
      ],
      tx,
      ctx,
    );
    const [createArgs] = tx.classSection.create.mock.calls[0] as [
      CreateSectionArgs,
    ];
    expect(createArgs.data.startDate).toBeInstanceOf(Date);
  });

  it('nạp toàn bộ Staff một lần, KHÔNG lọc bằng where.fullName.in', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({
          subjectCode: 'ITA107',
          classCode: 'AI21301',
          lecturerName: 'Nguyễn Văn Thật',
          ...BASE,
        }),
      ],
      tx,
      ctx,
    );
    expect(tx.staff.findMany).toHaveBeenCalledTimes(1);
    const [findManyArgs] = tx.staff.findMany.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(findManyArgs).not.toHaveProperty('where');
  });

  it('khớp giảng viên theo username khi không khớp họ tên nào', async () => {
    const tx = makeTx();
    tx.staff.findMany.mockResolvedValue([
      { id: 'gv-user', fullName: 'Ai Đó Không Khớp', username: 'SonLH32' },
    ]);
    await committer.commit(
      [
        row({
          subjectCode: 'ITA107',
          classCode: 'AI21301',
          lecturerName: 'sonlh32',
          ...BASE,
        }),
      ],
      tx,
      ctx,
    );
    const [createArgs] = tx.classSection.create.mock.calls[0] as [
      CreateSectionArgs,
    ];
    expect(createArgs.data.lecturerId).toBe('gv-user');
  });

  it('họ tên được ưu tiên hơn username khi cả hai cùng khớp cùng một chuỗi', async () => {
    const tx = makeTx();
    tx.staff.findMany.mockResolvedValue([
      { id: 'by-name', fullName: 'Son Le', username: null },
      { id: 'by-username', fullName: 'Người Khác', username: 'Son Le' },
    ]);
    await committer.commit(
      [
        row({
          subjectCode: 'ITA107',
          classCode: 'AI21301',
          lecturerName: 'Son Le',
          ...BASE,
        }),
      ],
      tx,
      ctx,
    );
    const [createArgs] = tx.classSection.create.mock.calls[0] as [
      CreateSectionArgs,
    ];
    expect(createArgs.data.lecturerId).toBe('by-name');
  });

  it('mã lớp học phần trùng trong cùng lô (khác block) → không ghi đè, tính skipped', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [
        row(
          {
            subjectCode: 'ITA107',
            classCode: 'AI21301',
            lecturerName: null,
            ...BASE,
            block: 1,
          },
          9,
        ),
        row(
          {
            subjectCode: 'ITA107',
            classCode: 'AI21301',
            lecturerName: null,
            ...BASE,
            block: 2,
          },
          10,
        ),
      ],
      tx,
      ctx,
    );
    expect(result).toEqual({ created: 1, updated: 0, skipped: 1 });
    expect(tx.classSection.create).toHaveBeenCalledTimes(1);
    expect(tx.classSection.update).not.toHaveBeenCalled();
  });
});
