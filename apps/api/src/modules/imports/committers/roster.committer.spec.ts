import { StudentStatus } from '@prisma/client';
import type { ImportContext, ParsedRow, PrismaTx } from '../types';
import { RosterCommitter } from './roster.committer';

const BASE = {
  studentCode: 'PK04929',
  fullName: 'H Wiêm Adrơng',
  majorAlias: 'CHNA',
  classCode: 'PDP102.01',
  subjectCode: 'PDP102',
  sectionCode: 'PDP102.01-PDP102',
  status: StudentStatus.STUDYING as StudentStatus | null,
};

function rowsOf(...overrides: Partial<typeof BASE>[]): ParsedRow[] {
  return overrides.map((override, index) => ({
    sheet: 'roster',
    rowIndex: index + 2,
    payload: { ...BASE, ...override },
  }));
}

interface TxOverrides {
  students?: unknown[];
  enrollments?: unknown[];
  aliases?: unknown[];
  majors?: unknown[];
  sections?: unknown[];
}

function txMock(overrides: TxOverrides = {}) {
  return {
    subject: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'sub-pdp', code: 'PDP102', departmentId: 'dept-cn' },
        ]),
    },
    majorAlias: {
      findMany: jest.fn().mockResolvedValue(
        overrides.aliases ?? [
          {
            alias: 'CHNA',
            major: { id: 'major-tq', departmentId: 'dept-nn' },
          },
        ],
      ),
    },
    major: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          overrides.majors ?? [
            { id: 'major-ai', code: 'LTAI', departmentId: 'dept-cn' },
          ],
        ),
    },
    classSection: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          overrides.sections ?? [{ id: 'sec-1', code: 'PDP102.01-PDP102' }],
        ),
    },
    student: {
      findMany: jest.fn().mockResolvedValue(overrides.students ?? []),
      create: jest.fn().mockResolvedValue({ id: 'stu-new' }),
      update: jest.fn().mockResolvedValue({ id: 'stu-1' }),
    },
    enrollment: {
      findMany: jest.fn().mockResolvedValue(overrides.enrollments ?? []),
      create: jest.fn().mockResolvedValue({ id: 'enr-1' }),
    },
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

