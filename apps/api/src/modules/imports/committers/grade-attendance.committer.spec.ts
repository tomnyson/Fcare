import type { ImportContext, ParsedRow, PrismaTx } from '../types';
import { GradeAttendanceCommitter } from './grade-attendance.committer';

const BASE = {
  studentCode: 'PK04929',
  classCode: 'PDP102.01',
  subjectCode: 'PDP102',
  sectionCode: 'PDP102.01-PDP102',
  totalScore: 8.5,
  result: 'PASS',
  isExamBanned: false,
  absentSessions: 1,
  totalSessions: 14,
  attendanceRate: 92.9,
};

function rowsOf(...overrides: Partial<typeof BASE>[]): ParsedRow[] {
  return overrides.map((override, index) => ({
    sheet: 'grades',
    rowIndex: index + 2,
    payload: { ...BASE, ...override },
  }));
}

function txMock(
  overrides: {
    students?: unknown[];
    sections?: unknown[];
    enrollments?: unknown[];
  } = {},
) {
  return {
    classSection: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          overrides.sections ?? [{ id: 'sec-1', code: 'PDP102.01-PDP102' }],
        ),
    },
    student: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          overrides.students ?? [{ id: 'stu-1', studentCode: 'PK04929' }],
        ),
    },
    enrollment: {
      findMany: jest.fn().mockResolvedValue(overrides.enrollments ?? []),
      create: jest.fn().mockResolvedValue({ id: 'enr-1' }),
      update: jest.fn().mockResolvedValue({ id: 'enr-1' }),
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

describe('GradeAttendanceCommitter', () => {
  const committer = new GradeAttendanceCommitter();

  it('tạo ghi danh kèm điểm và chuyên cần khi chưa có', async () => {
    const tx = txMock();
    const result = await committer.commit(
      rowsOf({}),
      tx as unknown as PrismaTx,
      ctx,
    );

    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: {
        studentId: 'stu-1',
        classSectionId: 'sec-1',
        totalScore: 8.5,
        result: 'PASS',
        isExamBanned: false,
        absentSessions: 1,
        totalSessions: 14,
        attendanceRate: 92.9,
      },
    });
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
  });

  it('cập nhật ghi danh đã có, không tạo trùng', async () => {
    const tx = txMock({
      enrollments: [
        { id: 'enr-9', studentId: 'stu-1', classSectionId: 'sec-1' },
      ],
    });
    const result = await committer.commit(
      rowsOf({}),
      tx as unknown as PrismaTx,
      ctx,
    );

    expect(tx.enrollment.create).not.toHaveBeenCalled();
    const args = firstArg<{
      where: { id: string };
      data: Record<string, unknown>;
    }>(tx.enrollment.update);
    expect(args.where).toEqual({ id: 'enr-9' });
    expect(args.data).toMatchObject({ totalScore: 8.5, result: 'PASS' });
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
  });

  it('ghi cấm thi khi file báo trượt do chuyên cần', async () => {
    const tx = txMock();
    await committer.commit(
      rowsOf({ result: 'FAIL', isExamBanned: true }),
      tx as unknown as PrismaTx,
      ctx,
    );

    const args = firstArg<{ data: Record<string, unknown> }>(
      tx.enrollment.create,
    );
    expect(args.data).toMatchObject({ result: 'FAIL', isExamBanned: true });
  });

  it('bỏ qua khi sinh viên chưa có trong hệ thống — phải import danh sách sinh viên trước', async () => {
    const tx = txMock({ students: [] });
    const result = await committer.commit(
      rowsOf({}),
      tx as unknown as PrismaTx,
      ctx,
    );

    expect(tx.enrollment.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('bỏ qua khi lớp học phần chưa tồn tại', async () => {
    const tx = txMock({ sections: [] });
    const result = await committer.commit(
      rowsOf({}),
      tx as unknown as PrismaTx,
      ctx,
    );

    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('chỉ tìm lớp học phần trong kỳ đang import', async () => {
    const tx = txMock();
    await committer.commit(rowsOf({}), tx as unknown as PrismaTx, ctx);

    const args = firstArg<{ where: { term: string } }>(
      tx.classSection.findMany,
    );
    expect(args.where.term).toBe('SU26');
  });

  it('cùng ghi danh xuất hiện hai lần trong file → ghi một lần rồi cập nhật', async () => {
    const tx = txMock();
    const result = await committer.commit(
      rowsOf({}, { totalScore: 9 }),
      tx as unknown as PrismaTx,
      ctx,
    );

    expect(tx.enrollment.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ created: 1, updated: 1, skipped: 0 });
  });
});
