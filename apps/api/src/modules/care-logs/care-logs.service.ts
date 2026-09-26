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

/** Lớp học phần của lượt chăm sóc: học kỳ + môn học để người đọc biết bối cảnh. */
export const careLogSectionSelect = {
  select: {
    id: true,
    code: true,
    term: true,
    subject: { select: { code: true, name: true } },
  },
} as const;

/** Đủ để xoá một lượt và biết có phải lượt "GV đứng lớp đã chăm sóc" không. */
const deletableSelect = {
  id: true,
  staffId: true,
  studentId: true,
  alertId: true,
  alert: {
    select: {
      ownerCaredAt: true,
      classSection: { select: { lecturerId: true } },
    },
  },
} as const;

type DeletableCareLog = Prisma.CareLogGetPayload<{
  select: typeof deletableSelect;
}>;

interface LinkedAlert {
  id: string;
  studentId: string;
  status: AlertStatus;
  ownerCaredAt: Date | null;
  classSectionId: string | null;
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
        classSection: careLogSectionSelect,
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
        const classSectionId = dto.classSectionId
          ? await this.requireEnrolledSection(
              tx,
              dto.studentId,
              dto.classSectionId,
            )
          : (alert?.classSectionId ?? null);
        const created = await tx.careLog.create({
          data: { ...dto, classSectionId, staffId: user.id },
          include: {
            staff: { select: staffSelect },
            classSection: careLogSectionSelect,
          },
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

  /**
   * Xoá một lượt chăm sóc (CASL `delete CareLog` — chỉ ADMIN). Nếu đó là lượt
   * cuối cùng của GV đứng lớp gắn với cảnh báo thì bỏ `ownerCaredAt` để banner
   * "cần chăm sóc" hiện lại, không để số "đã chăm sóc" khai khống.
   */
  async remove(user: AuthUser, id: string) {
    const log = await this.prisma.careLog.findFirst({
      where: { id, student: studentScope(user) },
      select: deletableSelect,
    });
    if (!log) {
      throw new NotFoundException('Không tìm thấy lượt chăm sóc.');
    }

    const ownerCareReset = await this.prisma.$transaction(async (tx) => {
      await tx.careLog.delete({ where: { id } });
      return this.resetOwnerCaredIfLast(tx, log);
    });

    // Không chép nội dung vào audit — nội dung tự do có thể lỡ chứa PII.
    await this.auditService.log({
      staffId: user.id,
      action: 'CARE_LOG_DELETED',
      entity: 'CareLog',
      entityId: id,
      metadata: {
        careStaffId: log.staffId,
        studentId: log.studentId,
        alertId: log.alertId,
        ownerCareReset,
      },
    });
    return { id, ownerCareReset };
  }

  private async resetOwnerCaredIfLast(
    tx: Prisma.TransactionClient,
    log: DeletableCareLog,
  ): Promise<boolean> {
    const { alert, alertId } = log;
    if (!alert || !alertId || alert.ownerCaredAt === null) return false;
    if (alert.classSection?.lecturerId !== log.staffId) return false;
    const remaining = await tx.careLog.count({
      where: { alertId, staffId: log.staffId },
    });
    if (remaining > 0) return false;
    await tx.alert.update({
      where: { id: alertId },
      data: { ownerCaredAt: null },
    });
    return true;
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
        classSectionId: true,
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

  /** Chỉ gắn được lớp học phần sinh viên thực sự học — tránh bối cảnh sai môn/kỳ. */
  private async requireEnrolledSection(
    tx: Prisma.TransactionClient,
    studentId: string,
    classSectionId: string,
  ): Promise<string> {
    const enrollment = await tx.enrollment.findUnique({
      where: { studentId_classSectionId: { studentId, classSectionId } },
      select: { id: true },
    });
    if (!enrollment) {
      throw new BadRequestException(
        'Sinh viên không học lớp học phần đã chọn.',
      );
    }
    return classSectionId;
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