describe('RosterCommitter', () => {
  const committer = new RosterCommitter();

  it('tạo sinh viên mới với ngành và bộ môn lấy từ bảng ánh xạ mã ngành', async () => {
    const tx = txMock();
    const result = await committer.commit(
      rowsOf({}),
      tx as unknown as PrismaTx,
      ctx,
    );

    const args = firstArg<{ data: Record<string, unknown> }>(tx.student.create);
    expect(args.data).toMatchObject({
      studentCode: 'PK04929',
      fullName: 'H Wiêm Adrơng',
      classCode: 'PDP102.01',
      majorId: 'major-tq',
      departmentId: 'dept-nn',
      status: StudentStatus.STUDYING,
    });
    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: { studentId: 'stu-new', classSectionId: 'sec-1' },
    });
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
  });

  it('mã ngành chưa khai báo → majorId null, bộ môn lấy theo môn học', async () => {
    const tx = txMock({ aliases: [] });
    await committer.commit(rowsOf({}), tx as unknown as PrismaTx, ctx);

    const args = firstArg<{ data: Record<string, unknown> }>(tx.student.create);
    expect(args.data).toMatchObject({ majorId: null, departmentId: 'dept-cn' });
  });

  it('mã ngành ghi thẳng Major.code vẫn tra được dù chưa khai ánh xạ', async () => {
    const tx = txMock({ aliases: [] });
    await committer.commit(
      rowsOf({ majorAlias: 'LTAI' }),
      tx as unknown as PrismaTx,
      ctx,
    );

    const args = firstArg<{ data: Record<string, unknown> }>(tx.student.create);
    expect(args.data).toMatchObject({
      majorId: 'major-ai',
      departmentId: 'dept-cn',
    });
  });

  it('mã có hậu tố khoá tuyển sinh rơi về phần gốc: "LTAI01" → ngành LTAI', async () => {
    const tx = txMock({ aliases: [] });
    await committer.commit(
      rowsOf({ majorAlias: 'LTAI01' }),
      tx as unknown as PrismaTx,
      ctx,
    );

    const args = firstArg<{ data: Record<string, unknown> }>(tx.student.create);
    expect(args.data).toMatchObject({
      majorId: 'major-ai',
      departmentId: 'dept-cn',
    });
  });

  it('ánh xạ riêng cho mã có hậu tố thắng phần gốc', async () => {
    const tx = txMock({
      aliases: [
        { alias: 'LTAI01', major: { id: 'major-tq', departmentId: 'dept-nn' } },
      ],
    });
    await committer.commit(
      rowsOf({ majorAlias: 'LTAI01' }),
      tx as unknown as PrismaTx,
      ctx,
    );

    const args = firstArg<{ data: Record<string, unknown> }>(tx.student.create);
    expect(args.data).toMatchObject({ majorId: 'major-tq' });
  });

  it('mã không có hậu tố số vẫn để trống ngành — KHÔNG đoán', async () => {
    const tx = txMock({ aliases: [] });
    await committer.commit(
      rowsOf({ majorAlias: 'UI_DP' }),
      tx as unknown as PrismaTx,
      ctx,
    );

    const args = firstArg<{ data: Record<string, unknown> }>(tx.student.create);
    expect(args.data).toMatchObject({ majorId: null });
  });

  it('ánh xạ tay thắng mã ngành thật khi trùng khoá', async () => {
    const tx = txMock({
      aliases: [
        { alias: 'LTAI', major: { id: 'major-tq', departmentId: 'dept-nn' } },
      ],
    });
    await committer.commit(
      rowsOf({ majorAlias: 'LTAI' }),
      tx as unknown as PrismaTx,
      ctx,
    );

    const args = firstArg<{ data: Record<string, unknown> }>(tx.student.create);
    expect(args.data).toMatchObject({ majorId: 'major-tq' });
  });

  it('bỏ qua dòng khi lớp học phần chưa tồn tại — phải import danh sách lớp trước', async () => {
    const tx = txMock({ sections: [] });
    const result = await committer.commit(
      rowsOf({}),
      tx as unknown as PrismaTx,
      ctx,
    );

    expect(tx.student.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('bỏ qua dòng khi môn chưa có trong danh mục', async () => {
    const tx = txMock();
    tx.subject.findMany.mockResolvedValue([]);
    const result = await committer.commit(
      rowsOf({}),
      tx as unknown as PrismaTx,
      ctx,
    );

    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('ghi danh đã có → không tạo lại, tính vào updated', async () => {
    const tx = txMock({
      students: [
        {
          id: 'stu-1',
          studentCode: 'PK04929',
          fullName: 'H Wiêm Adrơng',
          majorId: 'major-tq',
          classCode: 'PDP102.01',
          status: StudentStatus.STUDYING,
        },
      ],
      enrollments: [{ studentId: 'stu-1', classSectionId: 'sec-1' }],
    });
    const result = await committer.commit(
      rowsOf({}),
      tx as unknown as PrismaTx,
      ctx,
    );

    expect(tx.enrollment.create).not.toHaveBeenCalled();
    expect(tx.student.update).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
  });

  it('cập nhật trạng thái khi file báo bảo lưu', async () => {
    const tx = txMock({
      students: [
        {
          id: 'stu-1',
          studentCode: 'PK04929',
          fullName: 'H Wiêm Adrơng',
          majorId: 'major-tq',
          classCode: 'PDP102.01',
          status: StudentStatus.STUDYING,
        },
      ],
    });
    await committer.commit(
      rowsOf({ status: StudentStatus.RESERVED }),
      tx as unknown as PrismaTx,
      ctx,
    );

    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 'stu-1' },
      data: { status: StudentStatus.RESERVED },
    });
  });

  it('nhãn trạng thái lạ (null) không ghi đè trạng thái đang có', async () => {
    const tx = txMock({
      students: [
        {
          id: 'stu-1',
          studentCode: 'PK04929',
          fullName: 'H Wiêm Adrơng',
          majorId: 'major-tq',
          classCode: 'PDP102.01',
          status: StudentStatus.DROPPED_OUT,
        },
      ],
    });
    await committer.commit(
      rowsOf({ status: null }),
      tx as unknown as PrismaTx,
      ctx,
    );

    expect(tx.student.update).not.toHaveBeenCalled();
  });

  it('không ghi đè lớp hành chính đã có bằng mã lớp học phần', async () => {
    const tx = txMock({
      students: [
        {
          id: 'stu-1',
          studentCode: 'PK04929',
          fullName: 'H Wiêm Adrơng',
          majorId: 'major-tq',
          classCode: 'SD20301',
          status: StudentStatus.STUDYING,
        },
      ],
    });
    await committer.commit(rowsOf({}), tx as unknown as PrismaTx, ctx);

    expect(tx.student.update).not.toHaveBeenCalled();
  });

  it('lấp lớp hành chính khi hồ sơ mới chỉ có mã lớp học phần', async () => {
    const tx = txMock({
      students: [
        {
          id: 'stu-1',
          studentCode: 'PK04929',
          fullName: 'H Wiêm Adrơng',
          majorId: 'major-tq',
          classCode: 'PDP102.01',
          status: StudentStatus.STUDYING,
        },
      ],
    });
    tx.subject.findMany.mockResolvedValue([
      { id: 'sub-dm', code: 'MUL2123', departmentId: 'dept-cn' },
    ]);
    tx.classSection.findMany.mockResolvedValue([
      { id: 'sec-9', code: 'DM21302-MUL2123' },
    ]);
    await committer.commit(
      rowsOf({
        classCode: 'DM21302',
        subjectCode: 'MUL2123',
        sectionCode: 'DM21302-MUL2123',
      }),
      tx as unknown as PrismaTx,
      ctx,
    );

    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 'stu-1' },
      data: { classCode: 'DM21302' },
    });
  });

  it('không ghi đè ngành admin đã gán tay', async () => {
    const tx = txMock({
      students: [
        {
          id: 'stu-1',
          studentCode: 'PK04929',
          fullName: 'H Wiêm Adrơng',
          majorId: 'major-admin-chon',
          classCode: 'PDP102.01',
          status: StudentStatus.STUDYING,
        },
      ],
    });
    await committer.commit(rowsOf({}), tx as unknown as PrismaTx, ctx);

    expect(tx.student.update).not.toHaveBeenCalled();
  });

  it('lấp ngành còn trống và đồng bộ bộ môn theo ngành', async () => {
    const tx = txMock({
      students: [
        {
          id: 'stu-1',
          studentCode: 'PK04929',
          fullName: 'H Wiêm Adrơng',
          majorId: null,
          classCode: 'PDP102.01',
          status: StudentStatus.STUDYING,
        },
      ],
    });
    await committer.commit(rowsOf({}), tx as unknown as PrismaTx, ctx);

    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 'stu-1' },
      data: { majorId: 'major-tq', departmentId: 'dept-nn' },
    });
  });

  it('chỉ tìm lớp học phần trong kỳ đang import', async () => {
    const tx = txMock();
    await committer.commit(rowsOf({}), tx as unknown as PrismaTx, ctx);

    const args = firstArg<{ where: { term: string } }>(
      tx.classSection.findMany,
    );
    expect(args.where.term).toBe('SU26');
  });

  it('khớp mã ngành không phân biệt hoa thường', async () => {
    const tx = txMock();
    await committer.commit(
      rowsOf({ majorAlias: 'chna' }),
      tx as unknown as PrismaTx,
      ctx,
    );

    const args = firstArg<{ data: Record<string, unknown> }>(tx.student.create);
    expect(args.data).toMatchObject({ majorId: 'major-tq' });
  });

  it('cùng sinh viên ở hai lớp học phần → hai ghi danh, một hồ sơ', async () => {
    const tx = txMock({
      sections: [
        { id: 'sec-1', code: 'PDP102.01-PDP102' },
        { id: 'sec-2', code: 'ENT213.02-ENT213' },
      ],
    });
    tx.subject.findMany.mockResolvedValue([
      { id: 'sub-pdp', code: 'PDP102', departmentId: 'dept-cn' },
      { id: 'sub-ent', code: 'ENT213', departmentId: 'dept-cn' },
    ]);
    const result = await committer.commit(
      rowsOf(
        {},
        {
          classCode: 'ENT213.02',
          subjectCode: 'ENT213',
          sectionCode: 'ENT213.02-ENT213',
        },
      ),
      tx as unknown as PrismaTx,
      ctx,
    );

    expect(tx.student.create).toHaveBeenCalledTimes(1);
    expect(tx.enrollment.create).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ created: 2, updated: 0, skipped: 0 });
  });
});
