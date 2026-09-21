import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { RoleKey } from '@fcare/shared-types';
import type { AuthUser } from '../../common/types/auth-user';
import {
  lecturerStatsScope,
  sectionScope,
  studentScope,
} from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  attendanceKey,
  attendanceTotals,
  latestAttendanceAlerts,
} from './attendance-care-stats';
import type {
  CareLecturer,
  CareReport,
  CareStudent,
  CareTotals,
} from './care-statistics.types';
import { buildCareWorkbook } from './care-statistics-export';
import type { CareStatisticsQuery } from './dto/care-statistics-query.dto';

/**
 * `students` chỉ gồm sinh viên CÓ cảnh báo; `studentCount` là sĩ số (mọi SV
 * đang học). Tỷ lệ chăm sóc = SV cảnh báo đã chăm sóc / SV cảnh báo.
 */
function totals(students: CareStudent[], studentCount: number): CareTotals {
  const unique = new Map<string, CareStudent>();
  for (const student of students) {
    const previous = unique.get(student.id);
    unique.set(student.id, {
      ...student,
      cared: student.cared || !!previous?.cared,
      evaluationCount:
        student.evaluationCount + (previous?.evaluationCount ?? 0),
      careLogCount: Math.max(student.careLogCount, previous?.careLogCount ?? 0),
      ownerCareLogCount: Math.max(
        student.ownerCareLogCount,
        previous?.ownerCareLogCount ?? 0,
      ),
      discussionCount: Math.max(
        student.discussionCount,
        previous?.discussionCount ?? 0,
      ),
    });
  }
  const rows = [...unique.values()];
  const caredCount = rows.filter((student) => student.cared).length;
  return {
    studentCount,
    alertedStudentCount: rows.length,
    caredCount,
    uncaredCount: rows.length - caredCount,
    careRate: rows.length
      ? Math.round((caredCount / rows.length) * 10000) / 100
      : null,
    evaluationCount: rows.reduce(
      (sum, student) => sum + student.evaluationCount,
      0,
    ),
    careLogCount: rows.reduce((sum, student) => sum + student.careLogCount, 0),
    discussionCount: rows.reduce(
      (sum, student) => sum + student.discussionCount,
      0,
    ),
    ownerCareLogCount: rows.reduce(
      (sum, student) => sum + student.ownerCareLogCount,
      0,
    ),
    // Cảnh báo điểm danh tính theo từng lớp nên KHÔNG gộp theo sinh viên.
    attendanceAlerts: attendanceTotals(students),
  };
}

function matchesStatus(student: CareStudent, query: CareStatisticsQuery) {
  return (
    !query.status ||
    query.status === 'all' ||
    student.cared === (query.status === 'cared')
  );
}

const WHOLE_SCHOOL_CARE_ROLES: readonly RoleKey[] = [
  'ADMIN',
  'TRAINING_OFFICER',
];
const CARE_STATS_ROLES: readonly RoleKey[] = [
  ...WHOLE_SCHOOL_CARE_ROLES,
  'HEAD_OF_DEPT',
];

@Injectable()
export class CareStatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: CareStatisticsQuery): Promise<CareReport> {
    if (!CARE_STATS_ROLES.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException(
        'Chỉ Admin, Cán bộ Đào tạo và Trưởng bộ môn được xem thống kê chăm sóc.',
      );
    }
    if (!query.term) {
      throw new BadRequestException('Vui lòng chọn một học kỳ cụ thể.');
    }
    const term = await this.prisma.term.findUnique({
      where: { code: query.term },
      select: { code: true, name: true, startDate: true, endDate: true },
    });
    if (
      !term ||
      !term.startDate ||
      !term.endDate ||
      term.startDate > term.endDate
    ) {
      throw new BadRequestException(
        'Học kỳ chưa có cấu hình thời gian hợp lệ.',
      );
    }

    // Vai toàn trường giữ nguyên phạm vi; còn lại thu về đúng vai TBM.
    const scopedUser: AuthUser = WHOLE_SCHOOL_CARE_ROLES.some((role) =>
      user.roles.includes(role),
    )
      ? user
      : { ...user, roles: ['HEAD_OF_DEPT'] };

