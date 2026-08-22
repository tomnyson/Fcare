import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AlertStatus, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  ALERT_LEVEL_LABELS,
  MIN_CRITICAL_REASON_LENGTH,
  type AlertLevel,
} from '@fcare/shared-types';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { deptFilter, isDeptScoped } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ListAlertsQuery,
  RaiseAlertDto,
  ResolveAlertDto,
} from './dto/alert.dto';
import { EscalationService } from './escalation.service';
import {
  ALERT_ESCALATION_QUEUE,
  DELIVER_NOTIFICATIONS_JOB,
  NotificationDispatchService,
  type EscalationJobData,
} from './notification-dispatch.service';

function levelLabel(level: number): string {
  return ALERT_LEVEL_LABELS[`L${level}` as AlertLevel] ?? `Mức ${level}`;
}

/** Enqueue phải fail nhanh khi Redis không phản hồi để còn fallback đồng bộ. */
const ENQUEUE_TIMEOUT_MS = 1_500;

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly escalationService: EscalationService,
    private readonly auditService: AuditService,
    private readonly dispatchService: NotificationDispatchService,
    @InjectQueue(ALERT_ESCALATION_QUEUE)
    private readonly escalationQueue: Queue<EscalationJobData>,
  ) {
    // Queue không có listener 'error' sẽ ném unhandled và crash tiến trình;
    // enqueue đã có fallback đồng bộ nên chỉ cần log cảnh báo.
    this.escalationQueue.on('error', (error: Error) => {
      this.logger.warn(`Queue escalation gặp lỗi Redis: ${error.message}`);
    });
  }

  async list(user: AuthUser, query: ListAlertsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.AlertWhereInput = {
      status: query.status,
      level: query.level,
      studentId: query.studentId,
      student: deptFilter(user),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.alert.findMany({
        where,
        orderBy: [{ status: 'asc' }, { level: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: {
            select: {
              id: true,
              studentCode: true,
              fullName: true,
              classCode: true,
              department: { select: { code: true, name: true } },
            },
          },
          raisedBy: { select: { id: true, staffCode: true, fullName: true } },
          resolvedBy: { select: { id: true, staffCode: true, fullName: true } },
        },
      }),
      this.prisma.alert.count({ where }),
    ]);

    return { items, meta: { total, page, limit } };
  }

  async raise(user: AuthUser, dto: RaiseAlertDto) {
    if (
      dto.level === 4 &&
      dto.reason.trim().length < MIN_CRITICAL_REASON_LENGTH
    ) {
      throw new BadRequestException(
        `Cảnh báo mức Khẩn cấp cần lý do tối thiểu ${MIN_CRITICAL_REASON_LENGTH} ký tự.`,
      );
    }

    // Giảng viên/TBM chỉ được phát cảnh báo cho sinh viên bộ môn mình.
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, ...deptFilter(user) },
    });
    if (!student) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong phạm vi quản lý của bạn.',
      );
    }

    const recipientIds = await this.escalationService.computeRecipientIds(
      dto.studentId,
      dto.level,
      user.id,
    );

    const alert = await this.prisma.alert.create({
      data: {
        studentId: dto.studentId,
        raisedById: user.id,
        level: dto.level,
        reason: dto.reason,
      },
    });

    if (recipientIds.length > 0) {
      await this.dispatchNotifications({
        alertId: alert.id,
        recipientIds,
        title: `Cảnh báo ${levelLabel(dto.level)} — ${student.fullName} (${student.studentCode})`,
        body: dto.reason,
      });
    }

    await this.auditService.log({
      staffId: user.id,
      action: 'ALERT_RAISED',
      entity: 'Alert',
      entityId: alert.id,
      metadata: {
        level: dto.level,
        studentId: dto.studentId,
        recipients: recipientIds.length,
      },
    });

    return { ...alert, notifiedCount: recipientIds.length };
  }

  /**
   * Ưu tiên đưa vào queue BullMQ (retry 3 lần, backoff lũy tiến).
   * Redis lỗi/treo → fallback gửi đồng bộ để cảnh báo không bao giờ mất thông báo;
   * unique (alertId, recipientId) đảm bảo không trùng nếu cả hai đường cùng chạy.
   */
  private async dispatchNotifications(data: EscalationJobData): Promise<void> {
    try {
      await Promise.race([
        this.escalationQueue.add(DELIVER_NOTIFICATIONS_JOB, data, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Enqueue quá thời gian chờ Redis.')),
            ENQUEUE_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (error) {
      this.logger.warn(
        `Không enqueue được escalation (${error instanceof Error ? error.message : 'lỗi không xác định'}) — chuyển gửi đồng bộ.`,
      );
      await this.dispatchService.deliver(data);
    }
  }

  async acknowledge(user: AuthUser, id: string) {
    const alert = await this.requireInScope(user, id);
    if (alert.status !== AlertStatus.OPEN) {
      throw new BadRequestException(
        'Cảnh báo không ở trạng thái chờ tiếp nhận.',
      );
    }
    return this.prisma.alert.update({
      where: { id },
      data: { status: AlertStatus.ACKNOWLEDGED },
    });
  }

  async resolve(user: AuthUser, id: string, dto: ResolveAlertDto) {
    const alert = await this.requireInScope(user, id);
    if (alert.status === AlertStatus.RESOLVED) {
      throw new BadRequestException('Cảnh báo đã được xử lý trước đó.');
    }
    const resolved = await this.prisma.alert.update({
      where: { id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedById: user.id,
        resolvedAt: new Date(),
        resolutionNote: dto.resolutionNote,
      },
    });

    await this.auditService.log({
      staffId: user.id,
      action: 'ALERT_RESOLVED',
      entity: 'Alert',
      entityId: id,
    });

    return resolved;
  }

  private async requireInScope(user: AuthUser, id: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: { student: { select: { departmentId: true } } },
    });
    if (!alert) {
      throw new NotFoundException('Không tìm thấy cảnh báo.');
    }
    if (
      isDeptScoped(user) &&
      alert.student.departmentId !== user.departmentId
    ) {
      throw new ForbiddenException(
        'Cảnh báo không thuộc phạm vi bộ môn của bạn.',
      );
    }
    return alert;
  }
}
