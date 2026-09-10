import { Injectable } from '@nestjs/common';
import type { RoleKey } from '@fcare/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Ma trận báo tin theo độ khẩn — flow.png "WORKFLOW XÁC ĐỊNH ĐỘ KHẨN CẤP":
 * - Cấp 1: tất cả giảng viên đang dạy sinh viên.
 * - Cấp 2: + cán bộ phòng CTSV.
 * - Cấp 3: + trưởng bộ môn của sinh viên.
 * - Cấp 4: + trưởng phòng Đào tạo và trưởng phòng CTSV.
 */
@Injectable()
export class EscalationService {
  constructor(private readonly prisma: PrismaService) {}

  async computeRecipientIds(
    studentId: string,
    level: number,
    raisedById: string,
  ): Promise<string[]> {
    const recipients = new Set<string>();

    const teachingLecturers = await this.prisma.staff.findMany({
      where: {
        isActive: true,
        classSections: { some: { enrollments: { some: { studentId } } } },
      },
      select: { id: true },
    });
    teachingLecturers.forEach((staff) => recipients.add(staff.id));

    if (level >= 2) {
      (await this.findActiveStaffByRoles(['SA_OFFICER'])).forEach((id) =>
        recipients.add(id),
      );
    }

    if (level >= 3) {
      const student = await this.prisma.student.findUnique({
        where: { id: studentId },
        select: { departmentId: true },
      });
      if (student) {
        (
          await this.findActiveStaffByRoles(
            ['HEAD_OF_DEPT'],
            student.departmentId,
          )
        ).forEach((id) => recipients.add(id));
      }
    }

    if (level >= 4) {
      (
        await this.findActiveStaffByRoles(['TRAINING_OFFICER', 'SA_HEAD'])
      ).forEach((id) => recipients.add(id));
    }

    recipients.delete(raisedById); // người phát cảnh báo không cần tự nhận thông báo
    return [...recipients];
  }

  private async findActiveStaffByRoles(
    roleKeys: RoleKey[],
    departmentId?: string,
  ): Promise<string[]> {
    const staff = await this.prisma.staff.findMany({
      where: {
        isActive: true,
        ...(departmentId ? { departmentId } : {}),
        roles: { some: { role: { key: { in: [...roleKeys] } } } },
      },
      select: { id: true },
    });
    return staff.map((member) => member.id);
  }
}
