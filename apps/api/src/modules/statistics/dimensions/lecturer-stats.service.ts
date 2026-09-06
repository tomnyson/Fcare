import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../../common/types/auth-user';
import {
  lecturerStatsScope,
  sectionScope,
  studentScope,
} from '../../../common/utils/dept-scope';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  addTotals,
  emptyTotals,
  loadEnrollmentTotals,
  passRate,
  type EnrollmentTotals,
} from './enrollment-aggregates';

interface LecturerAccumulator extends EnrollmentTotals {
  sectionCount: number;
}

interface LecturerRef {
  id: string;
  staffCode: string;
  fullName: string;
  /** Nhân sự có thể chưa gắn bộ môn — Prisma trả `null`, UI hiển thị "—". */
  department: { code: string; name: string } | null;
}

function toLecturerRow(
  lecturer: LecturerRef,
  entry: LecturerAccumulator,
  evaluationCount: number,
) {
  return {
    ...lecturer,
    sectionCount: entry.sectionCount,
    total: entry.pass + entry.fail + entry.inProgress,
    pass: entry.pass,
    fail: entry.fail,
    inProgress: entry.inProgress,
    examBanned: entry.examBanned,
    passRate: passRate(entry.pass, entry.fail),
    evaluationCount,
  };
}

/**
 * Thống kê theo giáo viên. Hai phạm vi khác nhau chồng lên nhau và cả hai đều
 * cần: `lecturerStatsScope` quyết định được thấy dòng của AI, `sectionScope`
 * quyết định lớp nào được tính vào dòng đó.
 */
@Injectable()
export class LecturerStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, term?: string) {
    const sectionWhere: Prisma.ClassSectionWhereInput = {
      term,
      ...sectionScope(user),
    };

    const [lecturers, sections, totalsBySection, evaluationGroups] =
      await Promise.all([
        this.prisma.staff.findMany({
          where: {
            AND: [
              lecturerStatsScope(user),
              { classSections: { some: sectionWhere } },
            ],
          },
          orderBy: { staffCode: 'asc' },
          select: {
            id: true,
            staffCode: true,
            fullName: true,
            department: { select: { code: true, name: true } },
          },
        }),
        this.prisma.classSection.findMany({
          where: sectionWhere,
          select: { id: true, lecturerId: true },
        }),
        loadEnrollmentTotals(this.prisma, sectionWhere),
        // RULE 2: `Evaluation` có quan hệ `student` nên đếm được đúng phạm vi
        // sinh viên của người xem. Nhờ vậy `evaluationCount` không còn bị thổi
        // phồng với TBM (trước đây gộp cả đánh giá về sinh viên ngoài phạm vi).
        this.prisma.evaluation.groupBy({
          by: ['lecturerId'],
          _count: { _all: true },
          where: { term, student: studentScope(user) },
        }),
      ]);

    const evaluationCountByLecturer = new Map(
      evaluationGroups.map((group) => [group.lecturerId, group._count._all]),
    );

    const totals = new Map<string, LecturerAccumulator>(
      lecturers.map((lecturer) => [
        lecturer.id,
        { ...emptyTotals(), sectionCount: 0 },
      ]),
    );

    for (const section of sections) {
      // Lớp chưa phân công giảng viên (76/94 lớp trong file nguồn) không thuộc
      // về ai — bỏ qua thay vì gán bừa.
      const entry = section.lecturerId
        ? totals.get(section.lecturerId)
        : undefined;
      if (!entry) continue;
      entry.sectionCount += 1;
      const sectionTotals = totalsBySection.get(section.id);
      if (sectionTotals) addTotals(entry, sectionTotals);
    }

    return lecturers.map((lecturer) =>
      toLecturerRow(
        lecturer,
        totals.get(lecturer.id) ?? { ...emptyTotals(), sectionCount: 0 },
        evaluationCountByLecturer.get(lecturer.id) ?? 0,
      ),
    );
  }
}
