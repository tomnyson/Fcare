import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../../common/types/auth-user';
import { statsSectionScope } from '../../../common/utils/dept-scope';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  emptyTotals,
  loadEnrollmentTotals,
  passRate,
} from './enrollment-aggregates';

/** Thống kê theo lớp học phần: đạt / trượt / cấm thi / tỷ lệ đạt (tài liệu mục thống kê). */
@Injectable()
export class ClassStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, term?: string, block?: number) {
    // Lớp của bộ môn mình + lớp mình đứng tên dạy (kể cả dạy chéo bộ môn).
    const sectionWhere: Prisma.ClassSectionWhereInput = {
      term,
      ...(block ? { block } : {}),
      ...statsSectionScope(user),
    };

    const [sections, totalsBySection] = await Promise.all([
      this.prisma.classSection.findMany({
        where: sectionWhere,
        orderBy: [{ term: 'desc' }, { code: 'asc' }],
        include: {
          subject: { select: { code: true, name: true } },
          lecturer: { select: { staffCode: true, fullName: true } },
          _count: { select: { enrollments: true } },
        },
      }),
      loadEnrollmentTotals(this.prisma, sectionWhere),
    ]);

    return sections.map((section) => {
      const totals = totalsBySection.get(section.id) ?? emptyTotals();
      return {
        id: section.id,
        code: section.code,
        term: section.term,
        subject: section.subject,
        lecturer: section.lecturer,
        total: section._count.enrollments,
        pass: totals.pass,
        fail: totals.fail,
        inProgress: totals.inProgress,
        examBanned: totals.examBanned,
        passRate: passRate(totals.pass, totals.fail),
      };
    });
  }
}
