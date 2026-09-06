import { Injectable } from '@nestjs/common';
import { AlertStatus } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth-user';
import { studentScope } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tổng quan: sinh viên theo trạng thái, cảnh báo đang mở theo mức, chăm sóc 30 ngày. */
  async overview(user: AuthUser) {
    const scope = studentScope(user);

    const [
      totalStudents,
      studentsByStatus,
      openAlertsByLevel,
      careLogsLast30Days,
    ] = await Promise.all([
      this.prisma.student.count({ where: scope }),
      this.prisma.student.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: scope,
      }),
      this.prisma.alert.groupBy({
        by: ['level'],
        _count: { _all: true },
        where: { status: { not: AlertStatus.RESOLVED }, student: scope },
      }),
      this.prisma.careLog.count({
        where: {
          createdAt: { gte: new Date(Date.now() - THIRTY_DAYS_MS) },
          student: scope,
        },
      }),
    ]);

    return {
      totalStudents,
      careLogsLast30Days,
      studentsByStatus: studentsByStatus.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      openAlertsByLevel: openAlertsByLevel.map((group) => ({
        level: group.level,
        count: group._count._all,
      })),
    };
  }
}
