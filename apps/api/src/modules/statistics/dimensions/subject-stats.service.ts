import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../../common/types/auth-user';
import { sectionScope } from '../../../common/utils/dept-scope';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  addTotals,
  emptyTotals,
  loadEnrollmentTotals,
  passRate,
  round1,
  type EnrollmentTotals,
} from './enrollment-aggregates';

/** Gộp số liệu của tất cả lớp học phần cùng một môn. */
interface SubjectAccumulator extends EnrollmentTotals {
  id: string;
  code: string;
  name: string;
  credits: number;
  department: { code: string; name: string };
  sectionCount: number;
  scoreSum: number;
  scoreCount: number;
}

function toSubjectRow({
  scoreSum,
  scoreCount,
  ...subject
}: SubjectAccumulator) {
  return {
    ...subject,
    total: subject.pass + subject.fail + subject.inProgress,
    passRate: passRate(subject.pass, subject.fail),
    // Điểm trung bình là bình quân có trọng số theo số bài thực sự có điểm.
    avgScore: scoreCount > 0 ? round1(scoreSum / scoreCount) : null,
  };
}

/**
 * Thống kê theo môn học. `Enrollment` không có `subjectId` nên phải gom qua
 * lớp học phần — cũng chính là chỗ RULE 2 bám vào: chỉ những lớp nằm trong
 * `sectionScope` mới được đếm, nên môn nào người xem không dạy/không quản thì
 * không xuất hiện, chứ không hiện một dòng toàn số 0 (số 0 đó cũng là thông
 * tin ngoài phạm vi).
 */
@Injectable()
export class SubjectStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, term?: string) {
    const sectionWhere: Prisma.ClassSectionWhereInput = {
      term,
      ...sectionScope(user),
    };

    const [sections, totalsBySection, scoreGroups] = await Promise.all([
      this.prisma.classSection.findMany({
        where: sectionWhere,
        select: {
          id: true,
          subject: {
            select: {
              id: true,
              code: true,
              name: true,
              credits: true,
              department: { select: { code: true, name: true } },
            },
          },
        },
      }),
      loadEnrollmentTotals(this.prisma, sectionWhere),
      this.prisma.enrollment.groupBy({
        by: ['classSectionId'],
        _avg: { totalScore: true },
        _count: { totalScore: true },
        where: { totalScore: { not: null }, classSection: sectionWhere },
      }),
    ]);

    const subjectIdBySection = new Map<string, string>();
    const bySubject = new Map<string, SubjectAccumulator>();

    for (const { id, subject } of sections) {
      subjectIdBySection.set(id, subject.id);
      const existing = bySubject.get(subject.id);
      if (existing) {
        existing.sectionCount += 1;
        continue;
      }
      bySubject.set(subject.id, {
        ...subject,
        ...emptyTotals(),
        sectionCount: 1,
        scoreSum: 0,
        scoreCount: 0,
      });
    }

    const entryFor = (sectionId: string): SubjectAccumulator | undefined => {
      const subjectId = subjectIdBySection.get(sectionId);
      return subjectId ? bySubject.get(subjectId) : undefined;
    };

    for (const [sectionId, totals] of totalsBySection) {
      const entry = entryFor(sectionId);
      if (entry) addTotals(entry, totals);
    }

    // Bình quân có trọng số: mỗi lớp góp theo số bài thực sự có điểm, chứ
    // không lấy trung bình của các trung bình (lớp 5 người sẽ nặng bằng lớp 40).
    for (const group of scoreGroups) {
      const entry = entryFor(group.classSectionId);
      const avg = group._avg.totalScore;
      const count = group._count.totalScore;
      if (!entry || avg === null || count === 0) continue;
      entry.scoreSum += avg * count;
      entry.scoreCount += count;
    }

    return [...bySubject.values()]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(toSubjectRow);
  }
}
