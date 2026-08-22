import { Injectable } from '@nestjs/common';
import type { RoleKey } from '@fcare/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Ma trận báo tin theo độ khẩn (tài liệu II.1):
 * - Mức 1: giảng viên tự xử lý — không phát thông báo.
 * - Mức 2: + Trưởng bộ môn của sinh viên.
 * - Mức 3: + Cán bộ phòng Đào tạo.
 * - Mức 4: + Trưởng phòng CTSV, nhân viên CTSV và TẤT CẢ giảng viên đang dạy sinh viên.
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

    if (level >= 2) {
      const student = await this.prisma.student.findUnique({
        where: { id: studentId },
        select: { departmentId: true },
      });
      if (student) {
        const headsOfDept = await this.findActiveStaffByRoles(
          ['HEAD_OF_DEPT'],
          student.departmentId,
        );
        headsOfDept.forEach((id) => recipients.add(id));
      }
    }

    if (level >= 3) {
      const trainingOfficers = await this.findActiveStaffByRoles([
        'TRAINING_OFFICER',
      ]);
      trainingOfficers.forEach((id) => recipients.add(id));
    }

    if (level >= 4) {
      const studentAffairs = await this.findActiveStaffByRoles([
        'SA_HEAD',
        'SA_OFFICER',
      ]);
      studentAffairs.forEach((id) => recipients.add(id));

      const teachingLecturers = await this.prisma.staff.findMany({
        where: {
          isActive: true,
          classSections: { some: { enrollments: { some: { studentId } } } },
        },
        select: { id: true },
      });
      teachingLecturers.forEach((staff) => recipients.add(staff.id));
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