    const sections = await this.prisma.classSection.findMany({
      where: {
        AND: [
          { term: term.code, lecturerId: query.lecturerId ?? { not: null } },
          sectionScope(scopedUser),
          { lecturer: lecturerStatsScope(scopedUser) },
          ...(query.departmentId
            ? [{ lecturer: { departmentId: query.departmentId } }]
            : []),
        ],
      },
      orderBy: [{ lecturer: { staffCode: 'asc' } }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        subject: { select: { name: true } },
        lecturer: {
          select: {
            id: true,
            staffCode: true,
            fullName: true,
            department: { select: { id: true, code: true, name: true } },
          },
        },
        enrollments: {
          where: { student: studentScope(scopedUser) },
          orderBy: { student: { studentCode: 'asc' } },
          select: {
            student: {
              select: {
                id: true,
                studentCode: true,
                fullName: true,
                classCode: true,
              },
            },
          },
        },
      },
    });

    const studentIds = [
      ...new Set(
        sections.flatMap((section) =>
          section.enrollments.map(({ student }) => student.id),
        ),
      ),
    ];
    const sectionIds = sections.map((section) => section.id);
    const range = { gte: term.startDate, lte: term.endDate };

    const [evaluations, logs, discussions, alerts, attendanceAlerts] =
      studentIds.length
        ? await Promise.all([
            this.prisma.evaluation.findMany({
              where: {
                term: term.code,
                classSectionId: { in: sectionIds },
                studentId: { in: studentIds },
              },
              select: {
                id: true,
                classSectionId: true,
                lecturerId: true,
                studentId: true,
                academicScore: true,
                attitudeScore: true,
                absentSessions: true,
                note: true,
                updatedAt: true,
                lecturer: { select: { staffCode: true, fullName: true } },
                criteria: { select: { criterion: true } },
              },
              orderBy: { updatedAt: 'desc' },
            }),
            this.prisma.careLog.findMany({
              where: {
                studentId: { in: studentIds },
                createdAt: range,
              },
              select: {
                id: true,
                staffId: true,
                studentId: true,
                channel: true,
                content: true,
                outcome: true,
                nextAction: true,
                createdAt: true,
                staff: { select: { staffCode: true, fullName: true } },
              },
              orderBy: { createdAt: 'desc' },
            }),
            this.prisma.discussionMessage.findMany({
              where: {
                studentId: { in: studentIds },
                createdAt: range,
                deletedAt: null,
              },
              select: {
                id: true,
                studentId: true,
                authorId: true,
                body: true,
                createdAt: true,
                author: { select: { staffCode: true, fullName: true } },
              },
              orderBy: { createdAt: 'desc' },
            }),
            this.prisma.alert.findMany({
              where: { studentId: { in: studentIds }, createdAt: range },
              select: { studentId: true, classSectionId: true, level: true },
            }),
            this.prisma.alert.findMany({
              where: {
                source: 'AUTO_ATTENDANCE',
                term: term.code,
                classSectionId: { in: sectionIds },
                studentId: { in: studentIds },
              },
              select: {
                studentId: true,
                classSectionId: true,
                level: true,
                absentSessions: true,
                ownerCaredAt: true,
                createdAt: true,
                _count: { select: { careLogs: true } },
              },
            }),
          ])
        : [[], [], [], [], []];
    const attendanceMap = latestAttendanceAlerts(
      attendanceAlerts.map((alert) => ({
        ...alert,
        careLogCount: alert._count.careLogs,
      })),
    );

    const evaluationMap = new Map<string, typeof evaluations>();
    for (const evaluation of evaluations) {
      const key = `${evaluation.classSectionId}:${evaluation.studentId}`;
      evaluationMap.set(key, [...(evaluationMap.get(key) ?? []), evaluation]);
    }

    const logMap = new Map<string, typeof logs>();
    for (const log of logs) {
      logMap.set(log.studentId, [...(logMap.get(log.studentId) ?? []), log]);
    }

    const discussionMap = new Map<string, typeof discussions>();
    for (const discussion of discussions) {
      discussionMap.set(discussion.studentId, [
        ...(discussionMap.get(discussion.studentId) ?? []),
        discussion,
      ]);
    }

    const alertsByStudent = new Map<string, typeof alerts>();
    for (const alert of alerts) {
      if (alert.level < 1 || alert.level > 4) continue;
      alertsByStudent.set(alert.studentId, [
        ...(alertsByStudent.get(alert.studentId) ?? []),
        alert,
      ]);
    }

