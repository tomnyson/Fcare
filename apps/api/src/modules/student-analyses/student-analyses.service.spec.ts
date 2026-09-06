/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StudentTermAnalysisStatus } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import { StudentAnalysesService } from './student-analyses.service';

const ownerUser = {
  id: 'owner-1',
  roles: ['LECTURER'],
  departmentId: 'dept-1',
} as AuthUser;

const otherLecturer = {
  id: 'lecturer-2',
  roles: ['LECTURER'],
  departmentId: 'dept-2',
} as AuthUser;

const adminUser = {
  id: 'admin-1',
  roles: ['ADMIN'],
  departmentId: null,
} as AuthUser;

const parsedOutput = {
  riskLevel: 'HIGH' as const,
  summary: 'Can theo doi sat ket qua hoc tap.',
  strengths: ['Di hoc deu'],
  trends: [{ finding: 'Diem tong ket giam', evidence: 'Tu 7.2 xuong 5.9' }],
  riskFactors: [{ finding: 'Vang hoc', evidence: 'Chuyen can 0.6' }],
  recommendations: ['Hen gap co van hoc tap'],
  notificationSummary: 'Co dau hieu giam sut ket qua.',
  dataLimitations: ['Du lieu nhan xet mot hoc phan chua day du'],
};

function makeManagedVersion(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const base = {
    id: 'version-1',
    analysisId: 'analysis-1',
    version: 1,
    status: StudentTermAnalysisStatus.DRAFT,
    sourceHash: 'hash-1',
    sourceSnapshot: {
      focusTerm: '2025A',
      enrollments: [],
      evaluations: [],
      limitations: [],
    },
    aiOriginal: parsedOutput,
    editedOutput: parsedOutput,
    model: 'gpt-5.6-luna',
    promptVersion: 'student-academic-analysis-v1',
    inputTokens: 10,
    outputTokens: 20,
    reasoningTokens: 5,
    totalTokens: 35,
    errorMessage: null,
    requestedAt: new Date('2026-08-24T00:00:00.000Z'),
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
    updatedAt: new Date('2026-08-24T00:00:00.000Z'),
    generatedAt: new Date('2026-08-24T00:05:00.000Z'),
    editedAt: null,
    reviewedAt: null,
    sentAt: null,
    createdById: ownerUser.id,
    reviewedById: null,
    createdBy: { id: ownerUser.id, staffCode: 'GV001', fullName: 'Owner' },
    reviewedBy: null,
    analysis: {
      id: 'analysis-1',
      term: '2025A',
      studentId: 'student-1',
      ownerId: ownerUser.id,
      student: {
        id: 'student-1',
        studentCode: 'SV001',
        fullName: 'Nguyen Van A',
        departmentId: 'dept-1',
      },
      owner: { id: ownerUser.id, staffCode: 'GV001', fullName: 'Owner' },
    },
    recipients: [],
  };

  return { ...base, ...overrides };
}

