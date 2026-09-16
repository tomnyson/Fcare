import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AlertStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import { studentScope } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateCareLogDto, ListCareLogsQuery } from './dto/care-log.dto';

const staffSelect = { id: true, staffCode: true, fullName: true } as const;

/** Cảnh báo kèm nhật ký: đủ để web gắn tag "cấp N — lớp CODE", không PII. */
const alertSummarySelect = {
  id: true,
  level: true,
  source: true,
  classSection: { select: { code: true } },
} as const;

interface LinkedAlert {
  id: string;
  studentId: string;
  status: AlertStatus;
  ownerCaredAt: Date | null;
  classSection: { lecturerId: string | null } | null;
}

@Injectable()
export class CareLogsService {
  private readonly logger = new Logger(CareLogsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  list(user: AuthUser, query: ListCareLogsQuery) {
    return this.prisma.careLog.findMany({
      where: {
        studentId: query.studentId,
        student: studentScope(user),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        staff: { select: staffSelect },
        student: {
          select: {
            id: true,
            studentCode: true,
            fullName: true,
            classCode: true,
          },
        },
        alert: { select: alertSummarySelect },
      },
    });
  }

  async create(user: AuthUser, dto: CreateCareLogDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, ...studentScope(user) },
    });
    if (!student) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong phạm vi quản lý của bạn.',
      );
    }

    // Nhật ký + đánh dấu "GV đứng lớp đã chăm sóc" phải cùng thành/bại:
    // ghi nhật ký xong mà không tắt được cảnh báo liên tục là trải nghiệm tệ.
    const { careLog, ownerCared } = await this.prisma.$transaction(
      async (tx) => {
        const alert = dto.alertId
          ? await this.requireLinkedAlert(tx, dto.alertId, dto.studentId)
          : null;
        const created = await tx.careLog.create({
          data: { ...dto, staffId: user.id },
          include: { staff: { select: staffSelect } },
        });
        const cared = alert
          ? await this.markOwnerCared(tx, alert, user.id)
          : false;
        return { careLog: created, ownerCared: cared };
      },
    );

    if (ownerCared && dto.alertId) {
      await this.auditService.log({
        staffId: user.id,
        action: 'ALERT_OWNER_CARED',
        entity: 'Alert',
        entityId: dto.alertId,
        metadata: { careLogId: careLog.id, studentId: dto.studentId },
      });
    }

    this.sendEmail(careLog.id, user.id);
    return careLog;
  }

  private async requireLinkedAlert(
    tx: Prisma.TransactionClient,
    alertId: string,
    studentId: string,
  ): Promise<LinkedAlert> {
    const alert = await tx.alert.findUnique({
      where: { id: alertId },
      select: {
        id: true,
        studentId: true,
        status: true,
        ownerCaredAt: true,
        classSection: { select: { lecturerId: true } },
      },
    });
    if (!alert) {
      throw new NotFoundException('Không tìm thấy cảnh báo cần gắn.');
    }
    if (alert.studentId !== studentId) {
      throw new BadRequestException(
        'Cảnh báo không thuộc về sinh viên đang được chăm sóc.',
      );
    }
    return alert;
  }

  /**
   * Quyết định F: chỉ GV đứng lớp học phần phát cảnh báo mới tắt được "hiện
   * liên tục". Thầy cô khác chăm sóc vẫn được ghi nhận nhưng không tắt.
   * Trả true khi vừa đánh dấu lần đầu.
   */
  private async markOwnerCared(
    tx: Prisma.TransactionClient,
    alert: LinkedAlert,
    staffId: string,
  ): Promise<boolean> {
    const isOwner = alert.classSection?.lecturerId === staffId;
    if (!isOwner || alert.ownerCaredAt !== null) return false;
    await tx.alert.update({
      where: { id: alert.id },
      data: {
        ownerCaredAt: new Date(),
        ...(alert.status === AlertStatus.OPEN
          ? { status: AlertStatus.ACKNOWLEDGED }
          : {}),
      },
    });
    return true;
  }

  private sendEmail(careLogId: string, staffId: string): void {
    if (!this.emailService) return;
    this.emailService
      .sendCareLogEmail(careLogId, staffId)
      .catch((err) =>
        this.logger.warn(
          `Không gửi được email nhật ký chăm sóc: ${err instanceof Error ? err.message : 'Unknown error'}`,
        ),
      );
  }
}
