import { Injectable } from '@nestjs/common';
import { AlertStatus, EnrollmentResult } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth-user';
import { deptFilter, isDeptScoped } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tổng quan: sinh viên theo trạng thái, cảnh báo đang mở theo mức, chăm sóc 30 ngày. */
  async overview(user: AuthUser) {
    const scope = deptFilter(user);

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

  /** Thống kê theo lớp học phần: đạt / trượt / cấm thi / tỷ lệ đạt (tài liệu mục thống kê). */
  async classes(user: AuthUser, term?: string) {
    const subjectScope = deptFilter(user);
    const sectionWhere = { term, subject: subjectScope };

    const [sections, resultGroups, bannedGroups] = await Promise.all([
      this.prisma.classSection.findMany({
        where: sectionWhere,
        orderBy: [{ term: 'desc' }, { code: 'asc' }],
        include: {
          subject: { select: { code: true, name: true } },
          lecturer: { select: { staffCode: true, fullName: true } },
          _count: { select: { enrollments: true } },
        },
      }),
      this.prisma.enrollment.groupBy({
        by: ['classSectionId', 'result'],
        _count: { _all: true },
        where: { classSection: sectionWhere },
      }),
      this.prisma.enrollment.groupBy({
        by: ['classSectionId'],
        _count: { _all: true },
        where: { isExamBanned: true, classSection: sectionWhere },
      }),
    ]);

    const resultsBySection = new Map<
      string,
      Partial<Record<EnrollmentResult, number>>
    >();
    for (const group of resultGroups) {
      const entry = resultsBySection.get(group.classSectionId) ?? {};
      entry[group.result] = group._count._all;
      resultsBySection.set(group.classSectionId, entry);
    }
    const bannedBySection = new Map(
      bannedGroups.map((group) => [group.classSectionId, group._count._all]),
    );

    return sections.map((section) => {
      const results = resultsBySection.get(section.id) ?? {};
      const pass = results.PASS ?? 0;
      const fail = results.FAIL ?? 0;
      const inProgress = results.IN_PROGRESS ?? 0;
      const total = section._count.enrollments;
      const decided = pass + fail;
      return {
        id: section.id,
        code: section.code,
        term: section.term,
        subject: section.subject,
        lecturer: section.lecturer,
        total,
        pass,
        fail,
        inProgress,
        examBanned: bannedBySection.get(section.id) ?? 0,
        passRate: decided > 0 ? Math.round((pass / decided) * 1000) / 10 : null,
      };
    });
  }

  /** Thống kê theo bộ môn: sĩ số theo trạng thái + cảnh báo đang mở. */
  async departments(user: AuthUser) {
    const departmentWhere = isDeptScoped(user)
      ? { id: user.departmentId ?? '__no_department__' }
      : {};

    const [departments, studentGroups, openAlerts] = await Promise.all([
      this.prisma.department.findMany({
        where: departmentWhere,
        orderBy: { code: 'asc' },
        include: { _count: { select: { students: true, staff: true } } },
      }),
      this.prisma.student.groupBy({
        by: ['departmentId', 'status'],
        _count: { _all: true },
        where: deptFilter(user),
      }),
      this.prisma.alert.findMany({
        where: {
          status: { not: AlertStatus.RESOLVED },
          student: deptFilter(user),
        },
        select: { level: true, student: { select: { departmentId: true } } },
      }),
    ]);

    const alertCountByDept = new Map<string, number>();
    for (const alert of openAlerts) {
      const deptId = alert.student.departmentId;
      alertCountByDept.set(deptId, (alertCountByDept.get(deptId) ?? 0) + 1);
    }

    return departments.map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
      totalStudents: department._count.students,
      totalStaff: department._count.staff,
      openAlerts: alertCountByDept.get(department.id) ?? 0,
      studentsByStatus: studentGroups
        .filter((group) => group.departmentId === department.id)
        .map((group) => ({ status: group.status, count: group._count._all })),
    }));
  }
}