function makeService() {
  const prisma = {
    studentTermAnalysis: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest
        .fn()
        .mockResolvedValue({ id: 'analysis-1', ownerId: ownerUser.id }),
    },
    studentTermAnalysisVersion: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    studentTermAnalysisRecipient: {
      update: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    enrollment: {
      findMany: jest.fn(),
    },
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  (prisma.$transaction as jest.Mock).mockImplementation(
    (input: ((tx: PrismaService) => unknown) | Promise<unknown>[]) =>
      Promise.resolve(
        typeof input === 'function' ? input(prisma) : Promise.all(input),
      ),
  );

  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'AI_ANALYSIS_ENABLED') return 'true';
      if (key === 'OPENAI_MODEL') return 'gpt-5.6-luna';
      return fallback;
    }),
  };
  const source = {
    assertCanInitiate: jest.fn().mockResolvedValue(undefined),
    buildSnapshot: jest.fn().mockResolvedValue({
      snapshot: {
        focusTerm: '2025A',
        enrollments: [],
        evaluations: [],
        limitations: [],
      },
      hash: 'hash-1',
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = { deliver: jest.fn().mockResolvedValue(0) };
  const provider = {
    generate: jest.fn(),
    modelName: jest.fn(() => 'gpt-5.6-luna'),
    promptVersion: jest.fn(() => 'student-academic-analysis-v1'),
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };

  return {
    prisma,
    config,
    source,
    audit,
    notifications,
    provider,
    queue,
    service: new StudentAnalysesService(
      prisma,
      config as never,
      audit as never,
      source as never,
      notifications as never,
      provider,
      queue as never,
    ),
  };
}

describe('StudentAnalysesService.createVersion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tra lai version da co khi trung idempotency key', async () => {
    const { prisma, queue, service } = makeService();
    const findFirstVersion = jest.fn().mockResolvedValueOnce({
      id: 'version-1',
      version: 1,
      status: StudentTermAnalysisStatus.QUEUED,
      aiOriginal: parsedOutput,
      editedOutput: parsedOutput,
      createdAt: new Date('2026-08-24T00:00:00.000Z'),
      updatedAt: new Date('2026-08-24T00:00:00.000Z'),
      generatedAt: new Date('2026-08-24T00:05:00.000Z'),
      sentAt: null,
      errorMessage: null,
      createdBy: { id: ownerUser.id, staffCode: 'GV001', fullName: 'Owner' },
      reviewedBy: null,
    });
    prisma.studentTermAnalysisVersion.findFirst = findFirstVersion;

    const result = await service.createVersion(ownerUser, 'student-1', {
      term: '2025A',
      idempotencyKey: '8e8b5ec9-1a5a-485f-96d6-8457810ae725',
    });

    expect(result).toMatchObject({
      id: 'version-1',
      version: 1,
      status: StudentTermAnalysisStatus.QUEUED,
    });
    const versionCreate = prisma.studentTermAnalysisVersion.create as jest.Mock;
    expect(versionCreate).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(
      'generate-analysis',
      { kind: 'generate', versionId: 'version-1' },
      expect.objectContaining({ jobId: 'generate-version-1' }),
    );
  });

  it('tu choi nguoi khong phai owner hay admin tao version moi', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysis.upsert = jest
      .fn()
      .mockResolvedValue({ id: 'analysis-1', ownerId: ownerUser.id });
    prisma.studentTermAnalysisVersion.findFirst = jest
      .fn()
      .mockResolvedValue(null);

    await expect(
      service.createVersion(otherLecturer, 'student-1', {
        term: '2025A',
        idempotencyKey: '39a29f28-b628-4cbc-a40f-b8fe77b19f5a',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cho phep admin tao version moi cho ho so cua nguoi khac', async () => {
    const { prisma, service, queue } = makeService();
    prisma.studentTermAnalysis.upsert = jest
      .fn()
      .mockResolvedValue({ id: 'analysis-1', ownerId: ownerUser.id });
    prisma.studentTermAnalysisVersion.findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ version: 2 });
    prisma.studentTermAnalysisVersion.create = jest.fn().mockResolvedValue({
      id: 'version-3',
      version: 3,
      status: StudentTermAnalysisStatus.QUEUED,
      aiOriginal: null,
      editedOutput: null,
      createdAt: new Date('2026-08-24T00:00:00.000Z'),
      updatedAt: new Date('2026-08-24T00:00:00.000Z'),
      generatedAt: null,
      sentAt: null,
      errorMessage: null,
      createdBy: { id: adminUser.id, staffCode: 'AD001', fullName: 'Admin' },
      reviewedBy: null,
    });

    await service.createVersion(adminUser, 'student-1', {
      term: '2025A',
      idempotencyKey: '638b1626-c02b-42d4-a83a-5672cad4254c',
    });

    const queueAdd = queue.add;

    expect(queueAdd).toHaveBeenCalledWith(
      'generate-analysis',
      { kind: 'generate', versionId: 'version-3' },
      expect.any(Object),
    );
  });

  it('audit loi khong ngan enqueue va khong lam that bai request', async () => {
    const { prisma, audit, queue, service } = makeService();
    prisma.studentTermAnalysisVersion.findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.studentTermAnalysisVersion.create = jest.fn().mockResolvedValue({
      id: 'version-audit',
      version: 1,
      status: StudentTermAnalysisStatus.QUEUED,
      aiOriginal: null,
      editedOutput: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      generatedAt: null,
      sentAt: null,
      errorMessage: null,
      createdBy: { id: adminUser.id, staffCode: 'AD001', fullName: 'Admin' },
      reviewedBy: null,
    });
    audit.log.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(
      service.createVersion(adminUser, 'student-1', {
        term: '2025A',
        idempotencyKey: 'a0b3f5df-4a2d-4549-97d2-f9dd8cbf2ff2',
      }),
    ).resolves.toMatchObject({ id: 'version-audit' });
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});

describe('StudentAnalysesService.updateDraft', () => {
  beforeEach(() => jest.clearAllMocks());

  it('chi cap nhat editedOutput va giu nguyen aiOriginal', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(makeManagedVersion());
    prisma.studentTermAnalysisVersion.updateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    prisma.studentTermAnalysisVersion.findUniqueOrThrow = jest
      .fn()
      .mockResolvedValue({
        id: 'version-1',
        version: 1,
        status: StudentTermAnalysisStatus.DRAFT,
        aiOriginal: parsedOutput,
        editedOutput: { ...parsedOutput, summary: 'Ban da duyet' },
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
        updatedAt: new Date('2026-08-24T00:01:00.000Z'),
        generatedAt: new Date('2026-08-24T00:05:00.000Z'),
        sentAt: null,
        errorMessage: null,
        createdBy: { id: ownerUser.id, staffCode: 'GV001', fullName: 'Owner' },
        reviewedBy: { id: ownerUser.id, staffCode: 'GV001', fullName: 'Owner' },
      });

    await service.updateDraft(ownerUser, 'version-1', {
      editedOutput: { ...parsedOutput, summary: 'Ban da duyet' },
    });

    const versionUpdate = prisma.studentTermAnalysisVersion
      .updateMany as jest.Mock;
    const firstCall = versionUpdate.mock.calls[0] as
      [{ data: Record<string, unknown> }] | undefined;
    const updateArgs = firstCall?.[0];

    expect(versionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          editedOutput: expect.objectContaining({ summary: 'Ban da duyet' }),
        }),
      }),
    );
    expect(updateArgs?.data).not.toHaveProperty('aiOriginal');
  });

  it('khong ghi de khi version da roi khoi trang thai DRAFT', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(makeManagedVersion());
    prisma.studentTermAnalysisVersion.updateMany = jest
      .fn()
      .mockResolvedValue({ count: 0 });

    await expect(
      service.updateDraft(ownerUser, 'version-1', {
        editedOutput: parsedOutput,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('StudentAnalysesService delivery recovery', () => {
  it('hoi tu delivery khi notification da duoc tao thay vi dua version ve DRAFT', async () => {
    const { prisma, service } = makeService();
    prisma.notification.count = jest.fn().mockResolvedValue(1);
    const processDelivery = jest
      .spyOn(service, 'processDelivery')
      .mockResolvedValue(undefined);

    await service.markDeliveryFailed('version-1', new Error('audit failed'));

    expect(processDelivery).toHaveBeenCalledWith('version-1');
    expect(prisma.studentTermAnalysisVersion.updateMany).not.toHaveBeenCalled();
  });
});

describe('StudentAnalysesService.sendVersion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tra ve 409 STALE_ANALYSIS khi source hash da thay doi', async () => {
    const { prisma, service, source } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(makeManagedVersion());
    source.buildSnapshot = jest.fn().mockResolvedValue({
      snapshot: {
        focusTerm: '2025A',
        enrollments: [],
        evaluations: [],
        limitations: [],
      },
      hash: 'hash-2',
    });

    await expect(
      service.sendVersion(ownerUser, 'version-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    await service
      .sendVersion(ownerUser, 'version-1')
      .catch((error: unknown) => {
        const response = (error as ConflictException).getResponse() as {
          code?: string;
        };
        expect(response.code).toBe('STALE_ANALYSIS');
      });
  });

  it('tra ve 409 NO_RECIPIENTS khi khong tim thay giang vien nhan', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(makeManagedVersion());
    prisma.enrollment.findMany = jest.fn().mockResolvedValue([]);

    await expect(
      service.sendVersion(ownerUser, 'version-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    await service
      .sendVersion(ownerUser, 'version-1')
      .catch((error: unknown) => {
        const response = (error as ConflictException).getResponse() as {
          code?: string;
        };
        expect(response.code).toBe('NO_RECIPIENTS');
      });
  });
});

describe('StudentAnalysesService.getVersion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('khong cho recipient xem ban chua SENT', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest.fn().mockResolvedValue(
      makeManagedVersion({
        status: StudentTermAnalysisStatus.DRAFT,
        recipients: [
          {
            id: 'recipient-row-1',
            recipientId: otherLecturer.id,
            recipientStaffCode: 'GV002',
            recipientFullName: 'Lecturer Two',
            recipientDepartmentId: 'dept-2',
            openedAt: null,
            notificationId: null,
          },
        ],
      }),
    );

    await expect(
      service.getVersion(otherLecturer, 'version-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cho recipient xem ban da SENT voi payload toi thieu', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest.fn().mockResolvedValue(
      makeManagedVersion({
        status: StudentTermAnalysisStatus.SENT,
        sentAt: new Date('2026-08-24T00:10:00.000Z'),
        recipients: [
          {
            id: 'recipient-row-1',
            recipientId: otherLecturer.id,
            recipientStaffCode: 'GV002',
            recipientFullName: 'Lecturer Two',
            recipientDepartmentId: 'dept-2',
            openedAt: null,
            notificationId: 'notification-1',
          },
        ],
        reviewedBy: { id: ownerUser.id, staffCode: 'GV001', fullName: 'Owner' },
      }),
    );

    const result = await service.getVersion(otherLecturer, 'version-1');
    const recipientUpdate = prisma.studentTermAnalysisRecipient
      .update as jest.Mock;

    expect(result).toMatchObject({
      id: 'version-1',
      status: StudentTermAnalysisStatus.SENT,
      student: {
        id: 'student-1',
        studentCode: 'SV001',
        fullName: 'Nguyen Van A',
      },
      editedOutput: expect.objectContaining({
        notificationSummary: parsedOutput.notificationSummary,
      }),
      sender: { id: ownerUser.id },
      disclaimer:
        'Nội dung AI chỉ mang tính hỗ trợ và đã được giảng viên duyệt.',
    });
    expect(recipientUpdate).toHaveBeenCalledWith({
      where: { id: 'recipient-row-1' },
      data: { openedAt: expect.any(Date) },
    });
  });
});
