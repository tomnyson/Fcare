import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AlertSource, AlertStatus, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  ALERT_LEVEL_LABELS,
  MIN_CRITICAL_REASON_LENGTH,
  canCloseAlert,
  type AlertLevel,
} from '@fcare/shared-types';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { isStudentInScope, studentScope } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ListAlertsQuery,
  RaiseAlertDto,
  ResolveAlertDto,
} from './dto/alert.dto';
import { EscalationService } from './escalation.service';
import {
  ALERT_ESCALATION_QUEUE,
  NotificationDispatchService,
  type EscalationJobData,
} from './notification-dispatch.service';

function levelLabel(level: number): string {
  return ALERT_LEVEL_LABELS[`L${level}` as AlertLevel] ?? `Mức ${level}`;
}

/** Giữ thứ tự xuất hiện đầu tiên — thứ tự này lọt vào audit và kết quả trả về. */
function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Những trường của cảnh báo mà transaction xoá và audit cần. */
interface DeletableAlert {
  id: string;
  studentId: string;
  level: number;
  status: AlertStatus;
  source: AlertSource;
}

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

    // Bộ lọc phía sinh viên dùng đúng ngữ nghĩa của trang /students: kỳ, giảng
    // viên và lớp học phần gộp vào CÙNG một `enrollments.some` để "kỳ SU25 +
    // thầy A" nghĩa là một lớp học phần, không phải hai lần đăng ký rời nhau.
    const student: Prisma.StudentWhereInput = {
      ...(query.classCode ? { classCode: query.classCode } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.majorId ? { majorId: query.majorId } : {}),
      ...(query.term || query.lecturerId || query.sectionId
        ? {
            enrollments: {
              some: {
                ...(query.sectionId ? { classSectionId: query.sectionId } : {}),
                classSection: {
                  ...(query.term ? { term: query.term } : {}),
                  ...(query.lecturerId ? { lecturerId: query.lecturerId } : {}),
                },
              },
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { studentCode: { contains: query.search, mode: 'insensitive' } },
              { fullName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      // Scope đặt SAU bộ lọc để luôn thắng; `studentScope` trả về `AND` nên
      // không đụng `OR` của ô tìm kiếm ở trên (RULE 2).
      ...studentScope(user),
    };

    const where: Prisma.AlertWhereInput = {
      status: query.openOnly ? { not: AlertStatus.RESOLVED } : query.status,
      level: query.level,
      source: query.source,
      studentId: query.studentId,
      student,
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
          // Cảnh báo tự động không có người tạo (raisedBy null) — web hiện "Hệ thống".
          raisedBy: { select: { id: true, staffCode: true, fullName: true } },
          resolvedBy: { select: { id: true, staffCode: true, fullName: true } },
          // lecturerId để web biết ai được chốt (`canCloseAlert`).
          classSection: {
            select: {
              id: true,
              code: true,
              lecturerId: true,
              subject: { select: { name: true } },
            },
          },
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
      where: { id: dto.studentId, ...studentScope(user) },
    });
    if (!student) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong phạm vi quản lý của bạn.',
      );
    }

    const section = dto.classSectionId
      ? await this.requireEnrolledSection(dto.studentId, dto.classSectionId)
      : null;

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
        classSectionId: section?.id ?? null,
        term: section?.term ?? null,
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

  /** Lớp gắn vào cảnh báo phải là lớp sinh viên đang học — không nhận id lạ. */
  private async requireEnrolledSection(studentId: string, sectionId: string) {
    const section = await this.prisma.classSection.findFirst({
      where: { id: sectionId, enrollments: { some: { studentId } } },
      select: { id: true, term: true },
    });
    if (!section) {
      throw new BadRequestException('Sinh viên không học lớp học phần này.');
    }
    return section;
  }

  private dispatchNotifications(data: EscalationJobData): Promise<void> {
    return this.dispatchService.enqueueOrDeliver(this.escalationQueue, data);
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
    const closable = canCloseAlert({
      userId: user.id,
      roles: user.roles,
      sectionLecturerId: alert.classSection?.lecturerId,
      raisedById: alert.raisedById,
    });
    if (!closable) {
      throw new ForbiddenException(
        'Chỉ giảng viên phụ trách lớp của sinh viên (hoặc Trưởng bộ môn, Quản trị) mới được chốt cảnh báo.',
      );
    }
    const resolved = await this.prisma.alert.update({
      where: { id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedById: user.id,
        resolvedAt: new Date(),
        resolutionNote: dto.resolutionNote,
        outcome: dto.outcome,
      },
    });

    await this.auditService.log({
      staffId: user.id,
      action: 'ALERT_RESOLVED',
      entity: 'Alert',
      entityId: id,
      metadata: { outcome: dto.outcome },
    });

    return resolved;
  }

  /**
   * Những gì sẽ mất khi ADMIN xoá cảnh báo — để modal xác nhận liệt kê trước.
   * Đi qua đúng cửa phạm vi của `remove` để không đếm được thứ mình không xoá được.
   */
  async deletionPreview(user: AuthUser, id: string) {
    const alert = await this.requireInScope(user, id);
    const [
      careLogs,
      notifications,
      evaluations,
      discussionMessages,
      analysisVersionsUnlinked,
    ] = await this.prisma.$transaction([
      this.prisma.careLog.count({ where: { alertId: id } }),
      this.prisma.notification.count({ where: { alertId: id } }),
      this.prisma.evaluation.count({ where: { studentId: alert.studentId } }),
      this.prisma.discussionMessage.count({
        where: { studentId: alert.studentId },
      }),
      this.prisma.studentTermAnalysisVersion.count({ where: { alertId: id } }),
    ]);
    return {
      id: alert.id,
      level: alert.level,
      status: alert.status,
      source: alert.source,
      student: {
        studentCode: alert.student.studentCode,
        fullName: alert.student.fullName,
      },
      careLogs,
      notifications,
      evaluations,
      discussionMessages,
      analysisVersionsUnlinked,
    };
  }

  /** Xem trước cho một lô: tổng hợp theo lô + từng cảnh báo để modal liệt kê. */
  async deletionPreviewMany(user: AuthUser, ids: string[]) {
    const { alerts, alertIds, studentIds } = await this.requireAllInScope(
      user,
      ids,
    );
    const [
      careLogs,
      notifications,
      evaluations,
      discussionMessages,
      analysisVersionsUnlinked,
    ] = await this.prisma.$transaction([
      this.prisma.careLog.count({ where: { alertId: { in: alertIds } } }),
      this.prisma.notification.count({ where: { alertId: { in: alertIds } } }),
      this.prisma.evaluation.count({
        where: { studentId: { in: studentIds } },
      }),
      this.prisma.discussionMessage.count({
        where: { studentId: { in: studentIds } },
      }),
      this.prisma.studentTermAnalysisVersion.count({
        where: { alertId: { in: alertIds } },
      }),
    ]);
    return {
      alerts: alerts.length,
      students: studentIds.length,
      autoAttendance: alerts.filter(
        (a) => a.source === AlertSource.AUTO_ATTENDANCE,
      ).length,
      careLogs,
      notifications,
      evaluations,
      discussionMessages,
      analysisVersionsUnlinked,
      items: alerts.map((a) => ({
        id: a.id,
        level: a.level,
        status: a.status,
        source: a.source,
        student: {
          studentCode: a.student.studentCode,
          fullName: a.student.fullName,
        },
      })),
    };
  }

  /**
   * ADMIN xoá cảnh báo kèm dữ liệu của sinh viên (quyết định nghiệp vụ 23/09/2026):
   * - nhật ký chăm sóc GẮN cảnh báo này (nhật ký khác của SV giữ nguyên),
   * - TOÀN BỘ nhận xét giảng viên (+ điểm tiêu chí, cascade DB) của sinh viên,
   * - TOÀN BỘ luồng trao đổi của sinh viên (+ thông báo trao đổi, cascade DB),
   * - cảnh báo → thông báo cảnh báo chết theo FK CASCADE; bản phân tích AI chỉ
   *   mất liên kết (SetNull). Cảnh báo điểm danh tự động có thể được phát lại
   *   ở lần rà soát điểm danh kế tiếp — đó là chủ ý, không phải lỗi.
   * Tất cả trong MỘT transaction; audit ghi số lượng, không ghi tên sinh viên.
   */
  async remove(user: AuthUser, id: string) {
    const alert = await this.requireInScope(user, id);
    const {
      careLogs,
      evaluations,
      discussionMessages,
      notifications,
      analysisVersionsUnlinked,
    } = await this.deleteBatch(user, [alert]);
    return {
      id,
      careLogs,
      evaluations,
      discussionMessages,
      notifications,
      analysisVersionsUnlinked,
    };
  }

  /**
   * Xoá nhiều cảnh báo một lượt: tất cả phải tồn tại và trong phạm vi, nếu
   * không thì không xoá gì. Hai cảnh báo của cùng sinh viên chỉ xoá nhận
   * xét/trao đổi của sinh viên đó MỘT lần.
   */
  async removeMany(user: AuthUser, ids: string[]) {
    const { alerts, alertIds, studentIds } = await this.requireAllInScope(
      user,
      ids,
    );
    const summary = await this.deleteBatch(user, alerts);
    return {
      ids: alertIds,
      alerts: alerts.length,
      students: studentIds.length,
      ...summary,
    };
  }

  /** Transaction xoá + audit cho một lô đã qua kiểm tra phạm vi. */
  private async deleteBatch(user: AuthUser, alerts: DeletableAlert[]) {
    const alertIds = alerts.map((a) => a.id);
    const studentIds = distinct(alerts.map((a) => a.studentId));

    const summary = await this.prisma.$transaction(async (tx) => {
      const [notifications, analysisVersionsUnlinked] = await Promise.all([
        tx.notification.count({ where: { alertId: { in: alertIds } } }),
        tx.studentTermAnalysisVersion.count({
          where: { alertId: { in: alertIds } },
        }),
      ]);
      const careLogs = await tx.careLog.deleteMany({
        where: { alertId: { in: alertIds } },
      });
      const evaluations = await tx.evaluation.deleteMany({
        where: { studentId: { in: studentIds } },
      });
      const discussionMessages = await tx.discussionMessage.deleteMany({
        where: { studentId: { in: studentIds } },
      });
      await tx.discussionRead.deleteMany({
        where: { studentId: { in: studentIds } },
      });
      await tx.alert.deleteMany({ where: { id: { in: alertIds } } });
      return {
        careLogs: careLogs.count,
        evaluations: evaluations.count,
        discussionMessages: discussionMessages.count,
        notifications,
        analysisVersionsUnlinked,
      };
    });

    // Một dòng audit cho mỗi cảnh báo để tra theo entityId; số lượng là của cả lô.
    await Promise.all(
      alerts.map((alert) =>
        this.auditService.log({
          staffId: user.id,
          action: 'ALERT_DELETED',
          entity: 'Alert',
          entityId: alert.id,
          metadata: {
            studentId: alert.studentId,
            source: alert.source,
            status: alert.status,
            level: alert.level,
            batchSize: alerts.length,
            ...summary,
          },
        }),
      ),
    );

    return summary;
  }

  /** Như `requireInScope` cho một lô: thiếu id → 404, ngoài phạm vi → 403. */
  private async requireAllInScope(user: AuthUser, ids: string[]) {
    const alertIds = distinct(ids);
    const alerts = await this.prisma.alert.findMany({
      where: { id: { in: alertIds } },
      include: {
        student: {
          select: { departmentId: true, studentCode: true, fullName: true },
        },
      },
    });
    if (alerts.length !== alertIds.length) {
      throw new NotFoundException(
        `Không tìm thấy ${alertIds.length - alerts.length} cảnh báo trong danh sách đã chọn.`,
      );
    }
    const studentIds = distinct(alerts.map((a) => a.studentId));
    const inScope = await Promise.all(
      studentIds.map((studentId) =>
        isStudentInScope(this.prisma, user, studentId),
      ),
    );
    if (inScope.some((ok) => !ok)) {
      throw new ForbiddenException(
        'Cảnh báo không thuộc phạm vi sinh viên của bạn.',
      );
    }
    return { alerts, alertIds, studentIds };
  }

  private async requireInScope(user: AuthUser, id: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: {
        student: {
          select: { departmentId: true, studentCode: true, fullName: true },
        },
        classSection: { select: { lecturerId: true } },
      },
    });
    if (!alert) {
      throw new NotFoundException('Không tìm thấy cảnh báo.');
    }
    if (!(await isStudentInScope(this.prisma, user, alert.studentId))) {
      throw new ForbiddenException(
        'Cảnh báo không thuộc phạm vi sinh viên của bạn.',
      );
    }
    return alert;
  }
}
