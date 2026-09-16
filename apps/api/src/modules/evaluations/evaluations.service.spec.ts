import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EvaluationsService } from './evaluations.service';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StudentAnalysesService } from '../student-analyses/student-analyses.service';

const lecturer = {
  id: 'gv-1',
  roles: ['LECTURER'],
  departmentId: 'bm-1',
} as unknown as AuthUser;

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    student: { findFirst: jest.fn().mockResolvedValue({ id: 'sv-1' }) },
    classSection: {
      findFirst: jest.fn().mockResolvedValue({ id: 'lop-1', term: 'SU25' }),
    },
    evaluation: {
      create: jest.fn().mockResolvedValue({
        id: 'nx-1',
        studentId: 'sv-1',
        term: 'SU25',
        updatedAt: new Date('2026-09-08T02:00:00.000Z'),
      }),
    },
    ...overrides,
  } as unknown as PrismaService;
}

/** Phân tích AI chạy sau khi lưu nhận xét — spec chỉ cần biết nó được gọi. */
function makeAnalyses() {
  const requestAutoAnalysis = jest.fn().mockResolvedValue('ver-1');
  return {
    requestAutoAnalysis,
    service: { requestAutoAnalysis } as unknown as StudentAnalysesService,
  };
}

describe('EvaluationsService.create', () => {
  const dto = {
    studentId: 'sv-1',
    classSectionId: 'lop-1',
    term: 'SU25',
    academicScore: 5,
    attitudeScore: 5,
    absentSessions: 2,
    criteria: ['P_PART_TIME_JOB' as const],
  };

  it('từ chối khi sinh viên ngoài phạm vi quản lý', async () => {
    const prisma = makePrisma({
      student: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = new EvaluationsService(prisma, makeAnalyses().service);
    await expect(service.create(lecturer, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('từ chối khi lớp học phần không thuộc phạm vi giảng dạy', async () => {
    const prisma = makePrisma({
      classSection: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = new EvaluationsService(prisma, makeAnalyses().service);
    await expect(service.create(lecturer, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('từ chối khi học kỳ trong body lệch với học kỳ của lớp', async () => {
    const prisma = makePrisma({
      classSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'lop-1', term: 'FA25' }),
      },
    });
    const service = new EvaluationsService(prisma, makeAnalyses().service);
    await expect(service.create(lecturer, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('ghi tiêu chí thành các dòng con trong cùng một lần tạo', async () => {
    const prisma = makePrisma();
    const service = new EvaluationsService(prisma, makeAnalyses().service);
    await service.create(lecturer, dto);
    const create = (prisma as unknown as { evaluation: { create: jest.Mock } })
      .evaluation.create;
    const calls = create.mock.calls as [{ data: Record<string, unknown> }][];
    const arg = calls[0][0];
    expect(arg.data.criteria).toEqual({
      create: [{ criterion: 'P_PART_TIME_JOB' }],
    });
    expect(arg.data.lecturerId).toBe('gv-1');
    expect(arg.data.absentSessions).toBe(2);
  });

  it('lưu xong thì tự gọi phân tích AI cho đúng sinh viên và học kỳ', async () => {
    const prisma = makePrisma();
    const analyses = makeAnalyses();
    const service = new EvaluationsService(prisma, analyses.service);
    await service.create(lecturer, dto);
    expect(analyses.requestAutoAnalysis).toHaveBeenCalledWith({
      user: lecturer,
      studentId: 'sv-1',
      term: 'SU25',
      evaluationId: 'nx-1',
      revision: new Date('2026-09-08T02:00:00.000Z'),
    });
  });

  it('phân tích AI hỏng thì lượt nhận xét vẫn trả về bình thường', async () => {
    const prisma = makePrisma();
    const analyses = makeAnalyses();
    analyses.requestAutoAnalysis.mockRejectedValueOnce(new Error('queue chet'));
    const service = new EvaluationsService(prisma, analyses.service);
    await expect(service.create(lecturer, dto)).resolves.toMatchObject({
      id: 'nx-1',
    });
  });

  it('nhận xét trùng lớp + sinh viên trả lỗi 409 dễ hiểu, không phải 500', async () => {
    const prisma = makePrisma({
      evaluation: {
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '6.19.3',
          }),
        ),
      },
    });
    const service = new EvaluationsService(prisma, makeAnalyses().service);
    await expect(service.create(lecturer, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('EvaluationsService.list', () => {
  it('lọc theo classSectionId khi được cung cấp', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      evaluation: { findMany },
    });
    const service = new EvaluationsService(prisma, makeAnalyses().service);
    await service.list(lecturer, {
      term: 'FA26',
      classSectionId: 'sec-123',
    });
    const [args] = findMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(args.where).toMatchObject({
      term: 'FA26',
      classSectionId: 'sec-123',
    });
  });
});
