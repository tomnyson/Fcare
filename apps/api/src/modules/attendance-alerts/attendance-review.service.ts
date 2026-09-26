import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  AlertSource,
  AlertStatus,
  Prisma,
  StudentStatus,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  ALERT_LEVEL_LABELS,
  ATTENDANCE_ALERT_THRESHOLDS,
  type AlertLevel,
} from '@fcare/shared-types';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EscalationService } from '../alerts/escalation.service';
import {
  ALERT_ESCALATION_QUEUE,
  NotificationDispatchService,
  type EscalationJobData,
} from '../alerts/notification-dispatch.service';
import { mergedReason } from '../alerts/raise-decision';
import {
  decideAction,
  type OpenAttendanceAlert,
} from './attendance-review.decision';

interface AttendanceReviewOptions {
  /** Lượt import vừa commit (để audit gắn vào ImportBatch). */
  batchId?: string;
  /** Người bấm commit / gọi rà soát tay; null khi hệ thống tự chạy. */
  actorId?: string;
}

export interface AttendanceReviewResult {
  created: number;
  upgraded: number;
  unchanged: number;
  notified: number;
}

interface ReviewRow {
  studentId: string;
  classSectionId: string;
  absentSessions: number | null;
  student: { id: string; studentCode: string; fullName: string };
  classSection: { id: string; code: string; lecturerId: string | null };
}

interface OpenAlertRow extends OpenAttendanceAlert {
  id: string;
  studentId: string;
  classSectionId: string | null;
  source: AlertSource;
  reason: string;
}

const EMPTY_RESULT: AttendanceReviewResult = {
  created: 0,
  upgraded: 0,
  unchanged: 0,
  notified: 0,
};

/** Sinh viên còn đi học — bảo lưu/thôi học/tốt nghiệp không rà soát. */
const ACTIVE_STATUSES: StudentStatus[] = [
  StudentStatus.STUDYING,
  StudentStatus.WARNED,
];

function levelLabel(level: number): string {
  return ALERT_LEVEL_LABELS[`L${level}` as AlertLevel] ?? `Mức ${level}`;
}

function reasonFor(row: ReviewRow, term: string): string {
  return `Vắng ${row.absentSessions ?? 0} buổi tại lớp ${row.classSection.code} (học kỳ ${term}) — rà soát tự động sau import điểm danh`;
}

/**
 * Cảnh báo điểm danh tự động thì thay lý do bằng số buổi mới; cảnh báo do
 * giảng viên phát thì giữ lý do của thầy cô, chỉ nối thêm số buổi vắng.
 */
function nextReason(row: ReviewRow, existing: OpenAlertRow, term: string) {
  return existing.source === AlertSource.AUTO_ATTENDANCE
    ? reasonFor(row, term)
    : mergedReason(existing.reason, reasonFor(row, term), new Date());
}

