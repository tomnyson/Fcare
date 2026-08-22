import type { ImportContext, ParsedRow, PrismaTx } from '../types';
import { CatalogCommitter } from './catalog.committer';

function row(payload: Record<string, unknown>, rowIndex = 3): ParsedRow {
  return { sheet: '3.1.Môn-BM', rowIndex, payload };
}

const BASE = {
  name: 'Môn A',
  credits: 3,
  subjectGroup: null,
  hoursTotal: null,
  learningMethod: null,
  maxStudents: null,
  examForm: null,
  attendanceRateRequired: null,
};

function makeTx() {
  return {
    departmentAlias: {
      findMany: jest.fn().mockResolvedValue([
        { alias: 'CNTT', departmentId: 'dept-cntt' },
        { alias: 'CONG-NGHE-THONG-TIN', departmentId: 'dept-cntt' },
      ]),
    },
    subject: {
      findMany: jest.fn().mockResolvedValue([{ id: 'sub-1', code: 'ITA107' }]),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'sub-1' }),
    },
  } as unknown as PrismaTx & {
    departmentAlias: { findMany: jest.Mock };
    subject: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
}

const ctx = { term: 'SU26' } as ImportContext;

describe('CatalogCommitter', () => {
  const committer = new CatalogCommitter();

  it('tạo mới môn chưa có', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ code: 'NEW101', deptAlias: 'CNTT', ...BASE })],
      tx,
      ctx,
    );
    const expectedData: { code: string; departmentId: string } = {
      code: 'NEW101',
      departmentId: 'dept-cntt',
    };
    // `tx.subject.create` giao giữa Prisma delegate thật và jest.Mock nên TS
    // suy ra kiểu tham số mơ hồ; đây là hạn chế của kiểu mock, không phải lỗ hổng thật.
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    expect(tx.subject.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining(expectedData) }),
    );
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
  });

  it('cập nhật môn đã có theo mã, không tạo trùng', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ code: 'ITA107', deptAlias: 'CNTT', ...BASE })],
      tx,
      ctx,
    );
    expect(tx.subject.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sub-1' } }),
    );
    expect(tx.subject.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
  });

  it('alias bộ môn chưa ánh xạ → BỎ QUA dòng, KHÔNG đoán bộ môn', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [row({ code: 'X1', deptAlias: 'THUC-TAP-TN', ...BASE })],
      tx,
      ctx,
    );
    expect(tx.subject.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('tra alias phân biệt hoa thường và khoảng trắng thừa', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ code: 'X2', deptAlias: '  cntt ', ...BASE })],
      tx,
      ctx,
    );
    expect(tx.subject.create).toHaveBeenCalled();
  });

  it('chỉ nạp alias và danh sách môn MỘT lần cho cả lô — không N+1', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({ code: 'A1', deptAlias: 'CNTT', ...BASE }, 3),
        row({ code: 'A2', deptAlias: 'CNTT', ...BASE }, 4),
        row({ code: 'A3', deptAlias: 'CNTT', ...BASE }, 5),
      ],
      tx,
      ctx,
    );
    expect(tx.departmentAlias.findMany).toHaveBeenCalledTimes(1);
    expect(tx.subject.findMany).toHaveBeenCalledTimes(1);
  });
});
