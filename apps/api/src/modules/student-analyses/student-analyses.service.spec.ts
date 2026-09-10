/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */

import {
  BadRequestException,
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

const emptyRiskScore = {
  components: { RL: 0, RA: 0, RC: 0, RH: 0, RP: 0 },
  drs: 0,
  drsLevel: 1 as const,
  dataForcedLevel: 1 as const,
  evaluationCount: 0,
  medianAcademic: 0,
  medianAttitude: 0,
  triggeredCriteria: [],
  reasons: [],
};

const parsedOutput = {
  riskLevel: 'HIGH' as const,
  summary: 'Can theo doi sat ket qua hoc tap.',
  strengths: ['Di hoc deu'],
  trends: [{ finding: 'Diem tong ket giam', evidence: 'Tu 7.2 xuong 5.9' }],
  riskFactors: [{ finding: 'Vang hoc', evidence: 'Chuyen can 0.6' }],
  recommendations: ['Hen gap co van hoc tap'],
  notificationSummary: 'Co dau hieu giam sut ket qua.',
  dataLimitations: ['Du lieu nhan xet mot hoc phan chua day du'],
  suggestedLevel: 3 as const,
  forcedEscalation: null,
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
      careLogs: [],
      riskScore: emptyRiskScore,
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
    staff: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'gv-2',
          staffCode: 'GV002',
          fullName: 'Tran Thi B',
          departmentId: 'dept-1',
        },
      ]),
    },
    alert: {
      create: jest.fn().mockResolvedValue({ id: 'alert-1' }),
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
        careLogs: [],
        riskScore: emptyRiskScore,
        limitations: [],
      },
      hash: 'hash-1',
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = { deliver: jest.fn().mockResolvedValue(0) };
  const escalation = {
    computeRecipientIds: jest.fn().mockResolvedValue(['gv-2']),
  };
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
    escalation,
    provider,
    queue,
    service: new StudentAnalysesService(
      prisma,
      config as never,
      audit as never,
      source as never,
      notifications as never,
      escalation as never,
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

  const sendDto = { confirmedLevel: 2, contentSource: 'AI' as const };

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
        careLogs: [],
        riskScore: emptyRiskScore,
        limitations: [],
      },
      hash: 'hash-2',
    });

    await expect(
      service.sendVersion(ownerUser, 'version-1', sendDto),
    ).rejects.toBeInstanceOf(ConflictException);

    await service
      .sendVersion(ownerUser, 'version-1', sendDto)
      .catch((error: unknown) => {
        const response = (error as ConflictException).getResponse() as {
          code?: string;
        };
        expect(response.code).toBe('STALE_ANALYSIS');
      });
  });

  it('tra ve 409 NO_RECIPIENTS khi ma tran khong ra nguoi nhan nao', async () => {
    const { prisma, service, escalation } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(makeManagedVersion());
    escalation.computeRecipientIds.mockResolvedValue([]);

    await service
      .sendVersion(ownerUser, 'version-1', sendDto)
      .catch((error: unknown) => {
        const response = (error as ConflictException).getResponse() as {
          code?: string;
        };
        expect(response.code).toBe('NO_RECIPIENTS');
      });
    expect.assertions(1);
  });

  it('không cho hạ độ khẩn xuống dưới mức hệ thống tính', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest.fn().mockResolvedValue(
      makeManagedVersion({
        sourceSnapshot: {
          focusTerm: '2025A',
          enrollments: [],
          evaluations: [],
          careLogs: [],
          riskScore: { ...emptyRiskScore, drsLevel: 3 },
          limitations: [],
        },
      }),
    );

    await expect(
      service.sendVersion(ownerUser, 'version-1', {
        confirmedLevel: 2,
        contentSource: 'AI',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cấp 4 bắt buộc nội dung gửi từ 40 ký tự', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(makeManagedVersion());

    await expect(
      service.sendVersion(ownerUser, 'version-1', {
        confirmedLevel: 4,
        contentSource: 'LECTURER',
        lecturerNote: 'Nghỉ nhiều',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tạo cảnh báo ở cấp đã xác nhận rồi lưu người nhận theo ma trận', async () => {
    const { prisma, service, escalation } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(makeManagedVersion());
    (
      prisma.studentTermAnalysisVersion.updateMany as jest.Mock
    ).mockResolvedValue({ count: 1 });

    const result = await service.sendVersion(ownerUser, 'version-1', sendDto);

    expect(escalation.computeRecipientIds).toHaveBeenCalledWith(
      'student-1',
      2,
      ownerUser.id,
    );
    expect(prisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 2,
          raisedById: ownerUser.id,
          reason: 'Co dau hieu giam sut ket qua.',
        }),
      }),
    );
    expect(prisma.studentTermAnalysisRecipient.createMany).toHaveBeenCalledWith(
      {
        data: [
          {
            versionId: 'version-1',
            recipientId: 'gv-2',
            recipientStaffCode: 'GV002',
            recipientFullName: 'Tran Thi B',
            recipientDepartmentId: 'dept-1',
          },
        ],
      },
    );
    expect(result.alertId).toBe('alert-1');
    expect(result.recipientCount).toBe(1);
  });
  it('chọn nội dung giảng viên thì gửi kèm lịch sử chăm sóc', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest.fn().mockResolvedValue(
      makeManagedVersion({
        sourceSnapshot: {
          focusTerm: '2025A',
          enrollments: [],
          evaluations: [],
          careLogs: [
            {
              channel: 'IN_PERSON',
              content: 'Gặp riêng sinh viên sau buổi học',
              outcome: 'Hứa đi học đủ tuần sau',
              nextAction: null,
              createdAt: '2026-09-01T02:00:00.000Z',
            },
          ],
          riskScore: emptyRiskScore,
          limitations: [],
        },
      }),
    );
    (
      prisma.studentTermAnalysisVersion.updateMany as jest.Mock
    ).mockResolvedValue({ count: 1 });

    await service.sendVersion(ownerUser, 'version-1', {
      confirmedLevel: 2,
      contentSource: 'LECTURER',
      lecturerNote:
        'Em này nghỉ 4 buổi liên tiếp, cần cố vấn học tập vào cuộc.',
    });

    const alertCalls = (prisma.alert.create as unknown as jest.Mock).mock
      .calls as [{ data: Record<string, unknown> }][];
    const reason = alertCalls[0][0].data.reason as string;
    expect(reason).toContain('cần cố vấn học tập vào cuộc');
    expect(reason).toContain('Lịch sử chăm sóc gần đây:');
    expect(reason).toContain('01/09/2026 · Gặp trực tiếp');
    expect(reason).not.toContain('Co dau hieu giam sut ket qua.');
  });

  it('chọn nội dung giảng viên nhưng bỏ trống thì báo lỗi', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(makeManagedVersion());

    await expect(
      service.sendVersion(ownerUser, 'version-1', {
        confirmedLevel: 2,
        contentSource: 'LECTURER',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối nội dung giảng viên có số điện thoại hay email', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(makeManagedVersion());

    await service
      .sendVersion(ownerUser, 'version-1', {
        confirmedLevel: 2,
        contentSource: 'LECTURER',
        lecturerNote:
          'Đã gọi cho sinh viên theo số 0912345678 nhưng không nghe máy.',
      })
      .catch((error: unknown) => {
        const response = (error as BadRequestException).getResponse() as {
          code?: string;
        };
        expect(response.code).toBe('ANALYSIS_PII_REJECTED');
      });
    expect(prisma.alert.create).not.toHaveBeenCalled();
    expect.assertions(2);
  });

  it('người vừa nhận xét được quyết định gửi dù không sở hữu hồ sơ', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest.fn().mockResolvedValue(
      makeManagedVersion({
        createdById: otherLecturer.id,
        createdBy: {
          id: otherLecturer.id,
          staffCode: 'GV002',
          fullName: 'Tran Thi B',
        },
      }),
    );
    (
      prisma.studentTermAnalysisVersion.updateMany as jest.Mock
    ).mockResolvedValue({ count: 1 });

    await expect(
      service.sendVersion(otherLecturer, 'version-1', sendDto),
    ).resolves.toMatchObject({ alertId: 'alert-1' });
  });

  it('người ngoài cuộc vẫn không được gửi', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(makeManagedVersion());

    await expect(
      service.sendVersion(otherLecturer, 'version-1', sendDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('StudentAnalysesService.dismissVersion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('bấm không gửi thì giữ nháp, không tạo cảnh báo', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(makeManagedVersion());
    (
      prisma.studentTermAnalysisVersion.updateMany as jest.Mock
    ).mockResolvedValue({ count: 1 });

    const result = await service.dismissVersion(ownerUser, 'version-1');

    expect(result).toMatchObject({ dismissed: true });
    const updateCalls = (
      prisma.studentTermAnalysisVersion.updateMany as unknown as jest.Mock
    ).mock.calls as [{ data: Record<string, unknown> }][];
    expect(updateCalls[0][0].data.dismissedById).toBe(ownerUser.id);
    expect(prisma.alert.create).not.toHaveBeenCalled();
  });

  it('không bỏ qua được bản đã gửi', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(
        makeManagedVersion({ status: StudentTermAnalysisStatus.SENT }),
      );

    await expect(
      service.dismissVersion(ownerUser, 'version-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('StudentAnalysesService — tự phân tích sau nhận xét', () => {
  beforeEach(() => jest.clearAllMocks());

  const autoInput = {
    user: ownerUser,
    studentId: 'student-1',
    term: '2025A',
    evaluationId: 'nx-1',
    revision: new Date('2026-09-08T02:00:00.000Z'),
  };

  it('tạo version chờ quyết định gửi và đẩy job sinh phân tích', async () => {
    const { prisma, queue, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(null);
    prisma.studentTermAnalysisVersion.findFirst = jest
      .fn()
      .mockResolvedValue(null);
    prisma.studentTermAnalysisVersion.create = jest.fn().mockResolvedValue(
      makeManagedVersion({
        id: 'version-auto',
        status: StudentTermAnalysisStatus.QUEUED,
        needsSendDecision: true,
      }),
    );

    const versionId = await service.requestAutoAnalysis(autoInput);

    expect(versionId).toBe('version-auto');
    const createCalls = (
      prisma.studentTermAnalysisVersion.create as unknown as jest.Mock
    ).mock.calls as [{ data: Record<string, unknown> }][];
    const created = createCalls[0][0];
    expect(created.data.needsSendDecision).toBe(true);
    expect(created.data.idempotencyKey).toBe(
      `evaluation:nx-1:${autoInput.revision.getTime()}`,
    );
    expect(queue.add).toHaveBeenCalledWith(
      'generate-analysis',
      { kind: 'generate', versionId: 'version-auto' },
      expect.objectContaining({ jobId: 'generate-version-auto' }),
    );
  });

  it('nuốt lỗi khi đang có version chạy dở, không làm hỏng lượt nhận xét', async () => {
    const { prisma, service } = makeService();
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValue(null);
    prisma.studentTermAnalysisVersion.findFirst = jest.fn().mockResolvedValue({
      id: 'version-dang-chay',
      status: StudentTermAnalysisStatus.QUEUED,
    });

    await expect(service.requestAutoAnalysis(autoInput)).resolves.toBeNull();
  });

  it('không chạy gì khi tính năng AI đang tắt', async () => {
    const { config, prisma, service } = makeService();
    config.get.mockImplementation((key: string, fallback?: string) =>
      key === 'AI_ANALYSIS_ENABLED' ? 'false' : fallback,
    );

    await expect(service.requestAutoAnalysis(autoInput)).resolves.toBeNull();
    expect(prisma.studentTermAnalysisVersion.create).not.toHaveBeenCalled();
  });
});

describe('StudentAnalysesService.processGeneration', () => {
  beforeEach(() => jest.clearAllMocks());

  function arrangeGenerated(ctx: ReturnType<typeof makeService>) {
    const { prisma, provider } = ctx;
    prisma.studentTermAnalysisVersion.findUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'version-1',
        status: StudentTermAnalysisStatus.QUEUED,
        sourceSnapshot: {
          focusTerm: '2025A',
          enrollments: [],
          evaluations: [],
          careLogs: [],
          riskScore: emptyRiskScore,
          limitations: [],
        },
        createdById: ownerUser.id,
      })
      .mockResolvedValue(makeManagedVersion());
    prisma.studentTermAnalysisVersion.updateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    provider.generate.mockResolvedValue({
      output: parsedOutput,
      model: 'gpt-5.6-luna',
      inputTokens: 10,
      outputTokens: 20,
    });
  }

  it('sinh xong thì dừng ở bản nháp, chờ người vừa nhận xét quyết định gửi', async () => {
    const ctx = makeService();
    arrangeGenerated(ctx);

    await ctx.service.processGeneration('version-1');

    const updateCalls = (
      ctx.prisma.studentTermAnalysisVersion.updateMany as unknown as jest.Mock
    ).mock.calls as [{ data: Record<string, unknown> }][];
    expect(updateCalls[1][0].data.status).toBe(StudentTermAnalysisStatus.DRAFT);
    expect(ctx.prisma.alert.create).not.toHaveBeenCalled();
    expect(ctx.escalation.computeRecipientIds).not.toHaveBeenCalled();
  });
});

describe('StudentAnalysesService — cấp độ cuối', () => {
  it('lấy mức cao nhất giữa DRS, ép từ dữ liệu và ép từ AI', () => {
    const { service } = makeService();
    expect(service.resolveFinalLevel(2, 3, null)).toBe(3);
    expect(service.resolveFinalLevel(2, 1, 4)).toBe(4);
    expect(service.resolveFinalLevel(4, 3, 3)).toBe(4);
    expect(service.resolveFinalLevel(1, 1, null)).toBe(1);
  });

  it('bỏ qua ép từ AI khi trích dẫn không có thật trong nhận xét nguồn', () => {
    const { service } = makeService();
    expect(
      service.aiForcedLevel(
        { rule: 'NO_LONGER_WANTS_TO_STUDY', quote: 'câu bịa', level: 4 },
        ['em vẫn đang cố gắng'],
      ),
    ).toBeNull();
    expect(
      service.aiForcedLevel(
        {
          rule: 'NO_LONGER_WANTS_TO_STUDY',
          quote: 'không còn muốn học',
          level: 4,
        },
        ['thưa cô em không còn muốn học nữa'],
      ),
    ).toBe(4);
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
