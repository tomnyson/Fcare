import { Injectable } from '@nestjs/common';
import { AlertStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/types/auth-user';
import {
  isDeptScoped,
  NO_DEPARTMENT,
  seesWholeDepartment,
  statsStudentScope,
} from '../../../common/utils/dept-scope';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class DepartmentStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Thống kê theo bộ môn: sĩ số theo trạng thái + cảnh báo đang mở.
   * Mọi con số đều tính TRÊN PHẠM VI người xem (`studentScope`) chứ không lấy
   * `_count` thô của bộ môn: giảng viên chỉ được thấy sinh viên mình dạy nên
   * tổng sĩ số cả bộ môn cũng là dữ liệu họ không được biết. `totalStaff` chỉ
   * trả cho người xem được cả bộ môn (TBM với bộ môn mình, hoặc vai trò toàn
   * trường); còn lại trả `null` để UI hiển thị "—" thay vì một số sai.
   */
  async list(user: AuthUser) {
    const scoped = isDeptScoped(user);
    const deptWide = seesWholeDepartment(user);
    const scope = statsStudentScope(user);
    const ownDepartmentId = user.departmentId ?? NO_DEPARTMENT;

    const [departments, studentGroups, openAlerts] = await Promise.all([
      this.prisma.department.findMany({
        // Bộ môn đang tắt (cơ sở không có) không lên báo cáo.
        // Giảng viên thuần chỉ thấy dòng bộ môn của mình; TBM thấy thêm bộ môn
        // có SV lớp mình dạy chéo.
        where: {
          isActive: true,
          ...(scoped && !deptWide ? { id: ownDepartmentId } : {}),
          ...(deptWide
            ? {
                OR: [{ students: { some: scope } }, { id: ownDepartmentId }],
              }
            : {}),
        },
        orderBy: { code: 'asc' },
        include: { _count: { select: { staff: true } } },
      }),
      this.prisma.student.groupBy({
        by: ['departmentId', 'status'],
        _count: { _all: true },
        where: scope,
      }),
      this.prisma.alert.findMany({
        where: {
          status: { not: AlertStatus.RESOLVED },
          student: scope,
        },
        select: { level: true, student: { select: { departmentId: true } } },
      }),
    ]);

    const alertCountByDept = new Map<string, number>();
    for (const alert of openAlerts) {
      const deptId = alert.student.departmentId;
      alertCountByDept.set(deptId, (alertCountByDept.get(deptId) ?? 0) + 1);
    }

    return departments.map((department) => {
      const groups = studentGroups.filter(
        (group) => group.departmentId === department.id,
      );
      const canSeeStaffCount =
        !scoped || (deptWide && department.id === ownDepartmentId);
      return {
        id: department.id,
        code: department.code,
        name: department.name,
        totalStudents: groups.reduce(
          (sum, group) => sum + group._count._all,
          0,
        ),
        totalStaff: canSeeStaffCount ? department._count.staff : null,
        openAlerts: alertCountByDept.get(department.id) ?? 0,
        studentsByStatus: groups.map((group) => ({
          status: group.status,
          count: group._count._all,
        })),
      };
    });
  }
}
