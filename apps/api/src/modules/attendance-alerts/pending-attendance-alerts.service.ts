import { Injectable } from '@nestjs/common';
import { AlertSource, AlertStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth-user';
import { studentScope } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';

export type PendingScope = 'owned' | 'all';

export interface PendingAttendanceAlert {
  id: string;
  level: number;
  status: AlertStatus;
  reason: string;
  absentSessions: number | null;
  ownerCaredAt: Date | null;
  createdAt: Date;
  careLogCount: number;
  /** true = mình là GV đứng lớp và chưa chăm sóc → hiện LIÊN TỤC. */
  isOwner: boolean;
  student: {
    id: string;
    studentCode: string;
    fullName: string;
    classCode: string | null;
  };
  classSection: {
    id: string;
    code: string;
    subjectName: string;
    lecturerName: string | null;
  };
}

export interface PendingAttendanceAlertsResult {
  items: PendingAttendanceAlert[];
  total: number;
  ownedTotal: number;
}

const PENDING_LIMIT = 100;

/** RULE 1: chỉ họ tên + mã, không email/điện thoại. */
const pendingSelect = {
  id: true,
  level: true,
  status: true,
  reason: true,
  absentSessions: true,
  ownerCaredAt: true,
  createdAt: true,
  student: {
    select: { id: true, studentCode: true, fullName: true, classCode: true },
  },
  classSection: {
    select: {
      id: true,
      code: true,
      lecturerId: true,
      subject: { select: { name: true } },
      lecturer: { select: { fullName: true } },
    },
  },
  _count: { select: { careLogs: true } },
} satisfies Prisma.AlertSelect;

type PendingRow = Prisma.AlertGetPayload<{ select: typeof pendingSelect }>;

/**
 * FLOW 2 bước 3: cảnh báo điểm danh chưa xử lý. "owned" = cảnh báo ở lớp
 * mình đứng lớp mà mình chưa chăm sóc → web hiện liên tục cho tới khi có
 * CareLog gắn cảnh báo từ chính GV đó. Thầy cô khác vẫn thấy qua scope=all
 * (và vẫn chăm sóc được) nhưng không bị hiện liên tục.
 */
@Injectable()
export class PendingAttendanceAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    user: AuthUser,
    term: string,
    scope: PendingScope,
  ): Promise<PendingAttendanceAlertsResult> {
    const base = this.baseWhere(user, term);
    const owned: Prisma.AlertWhereInput = {
      ...base,
      classSection: { lecturerId: user.id },
      ownerCaredAt: null,
    };
    const where = scope === 'owned' ? owned : base;

    const [rows, total, ownedTotal] = await this.prisma.$transaction([
      this.prisma.alert.findMany({
        where,
        select: pendingSelect,
        orderBy: [{ level: 'desc' }, { createdAt: 'asc' }],
        take: PENDING_LIMIT,
      }),
      this.prisma.alert.count({ where }),
      this.prisma.alert.count({ where: owned }),
    ]);

    return {
      items: rows.map((row) => this.toItem(row, user.id)),
      total,
      ownedTotal,
    };
  }

  private baseWhere(user: AuthUser, term: string): Prisma.AlertWhereInput {
    return {
      source: AlertSource.AUTO_ATTENDANCE,
      term,
      status: { not: AlertStatus.RESOLVED },
      student: studentScope(user),
    };
  }

  private toItem(row: PendingRow, userId: string): PendingAttendanceAlert {
    const section = row.classSection;
    return {
      id: row.id,
      level: row.level,
      status: row.status,
      reason: row.reason,
      absentSessions: row.absentSessions,
      ownerCaredAt: row.ownerCaredAt,
      createdAt: row.createdAt,
      careLogCount: row._count.careLogs,
      isOwner: section?.lecturerId === userId && row.ownerCaredAt === null,
      student: row.student,
      classSection: {
        id: section?.id ?? '',
        code: section?.code ?? '—',
        subjectName: section?.subject.name ?? '',
        lecturerName: section?.lecturer?.fullName ?? null,
      },
    };
  }
}