    const lecturers = new Map<string, CareLecturer>();
    // Toàn bộ SV cảnh báo (trước lọc trạng thái) + sĩ số không trùng theo GV.
    const lecturerAlerted = new Map<string, CareStudent[]>();
    const lecturerEnrolled = new Map<string, Set<string>>();
    for (const section of sections) {
      const lecturer = section.lecturer;
      if (!lecturer) continue;

      // Chỉ SV có cảnh báo trong kỳ (gắn lớp này hoặc không gắn lớp nào).
      const alerted: CareStudent[] = section.enrollments
        .map(({ student }) => ({
          student,
          sectionAlerts: (alertsByStudent.get(student.id) ?? []).filter(
            (alert) =>
              alert.classSectionId === null ||
              alert.classSectionId === section.id,
          ),
        }))
        .filter(({ sectionAlerts }) => sectionAlerts.length > 0)
        .map(({ student, sectionAlerts }) => {
          const marks = evaluationMap.get(`${section.id}:${student.id}`) ?? [];
          const careLogs = logMap.get(student.id) ?? [];
          const studentDiscussions = discussionMap.get(student.id) ?? [];

          const dates = [
            ...marks.map((mark) => mark.updatedAt.getTime()),
            ...careLogs.map((log) => log.createdAt.getTime()),
            ...studentDiscussions.map((msg) => msg.createdAt.getTime()),
          ];

          const cared =
            marks.length + careLogs.length + studentDiscussions.length > 0;

          return {
            ...student,
            cared,
            evaluationCount: marks.length,
            careLogCount: careLogs.length,
            discussionCount: studentDiscussions.length,
            lastCareAt: dates.length
              ? new Date(Math.max(...dates)).toISOString()
              : null,
            alertLevel: Math.max(...sectionAlerts.map((alert) => alert.level)),
            alertCount: sectionAlerts.length,
            ownerCareLogCount: careLogs.filter(
              (log) => log.staffId === lecturer.id,
            ).length,
            attendanceAlert:
              attendanceMap.get(attendanceKey(section.id, student.id)) ?? null,
            evaluations: marks.map((m) => ({
              academicScore: m.academicScore,
              attitudeScore: m.attitudeScore,
              absentSessions: m.absentSessions,
              note: m.note,
              criteria: m.criteria.map((c) => c.criterion),
              evaluatorStaffCode: m.lecturer.staffCode,
              evaluatorName: m.lecturer.fullName,
              updatedAt: m.updatedAt.toISOString(),
            })),
            careLogs: careLogs.map((l) => ({
              channel: l.channel === 'IN_PERSON' ? 'Trực tiếp' : 'Online',
              content: l.content,
              outcome: l.outcome,
              nextAction: l.nextAction,
              staffCode: l.staff.staffCode,
              staffName: l.staff.fullName,
              createdAt: l.createdAt.toISOString(),
            })),
            discussions: studentDiscussions.map((d) => ({
              authorCode: d.author.staffCode,
              authorName: d.author.fullName,
              body: d.body,
              createdAt: d.createdAt.toISOString(),
            })),
          };
        });
      const students = alerted.filter((student) =>
        matchesStatus(student, query),
      );

      if (query.status && query.status !== 'all' && !students.length) continue;

      const entry = lecturers.get(lecturer.id) ?? {
        ...lecturer,
        ...totals([], 0),
        sectionCount: 0,
        sections: [],
      };

      // Tỷ lệ tính trên mọi SV cảnh báo; bộ lọc trạng thái chỉ lọc danh sách.
      entry.sections.push({
        id: section.id,
        code: section.code,
        subjectName: section.subject.name,
        students,
        ...totals(alerted, section.enrollments.length),
      });

      lecturers.set(lecturer.id, entry);
      lecturerAlerted.set(lecturer.id, [
        ...(lecturerAlerted.get(lecturer.id) ?? []),
        ...alerted,
      ]);
      lecturerEnrolled.set(
        lecturer.id,
        new Set([
          ...(lecturerEnrolled.get(lecturer.id) ?? []),
          ...section.enrollments.map(({ student }) => student.id),
        ]),
      );
    }

    for (const lecturer of lecturers.values()) {
      Object.assign(
        lecturer,
        totals(
          lecturerAlerted.get(lecturer.id) ?? [],
          lecturerEnrolled.get(lecturer.id)?.size ?? 0,
        ),
      );
      lecturer.sectionCount = lecturer.sections.length;
    }

    return {
      term,
      generatedAt: new Date().toISOString(),
      lecturers: [...lecturers.values()],
    };
  }

  async export(user: AuthUser, query: CareStatisticsQuery): Promise<Buffer> {
    return buildCareWorkbook(await this.list(user, query), query);
  }
}
