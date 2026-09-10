import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
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
  AnalysisContentSource,
  Prisma,
  StudentTermAnalysisStatus,
  type StudentTermAnalysisVersion,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { AuditService } from '../../audit/audit.service';
import type { UrgencyLevel } from '@fcare/shared-types';
import type { AuthUser } from '../../common/types/auth-user';
import { studentScope } from '../../common/utils/dept-scope';
import { isPrismaError } from '../../common/utils/prisma-error';
import { EscalationService } from '../alerts/escalation.service';
import { NotificationDispatchService } from '../alerts/notification-dispatch.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  academicAnalysisOutputSchema,
  type AcademicAnalysisOutput,
} from './analysis-output';
import {
  analysisSourceSnapshotSchema,
  containsForbiddenAnalysisPii,
  redactAnalysisText,
} from './analysis-source';
import { careHistoryDigest } from './care-history-digest';
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
  SendAnalysisDto,
  UpdateStudentAnalysisDraftDto,
} from './dto/student-analysis.dto';

const ACTIVE_STATUSES = [
  StudentTermAnalysisStatus.QUEUED,
  StudentTermAnalysisStatus.GENERATING,
  StudentTermAnalysisStatus.SEND_QUEUED,
] as const;
const QUEUE_ATTEMPTS = 3;
/** Cảnh báo cấp 4 bắt buộc có lý do dài tối thiểu — dùng chung cho cả hai luồng gửi. */
const REASON_MIN_LENGTH = 40;

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
    private readonly escalation: EscalationService,
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

  /**
   * Giảng viên vừa lưu nhận xét: hệ thống tự xin AI tổng hợp, sinh xong thì
   * đánh dấu `needsSendDecision` để hỏi lại chính người đó có gửi cảnh báo hay
   * không. Cấp độ khẩn vẫn do server chốt (DRS + ép dữ liệu + ép từ AI). Mọi
   * lỗi ở đây đều bị nuốt: nhận xét đã lưu xong thì không được hỏng chỉ vì AI
   * hay hàng đợi trục trặc.
   */
  async requestAutoAnalysis(input: {
    user: AuthUser;
    studentId: string;
    term: string;
    evaluationId: string;
    /** Mốc sửa của nhận xét — mỗi lần sửa là một lượt phân tích mới. */
    revision: Date;
  }): Promise<string | null> {
    if (!isEnabled(this.config.get<string>('AI_ANALYSIS_ENABLED', 'false'))) {
      return null;
    }
    try {
      await this.source.assertCanInitiate(
        input.user,
        input.studentId,
        input.term,
      );
      const analysis = await this.findOrCreateAnalysis(
        input.user,
        input.studentId,
        input.term,
      );
      const { snapshot, hash } = await this.source.buildSnapshot(
        input.studentId,
        input.term,
      );
      const version = await this.createVersionRecord({
        analysisId: analysis.id,
        userId: input.user.id,
        // Cùng một lần lưu nhận xét chỉ sinh đúng một version, kể cả khi request
        // bị gửi lại.
        idempotencyKey: `evaluation:${input.evaluationId}:${input.revision.getTime()}`,
        snapshot,
        hash,
        needsSendDecision: true,
      });
      if (version.status === StudentTermAnalysisStatus.QUEUED) {
        try {
          await this.enqueueOrFail(version.id, {
            kind: 'generate',
            versionId: version.id,
          });
        } catch {
          // Hàng đợi chết thì chạy đồng bộ, giống fallback của escalation.
          await this.processGeneration(version.id);
        }
      }
      await this.audit.log({
        staffId: input.user.id,
        action: 'STUDENT_TERM_ANALYSIS_AUTO_REQUESTED',
        entity: 'StudentTermAnalysisVersion',
        entityId: version.id,
        metadata: {
          analysisId: analysis.id,
          studentId: input.studentId,
          term: input.term,
          evaluationId: input.evaluationId,
        },
      });
      return version.id;
    } catch (error) {
      // ACTIVE_ANALYSIS_VERSION / ANALYSIS_SOURCE_UNCHANGED là chuyện thường:
      // hai giảng viên nhận xét sát nhau thì bản đang chạy đã gánh dữ liệu mới.
      this.logger.warn(
        `Không tự phân tích được sau nhận xét ${input.evaluationId}: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
      return null;
    }
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

  async previewRecipients(user: AuthUser, versionId: string, level?: number) {
    this.assertEnabled();
    const version = await this.requireVersion(versionId);
    this.assertCanDecide(user, version);
    if (version.status === StudentTermAnalysisStatus.SENT) {
      // Đã gửi thì chốt theo danh sách đã lưu, không tính lại ma trận.
      return {
        systemLevel: null,
        level: null,
        recipients: version.recipients.map((recipient) => ({
          id: recipient.recipientId,
          staffCode: recipient.recipientStaffCode,
          fullName: recipient.recipientFullName,
          departmentId: recipient.recipientDepartmentId,
          openedAt: recipient.openedAt,
        })),
      };
    }

    // Xem trước theo đúng ma trận sẽ dùng lúc gửi: cấp người duyệt đang chọn,
    // nhưng không bao giờ thấp hơn mức hệ thống tính.
    const systemLevel = this.systemLevel(version);
    const previewLevel = Math.max(level ?? systemLevel, systemLevel);
    const recipientIds = await this.escalation.computeRecipientIds(
      version.analysis.studentId,
      previewLevel,
      user.id,
    );
    const staff = await this.prisma.staff.findMany({
      where: { id: { in: recipientIds } },
      select: {
        id: true,
        staffCode: true,
        fullName: true,
        departmentId: true,
      },
      orderBy: { fullName: 'asc' },
    });
    return { systemLevel, level: previewLevel, recipients: staff };
  }

  /**
   * Cấp cuối luôn tính ở server: lấy mức cao nhất giữa DRS, ép từ dữ liệu và
   * ép từ AI. Không tin thẳng `suggestedLevel` của mô hình.
   */
  resolveFinalLevel(
    drsLevel: number,
    dataForcedLevel: number,
    aiForcedLevel: number | null,
  ): UrgencyLevel {
    return Math.max(
      drsLevel,
      dataForcedLevel,
      aiForcedLevel ?? 1,
    ) as UrgencyLevel;
  }

  /**
   * Chỉ chấp nhận ép cấp khi AI trích được nguyên văn một đoạn CÓ THẬT trong
   * nhận xét nguồn. Không kiểm được thì coi như không ép.
   */
  aiForcedLevel(
    forced: AcademicAnalysisOutput['forcedEscalation'],
    sourceNotes: string[],
  ): number | null {
    if (!forced) return null;
    const needle = forced.quote.trim().toLowerCase();
    if (needle.length === 0) return null;
    const found = sourceNotes.some((note) =>
      note.toLowerCase().includes(needle),
    );
    return found ? forced.level : null;
  }

  /** Cấp hệ thống đề xuất cho một version: đọc từ snapshot đã băm + output AI. */
  private systemLevel(version: {
    sourceSnapshot: unknown;
    editedOutput?: unknown;
    aiOriginal?: unknown;
  }): UrgencyLevel {
    const snapshot = analysisSourceSnapshotSchema.safeParse(
      version.sourceSnapshot,
    );
    if (!snapshot.success) return 1;
    const output = academicAnalysisOutputSchema.safeParse(
      version.editedOutput ?? version.aiOriginal,
    );
    const notes = snapshot.data.evaluations
      .map((item) => item.note)
      .filter((note): note is string => Boolean(note));
    const forced = output.success
      ? this.aiForcedLevel(output.data.forcedEscalation, notes)
      : null;
    return this.resolveFinalLevel(
      snapshot.data.riskScore.drsLevel,
      snapshot.data.riskScore.dataForcedLevel,
      forced,
    );
  }

  async sendVersion(user: AuthUser, versionId: string, dto: SendAnalysisDto) {
    this.assertEnabled();
    const version = await this.requireVersion(versionId);
    this.assertCanDecide(user, version);
    if (version.status !== StudentTermAnalysisStatus.DRAFT) {
      throw new ConflictException({
        message: 'Chỉ bản nháp đã sinh xong mới được gửi.',
        code: 'ANALYSIS_NOT_DRAFT',
      });
    }

    const systemLevel = this.systemLevel(version);
    if (dto.confirmedLevel < systemLevel) {
      throw new BadRequestException({
        message: `Không được hạ độ khẩn xuống dưới mức hệ thống tính (cấp ${systemLevel}).`,
        code: 'LEVEL_BELOW_SYSTEM',
      });
    }

    const output = this.parseOutput(version.editedOutput ?? version.aiOriginal);
    const { content, reason } = this.sendContent(version, dto, output);
    if (dto.confirmedLevel === 4 && content.length < REASON_MIN_LENGTH) {
      throw new BadRequestException({
        message: 'Cảnh báo cấp 4 phải ghi lý do từ 40 ký tự trở lên.',
        code: 'REASON_TOO_SHORT',
      });
    }

    const sent = await this.commitSend({
      version,
      actorId: user.id,
      // DTO đã chặn 1..4 bằng validator nên ép kiểu ở đây là an toàn.
      level: dto.confirmedLevel as UrgencyLevel,
      reason,
    });
    await this.prisma.studentTermAnalysisVersion.update({
      where: { id: versionId },
      data: {
        contentSource: dto.contentSource ?? AnalysisContentSource.AI,
        lecturerNote: dto.contentSource === 'LECTURER' ? content : null,
        needsSendDecision: false,
      },
    });
    return {
      versionId,
      status: StudentTermAnalysisStatus.SEND_QUEUED,
      recipientCount: sent.recipients.length,
      alertId: sent.alertId,
      level: dto.confirmedLevel,
      notificationSummary: content,
    };
  }

  /**
   * Hai lựa chọn khi gửi: dùng nguyên bản AI tổng hợp, hoặc giảng viên tự soạn.
   * Bản tự soạn phải kèm lịch sử chăm sóc gần đây thì người nhận mới đủ ngữ
   * cảnh (bản AI đã tự gộp phần này khi sinh nội dung).
   */
  private sendContent(
    version: ManagedVersion,
    dto: SendAnalysisDto,
    output: AcademicAnalysisOutput,
  ): { content: string; reason: string } {
    if (dto.contentSource !== 'LECTURER') {
      const aiReason = this.aiReason(output);
      return { content: aiReason, reason: aiReason };
    }

    const note = dto.lecturerNote?.trim() ?? '';
    if (note.length < REASON_MIN_LENGTH) {
      throw new BadRequestException({
        message: `Nội dung bạn tự soạn phải từ ${REASON_MIN_LENGTH} ký tự trở lên.`,
        code: 'LECTURER_NOTE_TOO_SHORT',
      });
    }
    // Rule bảo mật #1: không để lọt số điện thoại/email/CCCD/địa chỉ vào cảnh báo.
    if (containsForbiddenAnalysisPii(note)) {
      throw new BadRequestException({
        message:
          'Nội dung chứa thông tin cá nhân bị cấm (số điện thoại, email, CCCD, địa chỉ). Vui lòng bỏ ra trước khi gửi.',
        code: 'ANALYSIS_PII_REJECTED',
      });
    }
    const content = redactAnalysisText(note, [version.analysis.studentId]);

    const snapshot = analysisSourceSnapshotSchema.safeParse(
      version.sourceSnapshot,
    );
    const digest = snapshot.success
      ? careHistoryDigest(snapshot.data.careLogs)
      : '';
    return {
      content,
      reason: digest
        ? `${content}\n\nLịch sử chăm sóc gần đây:\n${digest}`
        : content,
    };
  }

  /**
   * Bấm "Không gửi": bản nháp vẫn còn nguyên để gửi tay sau, chỉ ghi lại ai đã
   * bỏ qua lời gợi ý để không hỏi lại.
   */
  async dismissVersion(user: AuthUser, versionId: string) {
    this.assertEnabled();
    const version = await this.requireVersion(versionId);
    this.assertCanDecide(user, version);
    if (version.status !== StudentTermAnalysisStatus.DRAFT) {
      throw new ConflictException({
        message: 'Chỉ bản nháp đang chờ quyết định mới bỏ qua được.',
        code: 'ANALYSIS_NOT_DRAFT',
      });
    }

    const dismissed = await this.prisma.studentTermAnalysisVersion.updateMany({
      where: { id: versionId, status: StudentTermAnalysisStatus.DRAFT },
      data: {
        dismissedById: user.id,
        dismissedAt: new Date(),
        needsSendDecision: false,
      },
    });
    if (dismissed.count === 0) throw this.transitionConflict();

    await this.audit.log({
      staffId: user.id,
      action: 'STUDENT_TERM_ANALYSIS_SEND_DISMISSED',
      entity: 'StudentTermAnalysisVersion',
      entityId: versionId,
    });
    return { versionId, dismissed: true };
  }

  /**
   * Lõi dùng chung của luồng gửi: chốt cảnh báo + danh sách người nhận trong
   * một transaction rồi đẩy job giao thông báo. Mọi lượt gửi — dùng bản AI hay
   * bản giảng viên tự soạn — đều đi qua đây, nên ma trận người nhận và bản ghi
   * cảnh báo chỉ có duy nhất một đường.
   */
  private async commitSend(input: {
    version: ManagedVersion;
    actorId: string;
    level: UrgencyLevel;
    reason: string;
  }) {
    const { version, actorId, level, reason } = input;
    const sent = await this.withSerializableRetry(async (tx) => {
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

      // Người nhận đi theo ma trận độ khẩn (flow.png), không còn theo lớp học phần.
      const recipientIds = await this.escalation.computeRecipientIds(
        version.analysis.studentId,
        level,
        actorId,
      );
      if (recipientIds.length === 0) {
        throw new ConflictException({
          message: 'Không tìm thấy người nhận phù hợp cho bản phân tích này.',
          code: 'NO_RECIPIENTS',
        });
      }
      const resolved = await tx.staff.findMany({
        where: { id: { in: recipientIds } },
        select: {
          id: true,
          staffCode: true,
          fullName: true,
          departmentId: true,
        },
        orderBy: { fullName: 'asc' },
      });

      const alert = await tx.alert.create({
        data: {
          studentId: version.analysis.studentId,
          raisedById: actorId,
          level,
          reason,
        },
        select: { id: true },
      });

      const transitioned = await tx.studentTermAnalysisVersion.updateMany({
        where: { id: version.id, status: StudentTermAnalysisStatus.DRAFT },
        data: {
          status: StudentTermAnalysisStatus.SEND_QUEUED,
          reviewedById: actorId,
          reviewedAt: new Date(),
          alertId: alert.id,
        },
      });
      if (transitioned.count === 0) throw this.transitionConflict();
      await tx.studentTermAnalysisRecipient.deleteMany({
        where: { versionId: version.id },
      });
      await tx.studentTermAnalysisRecipient.createMany({
        data: resolved.map((recipient) => ({
          versionId: version.id,
          recipientId: recipient.id,
          recipientStaffCode: recipient.staffCode,
          recipientFullName: recipient.fullName,
          recipientDepartmentId: recipient.departmentId,
        })),
      });
      return { recipients: resolved, alertId: alert.id };
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
      await this.processDelivery(version.id);
    }
    return sent;
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

  /**
   * Nội dung gửi khi giảng viên chọn "dùng bản AI": bám nguyên văn
   * `notificationSummary` để người nhận đọc đúng thứ AI tổng hợp (bản này đã
   * gộp sẵn nhận xét và lịch sử chăm sóc); chỉ nối thêm câu trích khi AI ép
   * cấp, vì luật ép cấp yêu cầu dẫn chứng nguyên văn từ nhận xét.
   */
  private aiReason(output: AcademicAnalysisOutput): string {
    const summary = output.notificationSummary.trim();
    const quote = output.forcedEscalation?.quote.trim();
    return quote ? `${summary} Trích nhận xét: “${quote}”.` : summary;
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
        alertId: version.alertId ?? undefined,
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
    /**
     * Bản do hệ thống tự sinh sau nhận xét: sinh xong thì hỏi người vừa nhận
     * xét có gửi hay không chứ không tự gửi.
     */
    needsSendDecision?: boolean;
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
            needsSendDecision: input.needsSendDecision ?? false,
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

  /**
   * Người được quyết định gửi hay không: chủ hồ sơ, admin, và chính giảng viên
   * vừa nhận xét (bản phân tích sinh ra từ lượt nhận xét của họ) — phạm vi sinh
   * viên đã được kiểm ở `assertCanInitiate` lúc tạo version.
   */
  private assertCanDecide(
    user: AuthUser,
    version: { analysis: { ownerId: string }; createdById: string },
  ) {
    if (
      user.roles.includes('ADMIN') ||
      user.id === version.analysis.ownerId ||
      user.id === version.createdById
    ) {
      return;
    }
    throw new ForbiddenException(
      'Chỉ người sở hữu hồ sơ phân tích, người vừa nhận xét hoặc admin được thao tác.',
    );
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
      needsSendDecision: version.needsSendDecision,
      contentSource: version.contentSource,
      dismissedAt: version.dismissedAt,
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
