import { Injectable } from '@nestjs/common';
import { SA_MIN_ALERT_LEVEL, type RoleKey } from '@fcare/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

export type RecipientGroupKey =
  'TEACHING_LECTURERS' | 'STUDENT_AFFAIRS' | 'HEAD_OF_DEPT' | 'TRAINING_OFFICE';

export interface RecipientMember {
  id: string;
  fullName: string;
}

export interface RecipientGroup {
  key: RecipientGroupKey;
  /** Cảnh báo từ mức này trở lên thì nhóm nhận thông báo. */
  minLevel: number;
  members: RecipientMember[];
}

const STAFF_SELECT = { id: true, fullName: true } as const;

/**
 * Ma trận báo tin theo độ khẩn — flow.png "WORKFLOW XÁC ĐỊNH ĐỘ KHẨN CẤP":
 * - Cấp 1–4: tất cả giảng viên đang dạy sinh viên.
 * - Cấp 3–4: + CTSV (cán bộ + trưởng phòng; CTSV chỉ nhận từ mức 3 —
 *   docs/plan-lert.md mục 4) và trưởng bộ môn của sinh viên.
 * - Cấp 4: + cán bộ Đào tạo.
 */
@Injectable()
export class EscalationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `raisedById` bỏ trống khi cảnh báo do hệ thống phát (rà soát điểm danh):
   * không có ai để loại khỏi danh sách nhận.
   */
  async computeRecipientIds(
    studentId: string,
    level: number,
    raisedById?: string,
  ): Promise<string[]> {
    const groups = await this.previewRecipientGroups(studentId, raisedById);
    const recipients = new Set(
      groups
        .filter((group) => group.minLevel <= level)
        .flatMap((group) => group.members.map((member) => member.id)),
    );
    return [...recipients];
  }

  /**
   * Toàn bộ nhóm nhận theo ma trận, mỗi nhóm kèm mức bắt đầu nhận — form
   * nhận xét hiển thị trước "chọn mức N thì ai nhận"; cũng là nguồn của
   * `computeRecipientIds` nên xem trước và gửi thật không lệch nhau.
   * Người phát (`excludeId`) bị loại vì không cần tự nhận thông báo.
   */
  async previewRecipientGroups(
    studentId: string,
    excludeId?: string,
  ): Promise<RecipientGroup[]> {
    const [teaching, studentAffairs, headOfDept, training] = await Promise.all([
      this.prisma.staff.findMany({
        where: {
          isActive: true,
          classSections: { some: { enrollments: { some: { studentId } } } },
        },
        select: STAFF_SELECT,
      }),
      this.findActiveStaffByRoles(['SA_OFFICER', 'SA_HEAD']),
      this.findHeadsOfStudentDept(studentId),
      this.findActiveStaffByRoles(['TRAINING_OFFICER']),
    ]);
    const others = (members: RecipientMember[]) =>
      members.filter((member) => member.id !== excludeId);

    return [
      { key: 'TEACHING_LECTURERS', minLevel: 1, members: others(teaching) },
      {
        key: 'STUDENT_AFFAIRS',
        minLevel: SA_MIN_ALERT_LEVEL,
        members: others(studentAffairs),
      },
      { key: 'HEAD_OF_DEPT', minLevel: 3, members: others(headOfDept) },
      { key: 'TRAINING_OFFICE', minLevel: 4, members: others(training) },
    ];
  }

  private async findHeadsOfStudentDept(
    studentId: string,
  ): Promise<RecipientMember[]> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { departmentId: true },
    });
    return student
      ? this.findActiveStaffByRoles(['HEAD_OF_DEPT'], student.departmentId)
      : [];
  }

  private findActiveStaffByRoles(
    roleKeys: RoleKey[],
    departmentId?: string,
  ): Promise<RecipientMember[]> {
    return this.prisma.staff.findMany({
      where: {
        isActive: true,
        ...(departmentId ? { departmentId } : {}),
        roles: { some: { role: { key: { in: [...roleKeys] } } } },
      },
      select: STAFF_SELECT,
    });
  }
}
