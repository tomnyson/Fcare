import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  StudentTermAnalysisStatus,
  type StudentTermAnalysisVersion,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { studentScope } from '../../common/utils/dept-scope';
import { isPrismaError } from '../../common/utils/prisma-error';
import { NotificationDispatchService } from '../alerts/notification-dispatch.service';
import { PrismaService } from '../../prisma/prisma.service';
import { academicAnalysisOutputSchema } from './analysis-output';
import { analysisSourceSnapshotSchema } from './analysis-source';
import {
  ACADEMIC_ANALYSIS_PROVIDER,
  type AcademicAnalysisProvider,
} from './analysis-provider';
import {
  DELIVER_ANALYSIS_JOB,
  GENERATE_ANALYSIS_JOB,
  STUDENT_ANALYSIS_QUEUE,
  type StudentAnalysisJobData,
} from './student-analysis.queue';
import { StudentAnalysisSourceService } from './student-analysis-source.service';
import type {
  CreateStudentTermAnalysisDto,
  UpdateStudentAnalysisDraftDto,
} from './dto/student-analysis.dto';

const ACTIVE_STATUSES = [
  StudentTermAnalysisStatus.QUEUED,
  StudentTermAnalysisStatus.GENERATING,
  StudentTermAnalysisStatus.SEND_QUEUED,
] as const;
const QUEUE_ATTEMPTS = 3;

type ManagedVersion = Prisma.StudentTermAnalysisVersionGetPayload<{
  include: {
    analysis: {
      include: {
        student: {
          select: {
            id: true;
            studentCode: true;
            fullName: true;
            departmentId: true;
          };
        };
        owner: { select: { id: true; staffCode: true; fullName: true } };
      };
    };
    createdBy: { select: { id: true; staffCode: true; fullName: true } };
    reviewedBy: { select: { id: true; staffCode: true; fullName: true } };
    recipients: {
      include: {
        recipient: {
          select: {
            id: true;
            staffCode: true;
            fullName: true;
            departmentId: true;
          };
        };
      };
      orderBy: { recipientFullName: 'asc' };
    };
  };
}>;

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

@Injectable()
export class StudentAnalysesService {
  private readonly logger = new Logger(StudentAnalysesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly source: StudentAnalysisSourceService,
    private readonly notifications: NotificationDispatchService,
    @Inject(ACADEMIC_ANALYSIS_PROVIDER)
    private readonly provider: AcademicAnalysisProvider,
    @InjectQueue(STUDENT_ANALYSIS_QUEUE)
    private readonly queue: Queue<StudentAnalysisJobData>,
  ) {}

  async listForStudent(user: AuthUser, studentId: string, term?: string) {
    this.assertEnabled();
    await this.requireStudentInScope(user, studentId);
    const analysis = term
      ? await this.prisma.studentTermAnalysis.findUnique({
          where: { studentId_term: { studentId, term } },
          include: {
            owner: { select: { id: true, staffCode: true, fullName: true } },
            versions: {
              orderBy: { version: 'desc' },
              select: {
                id: true,
                version: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                generatedAt: true,
                sentAt: true,
                errorMessage: true,
                editedOutput: true,
                aiOriginal: true,
                createdBy: {
                  select: { id: true, staffCode: true, fullName: true },
                },
                reviewedBy: {
                  select: { id: true, staffCode: true, fullName: true },
                },
              },
            },
          },
        })
      : null;
    if (!analysis) {
      return null;
    }
    const canManage =
      user.roles.includes('ADMIN') || analysis.ownerId === user.id;
    if (!canManage) {
      return null;
    }
    return {
      id: analysis.id,
      studentId,
      term: analysis.term,
      owner: analysis.owner,
      canManage,
      versions: analysis.versions.map((version) =>
        this.toVersionSummary(version),
      ),
    };
  }

  async createVersion(
    user: AuthUser,
    studentId: string,
    dto: CreateStudentTermAnalysisDto,
  ) {
    this.assertEnabled();
    await this.source.assertCanInitiate(user, studentId, dto.term);

    const analysis = await this.findOrCreateAnalysis(user, studentId, dto.term);
    if (analysis.ownerId !== user.id && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Chỉ người sở hữu hồ sơ phân tích hoặc admin được tạo version mới.',
      );
    }