/** Dữ liệu cũ có thể có nhiều cảnh báo mở cùng lớp — lấy cái mức cao nhất. */
function highestByKey(alerts: OpenAlertRow[]): Map<string, OpenAlertRow> {
  return alerts.reduce((map, alert) => {
    const key = `${alert.studentId}:${alert.classSectionId ?? ''}`;
    const current = map.get(key);
    return current && current.level >= alert.level
      ? map
      : new Map(map).set(key, alert);
  }, new Map<string, OpenAlertRow>());
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function add(
  result: AttendanceReviewResult,
  patch: Partial<AttendanceReviewResult>,
): AttendanceReviewResult {
  return {
    created: result.created + (patch.created ?? 0),
    upgraded: result.upgraded + (patch.upgraded ?? 0),
    unchanged: result.unchanged + (patch.unchanged ?? 0),
    notified: result.notified + (patch.notified ?? 0),
  };
}

/**
 * FLOW 2 — Bước 2 + 3: sau mỗi lượt import điểm danh, rà soát số buổi vắng
 * luỹ kế của từng (sinh viên, lớp học phần) trong học kỳ và phát cảnh báo tự
 * động cấp 2 (vắng 2) / cấp 3 (vắng ≥ 3). Cảnh báo mang `classSectionId` để
 * hiện LIÊN TỤC ở đúng giảng viên đứng lớp cho tới khi thầy cô đó chăm sóc.
 */
@Injectable()
export class AttendanceReviewService {
  private readonly logger = new Logger(AttendanceReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly escalationService: EscalationService,
    private readonly dispatchService: NotificationDispatchService,
    private readonly auditService: AuditService,
    @InjectQueue(ALERT_ESCALATION_QUEUE)
    private readonly escalationQueue: Queue<EscalationJobData>,
  ) {}

  async reviewTerm(
    term: string,
    options: AttendanceReviewOptions = {},
  ): Promise<AttendanceReviewResult> {
    const [rows, openAlerts] = await Promise.all([
      this.loadRows(term),
      this.loadOpenAlerts(term),
    ]);
    const openByKey = highestByKey(openAlerts);

    let result = EMPTY_RESULT;
    for (const row of rows) {
      const existing =
        openByKey.get(`${row.studentId}:${row.classSectionId}`) ?? null;
      result = add(result, await this.reviewRow(row, existing, term));
    }

    await this.auditService.log({
      staffId: options.actorId,
      action: 'ATTENDANCE_REVIEW',
      entity: 'ImportBatch',
      entityId: options.batchId,
      metadata: { term, ...result },
    });
    return result;
  }

  private loadRows(term: string): Promise<ReviewRow[]> {
    return this.prisma.enrollment.findMany({
      where: {
        absentSessions: { gte: ATTENDANCE_ALERT_THRESHOLDS.MEDIUM },
        classSection: { term, lecturerId: { not: null } },
        student: { status: { in: ACTIVE_STATUSES } },
      },
      select: {
        studentId: true,
        classSectionId: true,
        absentSessions: true,
        student: { select: { id: true, studentCode: true, fullName: true } },
        classSection: { select: { id: true, code: true, lecturerId: true } },
      },
    });
  }

  private loadOpenAlerts(term: string): Promise<OpenAlertRow[]> {
    return this.prisma.alert.findMany({
      // Mọi nguồn: đã có cảnh báo mở (kể cả giảng viên phát tay) thì cập nhật
      // cảnh báo đó thay vì tạo thêm — docs/plan-lert.md mục 1.
      where: {
        term,
        status: { not: AlertStatus.RESOLVED },
      },
      select: {
        id: true,
        studentId: true,
        classSectionId: true,
        level: true,
        absentSessions: true,
        source: true,
        reason: true,
      },
    });
  }

  private async reviewRow(
    row: ReviewRow,
    existing: OpenAlertRow | null,
    term: string,
  ): Promise<Partial<AttendanceReviewResult>> {
    const action = decideAction(row.absentSessions, existing);
    switch (action.type) {
      case 'skip':
        return {};
      case 'unchanged':
        return { unchanged: 1 };
      case 'refresh':
        await this.prisma.alert.update({
          where: { id: existing!.id },
          data: {
            absentSessions: row.absentSessions,
            reason: nextReason(row, existing!, term),
          },
        });
        return { unchanged: 1 };
      case 'create':
        return this.createAlert(row, action.level, term);
      case 'upgrade':
        return this.upgradeAlert(row, existing!, action.level, term);
    }
  }

  private async createAlert(
    row: ReviewRow,
    level: 2 | 3,
    term: string,
  ): Promise<Partial<AttendanceReviewResult>> {
    const created = await this.tryCreate(row, level, term, this.prisma);
    if (!created) return { unchanged: 1 };
    return {
      created: 1,
      notified: await this.notify(row, created, level, term),
    };
  }

  /**
   * Nâng cấp tại chỗ: giữ nguyên cảnh báo đang mở, đổi mức, mở lại và reset
   * `ownerCaredAt` — giảng viên đứng lớp phải chăm sóc lại (quyết định E).
   * Gửi với `replay` để cả người đã nhận trước đó cũng được báo lại.
   */
  private async upgradeAlert(
    row: ReviewRow,
    existing: OpenAlertRow,
    level: 3,
    term: string,
  ): Promise<Partial<AttendanceReviewResult>> {
    await this.prisma.alert.update({
      where: { id: existing.id },
      data: {
        level,
        absentSessions: row.absentSessions,
        reason: nextReason(row, existing, term),
        status: AlertStatus.OPEN,
        ownerCaredAt: null,
      },
    });
    return {
      upgraded: 1,
      notified: await this.notify(row, existing, level, term, true),
    };
  }

  private async tryCreate(
    row: ReviewRow,
    level: 2 | 3,
    term: string,
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<{ id: string } | null> {
    try {
      return await client.alert.create({
        data: {
          studentId: row.studentId,
          raisedById: null,
          level,
          source: AlertSource.AUTO_ATTENDANCE,
          classSectionId: row.classSectionId,
          term,
          absentSessions: row.absentSessions,
          reason: reasonFor(row, term),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  /** Trả số người đã được gửi; gửi hỏng → 0 nhưng cảnh báo vẫn đã tạo. */
  private async notify(
    row: ReviewRow,
    alert: { id: string },
    level: number,
    term: string,
    replay = false,
  ): Promise<number> {
    const recipientIds = await this.escalationService.computeRecipientIds(
      row.studentId,
      level,
    );
    if (recipientIds.length === 0) return 0;
    try {
      await this.dispatchService.enqueueOrDeliver(this.escalationQueue, {
        alertId: alert.id,
        recipientIds,
        title: `Cảnh báo ${levelLabel(level)} (điểm danh) — ${row.student.fullName} (${row.student.studentCode})`,
        body: reasonFor(row, term),
        targetUrl: `/students/${row.studentId}?tab=care-logs&alertId=${alert.id}`,
        ...(replay ? { replay: true } : {}),
      });
    } catch (error) {
      this.logger.error(
        `Không gửi được thông báo cảnh báo điểm danh ${alert.id}: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
      return 0;
    }
    return recipientIds.length;
  }
}
