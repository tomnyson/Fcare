import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertStatus } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth-user';
import {
  isDeptScoped,
  isPureLecturer,
  NO_DEPARTMENT,
  statsStudentScope,
} from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { TermsService } from '../master-data/terms.service';
import type { TermWindow } from './statistics.service';

const SA_ROLES = new Set(['SA_OFFICER', 'SA_HEAD']);
/** Khẩn cấp → Thấp, đúng thứ tự trên màn hình. */
const LEVELS_DESC = [4, 3, 2, 1] as const;

export interface CareCount {
  careLogs: number;
  caredStudents: number;
}

export interface CareStaffRow extends CareCount {
  id: string;
  staffCode: string;
  fullName: string;
}

export interface CareDepartmentRow extends CareCount {
  id: string;
  code: string;
  name: string;
  lecturers: CareStaffRow[];
}

export interface CareOverview {
  term: TermWindow | null;
  departments: CareDepartmentRow[];
  sa: CareCount & { staff: CareStaffRow[] };
  warnedByLevel: Array<{ level: number; students: number }>;
}

interface CarePair {
  staffId: string;
  studentId: string;
  _count: { _all: number };
}

interface StaffInfo {
  id: string;
  staffCode: string;
  fullName: string;
  departmentId: string | null;
  roles: Array<{ role: { key: string } }>;
}

interface DepartmentInfo {
  id: string;
  code: string;
  name: string;
}

interface WarnedStudent {
  studentId: string;
  _max: { level: number | null };
}

/**
 * Bức tranh chăm sóc của một kỳ cho Admin / Cán bộ Đào tạo / TBM / CTSV:
 * bộ môn nào (theo bộ môn của NGƯỜI chăm sóc) chăm sóc bao nhiêu SV, thầy cô
 * nào chăm sóc, CTSV chăm sóc bao nhiêu, và số SV đang cảnh báo theo mức.
 */
@Injectable()
export class CareOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly termsService: TermsService,
  ) {}

  async overview(user: AuthUser, termCode?: string): Promise<CareOverview> {
    if (isPureLecturer(user)) {
      throw new ForbiddenException(
        'Giảng viên chỉ xem được thống kê lớp mình dạy.',
      );
    }
    const term = termCode
      ? await this.findTerm(termCode)
      : await this.termsService.getCurrentTerm();
    if (!term) return { ...buildCareOverview([], [], [], []), term: null };

    const window: TermWindow = {
      code: term.code,
      name: term.name,
      startDate: term.startDate,
      endDate: term.endDate,
    };
    const scope = statsStudentScope(user);
    const range = { gte: window.startDate, lte: window.endDate };

    const [pairs, departments, warned] = await Promise.all([
      this.prisma.careLog.groupBy({
        by: ['staffId', 'studentId'],
        _count: { _all: true },
        where: { createdAt: range, student: scope },
      }),
      this.prisma.department.findMany({
        where: {
          isActive: true,
          ...(isDeptScoped(user)
            ? { id: user.departmentId ?? NO_DEPARTMENT }
            : {}),
        },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.alert.groupBy({
        by: ['studentId'],
        _max: { level: true },
        where: {
          AND: [
            { OR: [{ term: window.code }, { term: null, createdAt: range }] },
            { status: { not: AlertStatus.RESOLVED } },
            { student: scope },
          ],
        },
      }),
    ]);

    const staffIds = [...new Set(pairs.map((pair) => pair.staffId))];
    const staff = staffIds.length
      ? await this.prisma.staff.findMany({
          where: { id: { in: staffIds } },
          select: {
            id: true,
            staffCode: true,
            fullName: true,
            departmentId: true,
            roles: { select: { role: { select: { key: true } } } },
          },
        })
      : [];

    return {
      ...buildCareOverview(pairs, staff, departments, warned),
      term: window,
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
}

/** Gộp số liệu thô thành các dòng báo cáo — tách riêng để kiểm thử thuần. */
export function buildCareOverview(
  pairs: readonly CarePair[],
  staff: readonly StaffInfo[],
  departments: readonly DepartmentInfo[],
  warned: readonly WarnedStudent[],
): Omit<CareOverview, 'term'> {
  const staffById = new Map(staff.map((person) => [person.id, person]));
  const deptIds = new Set(departments.map((dept) => dept.id));
  const perStaff = new Map<string, { logs: number; students: Set<string> }>();
  const perDept = new Map<string, { logs: number; students: Set<string> }>();
  const sa = {
    logs: 0,
    students: new Set<string>(),
    staffIds: new Set<string>(),
  };

  for (const pair of pairs) {
    const person = staffById.get(pair.staffId);
    if (!person) continue;
    const logs = pair._count._all;
    const isSa = person.roles.some((item) => SA_ROLES.has(item.role.key));
    if (!isSa && !(person.departmentId && deptIds.has(person.departmentId))) {
      continue;
    }
    addTo(perStaff, person.id, logs, pair.studentId);
    if (isSa) {
      sa.logs += logs;
      sa.students.add(pair.studentId);
      sa.staffIds.add(person.id);
    } else {
      addTo(perDept, person.departmentId as string, logs, pair.studentId);
    }
  }

  const staffRow = (id: string): CareStaffRow => {
    const person = staffById.get(id) as StaffInfo;
    const counts = perStaff.get(id);
    return {
      id,
      staffCode: person.staffCode,
      fullName: person.fullName,
      careLogs: counts?.logs ?? 0,
      caredStudents: counts?.students.size ?? 0,
    };
  };
  const byCareDesc = (a: CareStaffRow, b: CareStaffRow) =>
    b.careLogs - a.careLogs || a.staffCode.localeCompare(b.staffCode);

  const lecturersByDept = new Map<string, CareStaffRow[]>();
  for (const id of perStaff.keys()) {
    if (sa.staffIds.has(id)) continue;
    const deptId = staffById.get(id)?.departmentId as string;
    lecturersByDept.set(deptId, [
      ...(lecturersByDept.get(deptId) ?? []),
      staffRow(id),
    ]);
  }

  const maxLevelCounts = new Map<number, number>();
  for (const row of warned) {
    const level = row._max.level;
    if (level === null) continue;
    maxLevelCounts.set(level, (maxLevelCounts.get(level) ?? 0) + 1);
  }

  return {
    departments: departments.map((dept) => ({
      ...dept,
      careLogs: perDept.get(dept.id)?.logs ?? 0,
      caredStudents: perDept.get(dept.id)?.students.size ?? 0,
      lecturers: [...(lecturersByDept.get(dept.id) ?? [])].sort(byCareDesc),
    })),
    sa: {
      careLogs: sa.logs,
      caredStudents: sa.students.size,
      staff: [...sa.staffIds].map(staffRow).sort(byCareDesc),
    },
    warnedByLevel: LEVELS_DESC.map((level) => ({
      level,
      students: maxLevelCounts.get(level) ?? 0,
    })),
  };
}

function addTo(
  target: Map<string, { logs: number; students: Set<string> }>,
  key: string,
  logs: number,
  studentId: string,
): void {
  const current = target.get(key) ?? { logs: 0, students: new Set<string>() };
  current.students.add(studentId);
  target.set(key, { logs: current.logs + logs, students: current.students });
}