    const existing = await this.prisma.studentTermAnalysisVersion.findFirst({
      where: { analysisId: analysis.id, idempotencyKey: dto.idempotencyKey },
      include: {
        createdBy: { select: { id: true, staffCode: true, fullName: true } },
        reviewedBy: { select: { id: true, staffCode: true, fullName: true } },
      },
    });
    if (existing) {
      if (existing.status === StudentTermAnalysisStatus.QUEUED) {
        await this.enqueueOrFail(existing.id, {
          kind: 'generate',
          versionId: existing.id,
        });
      }
      return this.toVersionSummary(existing);
    }

    const { snapshot, hash } = await this.source.buildSnapshot(
      studentId,
      dto.term,
    );
    const version = await this.createVersionRecord({
      analysisId: analysis.id,
      userId: user.id,
      idempotencyKey: dto.idempotencyKey,
      snapshot,
      hash,
    });

    await this.enqueueOrFail(version.id, {
      kind: 'generate',
      versionId: version.id,
    });
    try {
      await this.audit.log({
        staffId: user.id,
        action: 'STUDENT_TERM_ANALYSIS_REQUESTED',
        entity: 'StudentTermAnalysisVersion',
        entityId: version.id,
        metadata: {
          analysisId: analysis.id,
          studentId,
          term: dto.term,
          version: version.version,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Không ghi được audit yêu cầu phân tích ${version.id}: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
    }
    return this.toVersionSummary(version);
  }

  async getVersion(user: AuthUser, versionId: string) {
    this.assertEnabled();
    const version = await this.requireVersion(versionId);
    const canManage =
      user.roles.includes('ADMIN') || version.analysis.ownerId === user.id;
    if (canManage) {
      return this.toManagedVersion(version);
    }

    const recipient = version.recipients.find(
      (entry) => entry.recipientId === user.id,
    );
    if (version.status !== StudentTermAnalysisStatus.SENT || !recipient) {
      throw new NotFoundException('Không tìm thấy bản phân tích.');
    }

    if (!recipient.openedAt) {
      await this.prisma.studentTermAnalysisRecipient.update({
        where: { id: recipient.id },
        data: { openedAt: new Date() },
      });
    }

    return this.toRecipientVersion(version, recipient.recipientId);
  }

  async updateDraft(
    user: AuthUser,
    versionId: string,
    dto: UpdateStudentAnalysisDraftDto,
  ) {
    this.assertEnabled();
    const version = await this.requireVersion(versionId);
    this.assertOwnerOrAdmin(user, version.analysis.ownerId);
    if (version.status !== StudentTermAnalysisStatus.DRAFT) {
      throw new ConflictException({
        message: 'Chỉ bản nháp mới được chỉnh sửa.',
        code: 'ANALYSIS_NOT_DRAFT',
      });
    }

    const parsed = academicAnalysisOutputSchema.safeParse(dto.editedOutput);
    if (!parsed.success) {
      throw new ConflictException({
        message: 'Nội dung bản nháp không đúng cấu trúc phân tích.',
        code: 'INVALID_ANALYSIS_OUTPUT',
      });
    }

    const transitioned =
      await this.prisma.studentTermAnalysisVersion.updateMany({
        where: { id: versionId, status: StudentTermAnalysisStatus.DRAFT },
        data: {
          editedOutput: asJson(parsed.data),
          editedAt: new Date(),
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });
    if (transitioned.count === 0) throw this.transitionConflict();
    const updated =
      await this.prisma.studentTermAnalysisVersion.findUniqueOrThrow({
        where: { id: versionId },
        include: {
          createdBy: { select: { id: true, staffCode: true, fullName: true } },
          reviewedBy: { select: { id: true, staffCode: true, fullName: true } },
        },
      });

    await this.audit.log({
      staffId: user.id,
      action: 'STUDENT_TERM_ANALYSIS_EDITED',
      entity: 'StudentTermAnalysisVersion',
      entityId: versionId,
    });

    return this.toVersionSummary(updated);
  }

  async previewRecipients(user: AuthUser, versionId: string) {
    this.assertEnabled();
    const version = await this.requireVersion(versionId);
    this.assertOwnerOrAdmin(user, version.analysis.ownerId);
    if (version.status === StudentTermAnalysisStatus.SENT) {
      return version.recipients.map((recipient) => ({
        id: recipient.recipientId,
        staffCode: recipient.recipientStaffCode,
        fullName: recipient.recipientFullName,
        departmentId: recipient.recipientDepartmentId,
        openedAt: recipient.openedAt,
      }));
    }
    return this.resolveRecipients(
      version.analysis.studentId,
      version.analysis.term,
      user.id,
    );
  }

  async sendVersion(user: AuthUser, versionId: string) {
    this.assertEnabled();
    const version = await this.requireVersion(versionId);
    this.assertOwnerOrAdmin(user, version.analysis.ownerId);
    if (version.status !== StudentTermAnalysisStatus.DRAFT) {
      throw new ConflictException({
        message: 'Chỉ bản nháp đã sinh xong mới được gửi.',
        code: 'ANALYSIS_NOT_DRAFT',
      });
    }

    const recipients = await this.withSerializableRetry(async (tx) => {
      const current = await this.source.buildSnapshot(
        version.analysis.studentId,
        version.analysis.term,
        tx,
      );
      if (current.hash !== version.sourceHash) {
        throw new ConflictException({
          message: 'Dữ liệu học tập đã thay đổi, vui lòng tạo version mới.',
          code: 'STALE_ANALYSIS',
        });
      }
      const resolved = await this.resolveRecipients(
        version.analysis.studentId,
        version.analysis.term,
        user.id,
        tx,
      );
      if (resolved.length === 0) {
        throw new ConflictException({
          message:
            'Không tìm thấy giảng viên phù hợp để nhận bản phân tích này.',
          code: 'NO_RECIPIENTS',
        });
      }

      const transitioned = await tx.studentTermAnalysisVersion.updateMany({
        where: { id: versionId, status: StudentTermAnalysisStatus.DRAFT },
        data: {
          status: StudentTermAnalysisStatus.SEND_QUEUED,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });
      if (transitioned.count === 0) throw this.transitionConflict();
      await tx.studentTermAnalysisRecipient.deleteMany({
        where: { versionId },
      });
      await tx.studentTermAnalysisRecipient.createMany({
        data: resolved.map((recipient) => ({
          versionId,
          recipientId: recipient.id,
          recipientStaffCode: recipient.staffCode,
          recipientFullName: recipient.fullName,
          recipientDepartmentId: recipient.departmentId,
        })),
      });
      return resolved;
    });

    try {
      await this.queue.add(
        DELIVER_ANALYSIS_JOB,
        {
          kind: 'deliver',
          versionId: version.id,
        },
        {
          jobId: `deliver-${version.id}`,
          attempts: QUEUE_ATTEMPTS,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 500,
          removeOnFail: 1_000,
        },
      );
    } catch {
      await this.processDelivery(versionId);
    }
    const output = this.parseOutput(version.editedOutput ?? version.aiOriginal);
    return {
      versionId,
      status: StudentTermAnalysisStatus.SEND_QUEUED,
      recipientCount: recipients.length,
      notificationSummary: output.notificationSummary,
    };
  }

  async processGeneration(versionId: string) {
    const version = await this.prisma.studentTermAnalysisVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        status: true,
        sourceSnapshot: true,
        createdById: true,
      },
    });
    if (!version) {
      return;
    }
    if (
      version.status !== StudentTermAnalysisStatus.QUEUED &&
      version.status !== StudentTermAnalysisStatus.GENERATING
    ) {
      return;
    }

    const started = await this.prisma.studentTermAnalysisVersion.updateMany({
      where: {
        id: versionId,
        status: {
          in: [
            StudentTermAnalysisStatus.QUEUED,
            StudentTermAnalysisStatus.GENERATING,
          ],
        },
      },
      data: { status: StudentTermAnalysisStatus.GENERATING },
    });
    if (started.count === 0) return;

    const sourceSnapshot = analysisSourceSnapshotSchema.parse(
      version.sourceSnapshot,
    );
    const result = await this.provider.generate(sourceSnapshot);
    const completed = await this.prisma.studentTermAnalysisVersion.updateMany({
      where: {
        id: versionId,
        status: StudentTermAnalysisStatus.GENERATING,
      },
      data: {
        status: StudentTermAnalysisStatus.DRAFT,
        aiOriginal: asJson(result.output),
        editedOutput: asJson(result.output),
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        reasoningTokens: result.reasoningTokens,
        totalTokens: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
        generatedAt: new Date(),
      },
    });
    if (completed.count === 0) return;

    try {
      await this.audit.log({
        staffId: version.createdById,
        action: 'STUDENT_TERM_ANALYSIS_GENERATED',
        entity: 'StudentTermAnalysisVersion',
        entityId: versionId,
      });
    } catch (error) {
      this.logger.warn(
        `Không ghi được audit tạo phân tích ${versionId}: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
    }
  }

  async processDelivery(versionId: string) {
    const version = await this.requireVersion(versionId);
    if (version.status === StudentTermAnalysisStatus.SENT) return;
    if (version.status !== StudentTermAnalysisStatus.SEND_QUEUED) {
      return;
    }

    const output = this.parseOutput(version.editedOutput ?? version.aiOriginal);
    const recipientIds = version.recipients.map(
      (recipient) => recipient.recipientId,
    );
    await this.notifications.deliver({
      recipientIds,
      title: `Phân tích AI ${output.riskLevel}`,
      body: output.notificationSummary,
      source: {
        kind: 'analysis',
        analysisVersionId: version.id,
        targetUrl: `/student-analyses/${version.id}`,
      },
    });

    const notifications = await this.prisma.notification.findMany({
      where: {
        analysisVersionId: version.id,
        recipientId: { in: recipientIds },
      },
      select: { id: true, recipientId: true },
    });
    const byRecipient = new Map(
      notifications.map((notification) => [
        notification.recipientId,
        notification.id,
      ]),
    );

    const finalized = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.studentTermAnalysisVersion.updateMany({
        where: {
          id: version.id,
          status: StudentTermAnalysisStatus.SEND_QUEUED,
        },
        data: { status: StudentTermAnalysisStatus.SENT, sentAt: new Date() },
      });
      if (transition.count === 0) return false;
      for (const recipient of version.recipients) {
        const notificationId = byRecipient.get(recipient.recipientId);
        if (!notificationId) continue;
        await tx.studentTermAnalysisRecipient.update({
          where: { id: recipient.id },
          data: { notificationId },
        });
      }
      return true;
    });
    if (!finalized) return;

    try {
      await this.audit.log({
        staffId: version.reviewedById ?? version.createdById,
        action: 'STUDENT_TERM_ANALYSIS_SENT',
        entity: 'StudentTermAnalysisVersion',
        entityId: version.id,
        metadata: { recipientCount: recipientIds.length },
      });
    } catch (error) {
      this.logger.warn(
        `Không ghi được audit gửi phân tích ${versionId}: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
    }
  }

  async markGenerationFailed(versionId: string, error: Error) {
    const updated = await this.prisma.studentTermAnalysisVersion.updateMany({
      where: {
        id: versionId,
        status: {
          in: [
            StudentTermAnalysisStatus.QUEUED,
            StudentTermAnalysisStatus.GENERATING,
          ],
        },
      },
      data: {
        status: StudentTermAnalysisStatus.FAILED,
        errorMessage: `ANALYSIS_GENERATION_FAILED: ${error.message}`,
      },
    });
    if (updated.count === 0) return;
    await this.audit.log({
      action: 'STUDENT_TERM_ANALYSIS_FAILED',
      entity: 'StudentTermAnalysisVersion',
      entityId: versionId,
      metadata: { code: 'ANALYSIS_GENERATION_FAILED' },
    });
  }

  async markDeliveryFailed(versionId: string, error: Error) {
    this.logger.warn(
      `Gửi bản phân tích ${versionId} thất bại: ${error.message}`,
    );
    const delivered = await this.prisma.notification.count({
      where: { analysisVersionId: versionId },
    });
    if (delivered > 0) {
      try {
        await this.processDelivery(versionId);
      } catch (recoveryError) {
        this.logger.warn(
          `Khôi phục delivery ${versionId} chưa thành công: ${recoveryError instanceof Error ? recoveryError.message : 'lỗi không xác định'}`,
        );
        await this.queue.add(
          DELIVER_ANALYSIS_JOB,
          { kind: 'deliver', versionId },
          {
            jobId: `analysis-reconcile-${versionId}-${Date.now()}`,
            attempts: QUEUE_ATTEMPTS,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        );
      }
      return;
    }
    await this.prisma.studentTermAnalysisVersion.updateMany({
      where: {
        id: versionId,
        status: StudentTermAnalysisStatus.SEND_QUEUED,
      },
      data: { status: StudentTermAnalysisStatus.DRAFT },
    });
  }

  private assertEnabled() {
    if (!isEnabled(this.config.get<string>('AI_ANALYSIS_ENABLED', 'false'))) {
      throw new NotFoundException({
        message: 'Tính năng phân tích AI hiện chưa được bật.',
        code: 'AI_ANALYSIS_DISABLED',
      });
    }
  }

  private analysisModel() {
    return this.provider.modelName();
  }

  private async createVersionRecord(input: {
    analysisId: string;
    userId: string;
    idempotencyKey: string;
    snapshot: unknown;
    hash: string;
  }) {
    try {
      return await this.withSerializableRetry(async (tx) => {
        const idempotent = await tx.studentTermAnalysisVersion.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: {
            createdBy: {
              select: { id: true, staffCode: true, fullName: true },
            },
            reviewedBy: {
              select: { id: true, staffCode: true, fullName: true },
            },
          },
        });
        if (idempotent) {
          if (idempotent.analysisId !== input.analysisId) {
            throw new ConflictException({
              message:
                'Idempotency key đã được dùng cho một hồ sơ phân tích khác.',
              code: 'IDEMPOTENCY_KEY_REUSED',
            });
          }
          return idempotent;
        }

        const active = await tx.studentTermAnalysisVersion.findFirst({
          where: {
            analysisId: input.analysisId,
            status: { in: [...ACTIVE_STATUSES] },
          },
        });
        if (active) {
          throw new ConflictException({
            message:
              'Đang có một version phân tích chưa hoàn tất cho học kỳ này.',
            code: 'ACTIVE_ANALYSIS_VERSION',
          });
        }

        const latest = await tx.studentTermAnalysisVersion.findFirst({
          where: { analysisId: input.analysisId },
          orderBy: { version: 'desc' },
          select: { id: true, version: true, status: true, sourceHash: true },
        });
        if (
          latest?.status === StudentTermAnalysisStatus.SENT &&
          latest.sourceHash === input.hash
        ) {
          throw new ConflictException({
            message:
              'Dữ liệu nguồn chưa thay đổi kể từ version đã gửi gần nhất.',
            code: 'ANALYSIS_SOURCE_UNCHANGED',
          });
        }
        if (latest?.status === StudentTermAnalysisStatus.DRAFT) {
          const superseded = await tx.studentTermAnalysisVersion.updateMany({
            where: { id: latest.id, status: StudentTermAnalysisStatus.DRAFT },
            data: { status: StudentTermAnalysisStatus.SUPERSEDED },
          });
          if (superseded.count === 0) {
            throw this.transitionConflict();
          }
        }

        return tx.studentTermAnalysisVersion.create({
          data: {
            analysisId: input.analysisId,
            version: (latest?.version ?? 0) + 1,
            status: StudentTermAnalysisStatus.QUEUED,
            idempotencyKey: input.idempotencyKey,
            sourceSnapshot: asJson(input.snapshot),
            sourceHash: input.hash,
            model: this.analysisModel(),
            promptVersion: this.provider.promptVersion(),
            createdById: input.userId,
          },
          include: {
            createdBy: {
              select: { id: true, staffCode: true, fullName: true },
            },
            reviewedBy: {
              select: { id: true, staffCode: true, fullName: true },
            },
          },
        });
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        const winner = await this.prisma.studentTermAnalysisVersion.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: {
            createdBy: {
              select: { id: true, staffCode: true, fullName: true },
            },
            reviewedBy: {
              select: { id: true, staffCode: true, fullName: true },
            },
          },
        });
        if (winner) {
          if (winner.analysisId !== input.analysisId) {
            throw new ConflictException({
              message:
                'Idempotency key đã được dùng cho một hồ sơ phân tích khác.',
              code: 'IDEMPOTENCY_KEY_REUSED',
            });
          }
          return winner;
        }
        throw new ConflictException({
          message: 'Một version khác vừa được tạo. Vui lòng tải lại.',
          code: 'ACTIVE_ANALYSIS_VERSION',
        });
      }
      throw error;
    }
  }

