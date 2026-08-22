import { EnrollmentResult } from '@prisma/client';
import type { ImportContext, ParsedRow, PrismaTx } from '../types';
import { GradebookCommitter } from './gradebook.committer';

function row(payload: Record<string, unknown>, rowIndex = 2): ParsedRow {
  return { sheet: 'SOF1021', rowIndex, payload };
}

const BASE = {
  subjectCode: 'SOF1021',
  fullName: 'Nguyễn Văn A',
  totalScore: 7.5,
  resultLabel: 'Đạt',
};

/** Hình dạng tham số gọi `student.create` — chỉ để test đọc lại an toàn kiểu. */
interface CreateStudentArgs {
  data: {
    studentCode: string;
    fullName: string;
    classCode: string;
    cohort: string | null;
    majorId: string | null;
    departmentId: string;
  };
}

/** Hình dạng tham số gọi `student.update`. */
interface UpdateStudentArgs {
  data: {
    fullName?: string;
    majorId?: string;
    cohort?: string;
  };
}

/** Hình dạng tham số gọi `classSection.create`. */
interface CreateSectionArgs {
  data: {
    code: string;
    term: string;
    subjectId: string;
    lecturerId: string | null;
  };
}

/** Hình dạng tham số gọi `enrollment.upsert`. */
interface EnrollmentUpsertArgs {
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}

function makeTx() {
  return {
    subject: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'sub-1', code: 'SOF1021', departmentId: 'dept-cntt' },
        ]),
    },
    classMajorRule: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ classPrefix: 'SD', majorId: 'major-ptpm' }]),
    },
    student: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation(({ data }: CreateStudentArgs) =>
          Promise.resolve({ id: `stu-${data.studentCode}` }),
        ),
      update: jest.fn().mockResolvedValue({ id: 'stu-1' }),
    },
    classSection: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation(({ data }: CreateSectionArgs) =>
          Promise.resolve({ id: `cs-${data.code}` }),
        ),
    },
    enrollment: {
      upsert: jest.fn().mockResolvedValue({ id: 'enr-1' }),
    },
  } as unknown as PrismaTx & {
    subject: { findMany: jest.Mock };
    classMajorRule: { findMany: jest.Mock };
    student: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    classSection: { findMany: jest.Mock; create: jest.Mock };
    enrollment: { upsert: jest.Mock };
  };
}

const ctx = { term: 'SU26' } as ImportContext;

