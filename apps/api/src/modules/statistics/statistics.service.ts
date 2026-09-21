import { Injectable, NotFoundException } from '@nestjs/common';
import { AlertSource, AlertStatus, type Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth-user';
import { statsStudentScope, studentScope } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { TermsService } from '../master-data/terms.service';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface TermWindow {
  code: string;
  name: string;
  startDate: Date;
  endDate: Date;
}

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly termsService: TermsService,
  ) {}

  /**
   * Tổng quan của MỘT học kỳ (mặc định kỳ hiện tại) — không cộng dồn các kỳ:
   * - SV: có đăng ký lớp học phần của kỳ.
   * - Cảnh báo: gắn mã kỳ, hoặc chưa gắn kỳ (cảnh báo tay) mà tạo trong kỳ.
   * - Chăm sóc: nhật ký tạo trong khoảng ngày của kỳ (+ 7 ngày gần nhất).
   * `attendancePending` (badge menu) luôn theo kỳ hiện tại, không theo kỳ chọn.
   */
  async overview(user: AuthUser, termCode?: string) {
    const current = await this.termsService.getCurrentTerm();
    const term = termCode
      ? await this.findTerm(termCode)
      : current && pickTermWindow(current);

    if (!term) {
      return {
        term: null,
        totalStudents: 0,
        warnedStudents: 0,
        careLogsInTerm: 0,
        careLogsLast7Days: 0,
        studentsByStatus: [],
        openAlertsByLevel: [],
        attendancePending: 0,
      };
    }

    const scope = statsStudentScope(user);
    const range = { gte: term.startDate, lte: term.endDate };
    const studentsInTerm: Prisma.StudentWhereInput = {
      AND: [
        scope,
        { enrollments: { some: { classSection: { term: term.code } } } },
      ],
    };
    const openAlertsInTerm: Prisma.AlertWhereInput[] = [
      { OR: [{ term: term.code }, { term: null, createdAt: range }] },
      { status: { not: AlertStatus.RESOLVED } },
    ];
    const weekStart = new Date(
      Math.max(term.startDate.getTime(), Date.now() - SEVEN_DAYS_MS),
    );

    const [
      totalStudents,
      studentsByStatus,
      openAlertsByLevel,
      warnedStudents,
      careLogsInTerm,
      careLogsLast7Days,
      attendancePending,
    ] = await Promise.all([
      this.prisma.student.count({ where: studentsInTerm }),
      this.prisma.student.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: studentsInTerm,
      }),
      this.prisma.alert.groupBy({
        by: ['level'],
        _count: { _all: true },
        where: { AND: [...openAlertsInTerm, { student: scope }] },
      }),
      this.prisma.student.count({
        where: {
          AND: [scope, { alerts: { some: { AND: openAlertsInTerm } } }],
        },
      }),
      this.prisma.careLog.count({
        where: { createdAt: range, student: scope },
      }),
      this.prisma.careLog.count({
        where: {
          createdAt: { gte: weekStart, lte: term.endDate },
          student: scope,
        },
      }),
      this.countAttendancePending(user, current?.code ?? null),
    ]);

    return {
      term,
      totalStudents,
      warnedStudents,
      careLogsInTerm,
      careLogsLast7Days,
      studentsByStatus: studentsByStatus.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      openAlertsByLevel: openAlertsByLevel.map((group) => ({
        level: group.level,
        count: group._count._all,
      })),
      attendancePending,
    };
  }

  private async findTerm(code: string): Promise<TermWindow> {
    const term = await this.prisma.term.findUnique({
      where: { code },
      select: { code: true, name: true, startDate: true, endDate: true },
    });
    if (!term) throw new NotFoundException(`Không tìm thấy học kỳ "${code}".`);
    return term;
  }

  /**
   * Số cảnh báo điểm danh tự động (kỳ hiện tại) phát ở lớp mình đứng mà mình
   * chưa chăm sóc — dùng cho badge menu "Cảnh báo". Chưa có kỳ hiện tại → 0.
   */
  private async countAttendancePending(
    user: AuthUser,
    currentTermCode: string | null,
  ): Promise<number> {
    if (!currentTermCode) return 0;
    return this.prisma.alert.count({
      where: {
        source: AlertSource.AUTO_ATTENDANCE,
        term: currentTermCode,
        status: { not: AlertStatus.RESOLVED },
        ownerCaredAt: null,
        classSection: { lecturerId: user.id },
        student: studentScope(user),
      },
    });
  }
}

function pickTermWindow(term: TermWindow): TermWindow {
  return {
    code: term.code,
    name: term.name,
    startDate: term.startDate,
    endDate: term.endDate,
  };
}