  private async requireStudentInScope(
    user: AuthUser,
    studentId: string,
  ): Promise<void> {
    const student: { id: string } | null = await this.prisma.student.findFirst({
      where: { id: studentId, ...studentScope(user) },
      select: { id: true },
    });
    if (!student) {
      throw new NotFoundException('Không tìm thấy sinh viên.');
    }
  }

  private async findOrCreateAnalysis(
    user: AuthUser,
    studentId: string,
    term: string,
  ) {
    return this.prisma.studentTermAnalysis.upsert({
      where: { studentId_term: { studentId, term } },
      create: { studentId, term, ownerId: user.id },
      update: {},
    });
  }

  private async withSerializableRetry<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!isPrismaError(error, 'P2034') || attempt === 2) throw error;
      }
    }
    throw new Error('Serializable transaction retry exhausted.');
  }

  private transitionConflict(): ConflictException {
    return new ConflictException({
      message: 'Trạng thái phân tích vừa thay đổi. Vui lòng tải lại.',
      code: 'ANALYSIS_STATE_CHANGED',
    });
  }

  private async requireVersion(versionId: string): Promise<ManagedVersion> {
    const version = await this.prisma.studentTermAnalysisVersion.findUnique({
      where: { id: versionId },
      include: {
        analysis: {
          include: {
            student: {
              select: {
                id: true,
                studentCode: true,
                fullName: true,
                departmentId: true,
              },
            },
            owner: { select: { id: true, staffCode: true, fullName: true } },
          },
        },
        createdBy: { select: { id: true, staffCode: true, fullName: true } },
        reviewedBy: { select: { id: true, staffCode: true, fullName: true } },
        recipients: {
          include: {
            recipient: {
              select: {
                id: true,
                staffCode: true,
                fullName: true,
                departmentId: true,
              },
            },
          },
          orderBy: { recipientFullName: 'asc' },
        },
      },
    });
    if (!version) {
      throw new NotFoundException('Không tìm thấy bản phân tích.');
    }
    return version;
  }

  private assertOwnerOrAdmin(user: AuthUser, ownerId: string) {
    if (!user.roles.includes('ADMIN') && user.id !== ownerId) {
      throw new ForbiddenException(
        'Chỉ người sở hữu hồ sơ phân tích hoặc admin được thao tác.',
      );
    }
  }

  private parseOutput(output: unknown) {
    const parsed = academicAnalysisOutputSchema.safeParse(output);
    if (!parsed.success) {
      throw new ConflictException({
        message: 'Bản phân tích không còn dữ liệu output hợp lệ.',
        code: 'INVALID_ANALYSIS_OUTPUT',
      });
    }
    return parsed.data;
  }

  private async resolveRecipients(
    studentId: string,
    term: string,
    senderId: string,
    db: Pick<Prisma.TransactionClient, 'enrollment'> = this.prisma,
  ) {
    const enrollments = await db.enrollment.findMany({
      where: {
        studentId,
        classSection: { term, lecturerId: { not: null } },
      },
      select: {
        classSection: {
          select: {
            lecturer: {
              select: {
                id: true,
                staffCode: true,
                fullName: true,
                departmentId: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
    const recipients = new Map<
      string,
      {
        id: string;
        staffCode: string;
        fullName: string;
        departmentId: string | null;
      }
    >();
    for (const enrollment of enrollments) {
      const lecturer = enrollment.classSection.lecturer;
      if (!lecturer?.isActive || lecturer.id === senderId) {
        continue;
      }
      recipients.set(lecturer.id, {
        id: lecturer.id,
        staffCode: lecturer.staffCode,
        fullName: lecturer.fullName,
        departmentId: lecturer.departmentId,
      });
    }
    return [...recipients.values()].sort((left, right) =>
      left.fullName.localeCompare(right.fullName, 'vi'),
    );
  }

  private async enqueueOrFail(versionId: string, data: StudentAnalysisJobData) {
    try {
      await this.queue.add(
        data.kind === 'generate' ? GENERATE_ANALYSIS_JOB : DELIVER_ANALYSIS_JOB,
        data,
        {
          jobId: `${data.kind}-${versionId}`,
          attempts: QUEUE_ATTEMPTS,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 500,
          removeOnFail: 1_000,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Không enqueue được job phân tích ${versionId}: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
      throw new ServiceUnavailableException({
        message: 'Hàng đợi phân tích AI hiện không khả dụng.',
        code: 'ANALYSIS_QUEUE_UNAVAILABLE',
      });
    }
  }

  private toVersionSummary(
    version: Pick<
      StudentTermAnalysisVersion,
      | 'id'
      | 'version'
      | 'status'
      | 'createdAt'
      | 'updatedAt'
      | 'generatedAt'
      | 'sentAt'
      | 'errorMessage'
    > & {
      editedOutput?: unknown;
      aiOriginal?: unknown;
      createdBy?: { id: string; staffCode: string; fullName: string } | null;
      reviewedBy?: { id: string; staffCode: string; fullName: string } | null;
    },
  ) {
    const output =
      version.editedOutput || version.aiOriginal
        ? this.parseOutput(version.editedOutput ?? version.aiOriginal)
        : null;
    return {
      id: version.id,
      version: version.version,
      status: version.status,
      riskLevel: output?.riskLevel ?? null,
      notificationSummary: output?.notificationSummary ?? null,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      generatedAt: version.generatedAt,
      sentAt: version.sentAt,
      errorMessage: version.errorMessage,
      createdBy: version.createdBy ?? null,
      reviewedBy: version.reviewedBy ?? null,
    };
  }

  private toManagedVersion(version: ManagedVersion) {
    return {
      id: version.id,
      version: version.version,
      status: version.status,
      term: version.analysis.term,
      student: version.analysis.student,
      owner: version.analysis.owner,
      createdBy: version.createdBy,
      reviewedBy: version.reviewedBy,
      sourceSnapshot: version.sourceSnapshot,
      sourceHash: version.sourceHash,
      aiOriginal: version.aiOriginal,
      editedOutput: version.editedOutput,
      model: version.model,
      promptVersion: version.promptVersion,
      usage: {
        inputTokens: version.inputTokens,
        outputTokens: version.outputTokens,
        reasoningTokens: version.reasoningTokens,
        totalTokens: version.totalTokens,
      },
      errorMessage: version.errorMessage,
      requestedAt: version.requestedAt,
      generatedAt: version.generatedAt,
      editedAt: version.editedAt,
      reviewedAt: version.reviewedAt,
      sentAt: version.sentAt,
      recipients: version.recipients.map((recipient) => ({
        id: recipient.recipientId,
        staffCode: recipient.recipientStaffCode,
        fullName: recipient.recipientFullName,
        departmentId: recipient.recipientDepartmentId,
        openedAt: recipient.openedAt,
        notificationId: recipient.notificationId,
      })),
    };
  }

  private toRecipientVersion(version: ManagedVersion, recipientId: string) {
    const output = this.parseOutput(version.editedOutput ?? version.aiOriginal);
    const recipient = version.recipients.find(
      (entry) => entry.recipientId === recipientId,
    );
    return {
      id: version.id,
      version: version.version,
      status: version.status,
      term: version.analysis.term,
      student: {
        id: version.analysis.student.id,
        studentCode: version.analysis.student.studentCode,
        fullName: version.analysis.student.fullName,
      },
      editedOutput: output,
      sentAt: version.sentAt,
      sender: version.reviewedBy ?? version.createdBy,
      recipient: recipient
        ? {
            id: recipient.recipientId,
            staffCode: recipient.recipientStaffCode,
            fullName: recipient.recipientFullName,
            openedAt: recipient.openedAt,
          }
        : null,
      disclaimer:
        'Nội dung AI chỉ mang tính hỗ trợ và đã được giảng viên duyệt.',
    };
  }
}
