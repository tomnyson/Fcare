import type { Prisma } from '@prisma/client';
import { EnrollmentResult } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

/** Số liệu học vụ của MỘT lớp học phần, đã gộp từ hai truy vấn groupBy. */
export interface EnrollmentTotals {
  pass: number;
  fail: number;
  inProgress: number;
  examBanned: number;
}

/** Làm tròn 1 chữ số thập phân — mọi tỷ lệ/điểm trong module thống kê dùng chung. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Tỷ lệ đạt (%) trên số đã có kết quả. Trả `null` khi chưa có kết quả nào —
 * `0%` sẽ bị đọc nhầm là "trượt sạch" trong khi thực tế là "chưa chấm xong".
 */
export function passRate(pass: number, fail: number): number | null {
  const decided = pass + fail;
  return decided > 0 ? round1((pass / decided) * 100) : null;
}

export function emptyTotals(): EnrollmentTotals {
  return { pass: 0, fail: 0, inProgress: 0, examBanned: 0 };
}

/** Cộng dồn số liệu của một lớp vào dòng tổng hợp (môn học hoặc giảng viên). */
export function addTotals(
  target: EnrollmentTotals,
  source: EnrollmentTotals,
): void {
  target.pass += source.pass;
  target.fail += source.fail;
  target.inProgress += source.inProgress;
  target.examBanned += source.examBanned;
}

/**
 * Gộp đạt / trượt / đang học / cấm thi theo lớp học phần.
 *
 * `sectionWhere` đã mang sẵn `sectionScope` của người xem (RULE 2), truyền
 * nguyên vào cả hai truy vấn để không lớp nào lọt ra ngoài phạm vi. Thứ tự hai
 * lệnh `groupBy` được giữ nguyên (kết quả trước, cấm thi sau) vì các service
 * gọi kèm những truy vấn khác trong cùng một `Promise.all`.
 */
export async function loadEnrollmentTotals(
  prisma: PrismaService,
  sectionWhere: Prisma.ClassSectionWhereInput,
): Promise<Map<string, EnrollmentTotals>> {
  const [resultGroups, bannedGroups] = await Promise.all([
    prisma.enrollment.groupBy({
      by: ['classSectionId', 'result'],
      _count: { _all: true },
      where: { classSection: sectionWhere },
    }),
    prisma.enrollment.groupBy({
      by: ['classSectionId'],
      _count: { _all: true },
      where: { isExamBanned: true, classSection: sectionWhere },
    }),
  ]);

  const totals = new Map<string, EnrollmentTotals>();
  const entryFor = (sectionId: string): EnrollmentTotals => {
    const existing = totals.get(sectionId);
    if (existing) return existing;
    const created = emptyTotals();
    totals.set(sectionId, created);
    return created;
  };

  for (const group of resultGroups) {
    const entry = entryFor(group.classSectionId);
    const count = group._count._all;
    if (group.result === EnrollmentResult.PASS) entry.pass += count;
    else if (group.result === EnrollmentResult.FAIL) entry.fail += count;
    else entry.inProgress += count;
  }

  for (const group of bannedGroups) {
    entryFor(group.classSectionId).examBanned += group._count._all;
  }

  return totals;
}