describe('GradebookCommitter', () => {
  const committer = new GradebookCommitter();

  it('lớp hành chính: suy khoá và ngành từ mã lớp', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' })],
      tx,
      ctx,
    );
    const [createArgs] = tx.student.create.mock.calls[0] as [CreateStudentArgs];
    expect(createArgs.data).toMatchObject({
      studentCode: 'PK1',
      classCode: 'SD20301',
      cohort: 'K20',
      majorId: 'major-ptpm',
      departmentId: 'dept-cntt',
    });
  });

  it('lớp học phần: majorId và cohort để null, vào hàng chờ gán', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ ...BASE, studentCode: 'PK2', rawClass: 'WEB2064.02' })],
      tx,
      ctx,
    );
    const [createArgs] = tx.student.create.mock.calls[0] as [CreateStudentArgs];
    expect(createArgs.data).toMatchObject({
      majorId: null,
      cohort: null,
      classCode: 'WEB2064.02',
    });
  });

  it('departmentId LUÔN lấy từ bộ môn của môn học, không bao giờ null', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ ...BASE, studentCode: 'PK3', rawClass: 'WEB2064.02' })],
      tx,
      ctx,
    );
    const [createArgs] = tx.student.create.mock.calls[0] as [CreateStudentArgs];
    expect(createArgs.data.departmentId).toBe('dept-cntt');
  });

  it('sinh viên đã có: cập nhật họ tên, KHÔNG ghi đè ngành đã gán tay', async () => {
    const tx = makeTx();
    tx.student.findMany.mockResolvedValue([
      {
        id: 'stu-1',
        studentCode: 'PK1',
        majorId: 'major-da-gan',
        cohort: '19',
      },
    ]);
    await committer.commit(
      [row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' })],
      tx,
      ctx,
    );
    const [updateArgs] = tx.student.update.mock.calls[0] as [UpdateStudentArgs];
    expect(updateArgs.data.fullName).toBe('Nguyễn Văn A');
    expect(updateArgs.data.majorId).toBeUndefined();
    expect(updateArgs.data.cohort).toBeUndefined();
  });

  it('sinh viên đã có nhưng chưa có ngành: lấp ngành suy được', async () => {
    const tx = makeTx();
    tx.student.findMany.mockResolvedValue([
      { id: 'stu-1', studentCode: 'PK1', majorId: null, cohort: null },
    ]);
    await committer.commit(
      [row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' })],
      tx,
      ctx,
    );
    const [updateArgs] = tx.student.update.mock.calls[0] as [UpdateStudentArgs];
    expect(updateArgs.data).toMatchObject({
      majorId: 'major-ptpm',
      cohort: 'K20',
    });
  });

  it('upsert enrollment với totalScore và result đã ánh xạ', async () => {
    const tx = makeTx();
    await committer.commit(
      [
        row({
          ...BASE,
          studentCode: 'PK1',
          rawClass: 'SD20301',
          resultLabel: 'Không đạt',
        }),
      ],
      tx,
      ctx,
    );
    const [call] = tx.enrollment.upsert.mock.calls[0] as [EnrollmentUpsertArgs];
    expect(call.create).toMatchObject({
      totalScore: 7.5,
      result: EnrollmentResult.FAIL,
    });
    expect(call.update).toMatchObject({
      totalScore: 7.5,
      result: EnrollmentResult.FAIL,
    });
  });

  it('KHÔNG ghi midtermScore, finalScore hay attendanceRate', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' })],
      tx,
      ctx,
    );
    const [call] = tx.enrollment.upsert.mock.calls[0] as [EnrollmentUpsertArgs];
    const keys = Object.keys(call.create);
    expect(keys).not.toContain('midtermScore');
    expect(keys).not.toContain('finalScore');
    expect(keys).not.toContain('attendanceRate');
  });

  it('tạo lớp học phần nếu chưa có, dùng đúng quy tắc mã', async () => {
    const tx = makeTx();
    await committer.commit(
      [row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' })],
      tx,
      ctx,
    );
    const [createArgs] = tx.classSection.create.mock.calls[0] as [
      CreateSectionArgs,
    ];
    expect(createArgs.data).toMatchObject({
      code: 'SOF1021-SD20301-SU26',
      term: 'SU26',
      subjectId: 'sub-1',
      lecturerId: null,
    });
  });

  it('môn chưa có trong danh mục → bỏ qua dòng', async () => {
    const tx = makeTx();
    const result = await committer.commit(
      [
        row({
          ...BASE,
          subjectCode: 'KHONGCO',
          studentCode: 'PK1',
          rawClass: 'SD20301',
        }),
      ],
      tx,
      ctx,
    );
    expect(tx.student.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('hai dòng cùng sinh viên khác môn chỉ tạo Student một lần', async () => {
    const tx = makeTx();
    tx.subject.findMany.mockResolvedValue([
      { id: 'sub-1', code: 'SOF1021', departmentId: 'dept-cntt' },
      { id: 'sub-2', code: 'WEB2064', departmentId: 'dept-cntt' },
    ]);
    await committer.commit(
      [
        row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' }),
        row({
          ...BASE,
          subjectCode: 'WEB2064',
          studentCode: 'PK1',
          rawClass: 'SD20301',
        }),
      ],
      tx,
      ctx,
    );
    expect(tx.student.create).toHaveBeenCalledTimes(1);
    expect(tx.enrollment.upsert).toHaveBeenCalledTimes(2);
  });

  it('item 2: lớp học phần đã tồn tại nhưng thuộc môn khác → bỏ qua, không ghi enrollment', async () => {
    const tx = makeTx();
    // sectionCode cho SECTION 'WEB2064.02' + môn 'PMA1011' = 'WEB2064.02-SU26'
    // (buildSectionCode không nhúng subjectCode với kind SECTION). Lớp này đã
    // tồn tại sẵn nhưng thuộc môn khác ('sub-khac-mon').
    tx.subject.findMany.mockResolvedValue([
      { id: 'sub-1', code: 'PMA1011', departmentId: 'dept-cntt' },
    ]);
    tx.classSection.findMany.mockResolvedValue([
      { id: 'cs-1', code: 'WEB2064.02-SU26', subjectId: 'sub-khac-mon' },
    ]);
    const result = await committer.commit(
      [
        row({
          ...BASE,
          subjectCode: 'PMA1011',
          studentCode: 'PK1',
          rawClass: 'WEB2064.02',
        }),
      ],
      tx,
      ctx,
    );
    expect(tx.enrollment.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('item 3: classCode="WEB2064.02" gặp dòng hành chính SD20301 → cập nhật classCode', async () => {
    const tx = makeTx();
    tx.student.findMany.mockResolvedValue([
      {
        id: 'stu-1',
        studentCode: 'PK1',
        fullName: 'Nguyễn Văn A',
        majorId: 'major-ptpm',
        cohort: 'K19',
        classCode: 'WEB2064.02',
      },
    ]);
    await committer.commit(
      [row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' })],
      tx,
      ctx,
    );
    const [updateArgs] = tx.student.update.mock.calls[0] as [
      { data: { classCode?: string } },
    ];
    expect(updateArgs.data.classCode).toBe('SD20301');
  });

  it('item 3: classCode="SD20301" (đã hành chính) gặp dòng lớp học phần WEB2064.02 → giữ nguyên, không ghi đè', async () => {
    const tx = makeTx();
    tx.student.findMany.mockResolvedValue([
      {
        id: 'stu-1',
        studentCode: 'PK1',
        fullName: 'Nguyễn Văn A',
        majorId: 'major-ptpm',
        cohort: 'K20',
        classCode: 'SD20301',
      },
    ]);
    await committer.commit(
      [row({ ...BASE, studentCode: 'PK1', rawClass: 'WEB2064.02' })],
      tx,
      ctx,
    );
    // Không có trường nào thay đổi (fullName/majorId/cohort trùng, classCode
    // không bị ghi đè) → student.update không được gọi (item 4).
    expect(tx.student.update).not.toHaveBeenCalled();
  });

  it('item 4 + 9: dòng thứ hai của cùng sinh viên với dữ liệu giống hệt không gọi lại update, updated đếm theo sinh viên', async () => {
    const tx = makeTx();
    tx.subject.findMany.mockResolvedValue([
      { id: 'sub-1', code: 'SOF1021', departmentId: 'dept-cntt' },
      { id: 'sub-2', code: 'WEB2064', departmentId: 'dept-cntt' },
    ]);
    tx.student.findMany.mockResolvedValue([
      {
        id: 'stu-1',
        studentCode: 'PK1',
        fullName: 'Nguyễn Văn A',
        majorId: 'major-ptpm',
        cohort: 'K20',
        classCode: 'SD20301',
      },
    ]);
    const result = await committer.commit(
      [
        row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' }),
        row(
          {
            ...BASE,
            subjectCode: 'WEB2064',
            studentCode: 'PK1',
            rawClass: 'SD20301',
          },
          3,
        ),
      ],
      tx,
      ctx,
    );
    // Cả hai dòng đều không đổi field nào so với dữ liệu đã có → update
    // không bị gọi lần nào, và updated = 0 (không phải 2).
    expect(tx.student.update).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
  });

  it('item 9: hai dòng cùng đổi cùng một sinh viên chỉ đếm 1 updated dù update được gọi 2 lần', async () => {
    const tx = makeTx();
    tx.subject.findMany.mockResolvedValue([
      { id: 'sub-1', code: 'SOF1021', departmentId: 'dept-cntt' },
      { id: 'sub-2', code: 'WEB2064', departmentId: 'dept-cntt' },
    ]);
    tx.student.findMany.mockResolvedValue([
      {
        id: 'stu-1',
        studentCode: 'PK1',
        fullName: 'Tên Cũ',
        majorId: 'major-ptpm',
        cohort: 'K20',
        classCode: 'SD20301',
      },
    ]);
    const result = await committer.commit(
      [
        row({ ...BASE, studentCode: 'PK1', rawClass: 'SD20301' }),
        row(
          {
            ...BASE,
            subjectCode: 'WEB2064',
            studentCode: 'PK1',
            rawClass: 'SD20301',
          },
          3,
        ),
      ],
      tx,
      ctx,
    );
    // fullName trong BASE ('Nguyễn Văn A') khác 'Tên Cũ' → dòng đầu ghi
    // update thật; cache được đồng bộ nên dòng hai (cùng payload) không phát
    // hiện thay đổi nữa → update chỉ gọi 1 lần, updated = 1 sinh viên.
    expect(tx.student.update).toHaveBeenCalledTimes(1);
    expect(result.updated).toBe(1);
  });
});
