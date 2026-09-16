import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
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
  formatAttendanceAlert,
  formatOwnerCared,
  latestAttendanceAlerts,
} from './attendance-care-stats';
import type {
  CareLecturer,
  CareReport,
  CareStudent,
  CareTotals,
} from './care-statistics.types';
import type { CareStatisticsQuery } from './dto/care-statistics-query.dto';

const CRITERION_LABELS: Record<string, string> = {
  P_NOT_FIT_MAJOR: 'Không phù hợp chuyên ngành',
  P_PART_TIME_JOB: 'Đi làm thêm nhiều',
  P_OTHER_ACTIVITIES: 'Tham gia hoạt động khác nhiều',
  P_FAMILY_HARDSHIP: 'Hoàn cảnh gia đình đặc biệt',
  P_FINANCIAL_HARDSHIP: 'Khó khăn tài chính',
  P_PSYCHOLOGICAL: 'Tâm lý không ổn định',
  P_DROPOUT_INTENT: 'Ý định nghỉ học',
  H_NO_QUIZ_CMS: 'Không làm Quiz / CMS',
  H_EXAM_BAN_RISK: 'Nguy cơ cấm thi',
  H_NO_RESPONSE: 'Không liên lạc được / không phản hồi',
};

function formatCriterion(criterion: string): string {
  return CRITERION_LABELS[criterion] ?? criterion;
}

function formatDateVN(date: Date | string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
  });
}

function totals(students: CareStudent[]): CareTotals {
  const unique = new Map<string, CareStudent>();
  for (const student of students) {
    const previous = unique.get(student.id);
    unique.set(student.id, {
      ...student,
      cared: student.cared || !!previous?.cared,
      evaluationCount:
        student.evaluationCount + (previous?.evaluationCount ?? 0),
      careLogCount: Math.max(student.careLogCount, previous?.careLogCount ?? 0),
      discussionCount: Math.max(
        student.discussionCount,
        previous?.discussionCount ?? 0,
      ),
    });
  }
  const rows = [...unique.values()];
  const caredCount = rows.filter((student) => student.cared).length;
  return {
    studentCount: rows.length,
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
    // Cảnh báo điểm danh tính theo từng lớp nên KHÔNG gộp theo sinh viên.
    attendanceAlerts: attendanceTotals(students),
  };
}

/** Cột chung của sheet "Tổng hợp giáo viên" và "Theo lớp" (sau cột định danh). */
const COUNT_HEADERS = [
  'Sinh viên',
  'Đã chăm sóc',
  'Chưa chăm sóc',
  'Tỷ lệ (%)',
  'Nhận xét',
  'Nhật ký',
  'Trao đổi',
  'CB điểm danh',
  'GV lớp đã CS',
  'GV khác CS',
  'CB chờ GV lớp',
];
const COUNT_WIDTHS = [14, 15, 16, 14, 13, 13, 13, 14, 14, 13, 15];
const SUMMARY_HEADERS = [
  'Mã NV',
  'Họ tên',
  'Bộ môn',
  'Số lớp',
  ...COUNT_HEADERS,
];
const SUMMARY_WIDTHS = [14, 25, 20, 12, ...COUNT_WIDTHS];
const CLASS_HEADERS = [
  'Mã NV',
  'Họ tên',
  'Lớp học phần',
  'Môn học',
  ...COUNT_HEADERS,
];
const CLASS_WIDTHS = [14, 25, 22, 28, ...COUNT_WIDTHS];
const ATTENDANCE_STUDENT_HEADERS = [
  'CB điểm danh',
  'GV lớp đã CS',
  'Nhật ký gắn CB',
];
const ATTENDANCE_STUDENT_WIDTHS = [22, 16, 14];

@Injectable()
export class CareStatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: CareStatisticsQuery): Promise<CareReport> {
    if (!user.roles.includes('ADMIN') && !user.roles.includes('HEAD_OF_DEPT')) {
      throw new ForbiddenException(
        'Chỉ Admin và Trưởng bộ môn được xem thống kê chăm sóc.',
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

    const scopedUser: AuthUser = user.roles.includes('ADMIN')
      ? user
      : { ...user, roles: ['HEAD_OF_DEPT'] };

    const sections = await this.prisma.classSection.findMany({
      where: {
        AND: [
          { term: term.code, lecturerId: query.lecturerId ?? { not: null } },
          sectionScope(scopedUser),
          { lecturer: lecturerStatsScope(scopedUser) },
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
            department: { select: { code: true, name: true } },
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
              select: { studentId: true, level: true },
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

    const alertMap = new Map<string, number>();
    for (const alert of alerts) {
      if (alert.level >= 1 && alert.level <= 4) {
        alertMap.set(
          alert.studentId,
          Math.max(alert.level, alertMap.get(alert.studentId) ?? 0),
        );
      }
    }

    const lecturers = new Map<string, CareLecturer>();
    for (const section of sections) {
      const lecturer = section.lecturer;
      if (!lecturer) continue;

      const students: CareStudent[] = section.enrollments
        .map(({ student }) => {
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
            alertLevel: alertMap.get(student.id) ?? null,
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
        })
        .filter(
          (student) =>
            !query.status ||
            query.status === 'all' ||
            student.cared === (query.status === 'cared'),
        );

      if (query.status && query.status !== 'all' && !students.length) continue;

      const entry = lecturers.get(lecturer.id) ?? {
        ...lecturer,
        ...totals([]),
        sectionCount: 0,
        sections: [],
      };

      entry.sections.push({
        id: section.id,
        code: section.code,
        subjectName: section.subject.name,
        students,
        ...totals(students),
      });

      lecturers.set(lecturer.id, entry);
    }

    for (const lecturer of lecturers.values()) {
      Object.assign(
        lecturer,
        totals(lecturer.sections.flatMap((section) => section.students)),
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
    const report = await this.list(user, query);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FCare';

    const isDetailed = query.mode === 'detailed';
    const definitions = isDetailed
      ? 'BÁO CÁO CHI TIẾT CHĂM SÓC SINH VIÊN: Gồm chi tiết nhận xét của giảng viên, nhật ký chăm sóc cá nhân và toàn bộ trao đổi thảo luận giữa các giảng viên/cán bộ về sinh viên trong học kỳ.'
      : 'BÁO CÁO TỔNG HỢP CHĂM SÓC SINH VIÊN: Đã chăm sóc: sinh viên có nhận xét tại lớp trong kỳ, nhật ký chăm sóc hoặc trao đổi nội bộ trong thời gian kỳ. Cảnh báo: mức cao nhất trong kỳ. Tổng giáo viên không đếm trùng sinh viên giữa các lớp.';

    const addSheet = (
      name: string,
      headers: string[],
      columnWidths?: number[],
    ) => {
      const sheet = workbook.addWorksheet(name);
      sheet.addRow([`Học kỳ: ${report.term.code} — ${report.term.name}`]);
      sheet.addRow([
        `Thời gian học kỳ: ${formatDateVN(report.term.startDate)} — ${formatDateVN(report.term.endDate)} | Thời điểm xuất: ${formatDateVN(report.generatedAt)}`,
      ]);
      sheet.addRow([
        `Bộ lọc áp dụng: Giáo viên ${query.lecturerId ? (report.lecturers.find((l) => l.id === query.lecturerId)?.fullName ?? query.lecturerId) : 'Tất cả'}; Trạng thái: ${query.status === 'cared' ? 'Đã chăm sóc' : query.status === 'uncared' ? 'Chưa chăm sóc' : 'Tất cả'}`,
      ]);
      sheet.addRow([definitions]);

      for (let row = 1; row <= 4; row++) {
        sheet.mergeCells(row, 1, row, headers.length);
        sheet.getRow(row).alignment = { wrapText: true, vertical: 'middle' };
        sheet.getRow(row).height = row === 4 ? 44 : 26;
      }

      sheet.addRow(headers).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(5).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF16304E' },
      };
      sheet.getRow(5).alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      sheet.getRow(5).height = 32;

      sheet.columns.forEach((column, index) => {
        column.width = columnWidths?.[index] ?? 22;
      });

      sheet.views = [{ state: 'frozen', ySplit: 5 }];
      sheet.autoFilter = {
        from: { row: 5, column: 1 },
        to: { row: 5, column: headers.length },
      };
      return sheet;
    };

    const counts = (entry: CareTotals) => [
      entry.studentCount,
      entry.caredCount,
      entry.uncaredCount,
      entry.careRate === null ? '—' : `${entry.careRate}%`,
      entry.evaluationCount,
      entry.careLogCount,
      entry.discussionCount,
      entry.attendanceAlerts.total,
      entry.attendanceAlerts.caredByOwner,
      entry.attendanceAlerts.caredByOthers,
      entry.attendanceAlerts.pending,
    ];
    const attendanceCells = (student: CareStudent) => [
      formatAttendanceAlert(student.attendanceAlert),
      formatOwnerCared(student.attendanceAlert),
      student.attendanceAlert?.careLogCount ?? 0,
    ];

    if (isDetailed) {
      // ===== BẢNG CHI TIẾT NỘI DUNG CHĂM SÓC =====
      const detailedHeaders = [
        'Mã NV',
        'Giảng viên phụ trách',
        'Bộ môn',
        'Lớp học phần',
        'Môn học',
        'MSSV',
        'Họ tên sinh viên',
        'Lớp hành chính',
        'Trạng thái chăm sóc',
        'Mức cảnh báo',
        'Lần chăm sóc gần nhất',
        'Chi tiết nhận xét của GV',
        'Nhật ký chăm sóc',
        'Trao đổi thảo luận giữa GV & CB',
        ...ATTENDANCE_STUDENT_HEADERS,
      ];
      const detailedWidths = [
        14,
        24,
        18,
        22,
        28,
        14,
        25,
        16,
        18,
        15,
        22,
        45,
        52,
        52,
        ...ATTENDANCE_STUDENT_WIDTHS,
      ];
      const detailedSheet = addSheet(
        'Chi tiết nội dung chăm sóc',
        detailedHeaders,
        detailedWidths,
      );

      for (const lecturer of report.lecturers) {
        for (const section of lecturer.sections) {
          for (const student of section.students) {
            // Định dạng chi tiết nhận xét
            const evalParts = (student.evaluations ?? []).map((m, idx) => {
              const critStr = m.criteria.map(formatCriterion).join(', ');
              let text = `[Lần ${idx + 1} - ${formatDateVN(m.updatedAt)} - GV: ${m.evaluatorName} (${m.evaluatorStaffCode})]:\n- Điểm học tập: ${m.academicScore}/10 | Điểm thái độ: ${m.attitudeScore}/10 | Vắng: ${m.absentSessions ?? 0} buổi`;
              if (critStr) text += `\n- Tiêu chí: ${critStr}`;
              if (m.note) text += `\n- Ghi chú: ${m.note}`;
              return text;
            });
            const evalDetail =
              evalParts.length > 0
                ? evalParts.join('\n\n---\n\n')
                : 'Chưa có nhận xét môn học';

            // Định dạng chi tiết nhật ký chăm sóc
            const logParts = (student.careLogs ?? []).map((l, idx) => {
              let text = `[Lần ${idx + 1} - ${formatDateVN(l.createdAt)} - Hình thức: ${l.channel} - Cán bộ: ${l.staffName} (${l.staffCode})]:\n- Nội dung: ${l.content}`;
              if (l.outcome) text += `\n- Kết quả: ${l.outcome}`;
              if (l.nextAction) text += `\n- Kế hoạch tiếp: ${l.nextAction}`;
              return text;
            });
            const logDetail =
              logParts.length > 0
                ? logParts.join('\n\n---\n\n')
                : 'Chưa có nhật ký chăm sóc';

            // Định dạng chi tiết trao đổi thảo luận
            const discParts = (student.discussions ?? []).map((d, idx) => {
              return `[Tin ${idx + 1} - ${formatDateVN(d.createdAt)} - ${d.authorName} (${d.authorCode})]:\n${d.body}`;
            });
            const discDetail =
              discParts.length > 0
                ? discParts.join('\n\n---\n\n')
                : 'Chưa có trao đổi nội bộ';

            const row = detailedSheet.addRow([
              lecturer.staffCode,
              lecturer.fullName,
              lecturer.department?.name ?? '—',
              section.code,
              section.subjectName,
              student.studentCode,
              student.fullName,
              student.classCode || '—',
              student.cared ? 'Đã chăm sóc' : 'Chưa chăm sóc',
              student.alertLevel ? `Mức ${student.alertLevel}` : 'Không có',
              formatDateVN(student.lastCareAt),
              evalDetail,
              logDetail,
              discDetail,
              ...attendanceCells(student),
            ]);

            row.alignment = { vertical: 'top', wrapText: true };
          }
        }
      }

      // Thêm 2 sheet tổng hợp kèm theo
      const summarySheet = addSheet(
        'Tổng hợp giáo viên',
        SUMMARY_HEADERS,
        SUMMARY_WIDTHS,
      );
      for (const lecturer of report.lecturers) {
        summarySheet.addRow([
          lecturer.staffCode,
          lecturer.fullName,
          lecturer.department?.name ?? '—',
          lecturer.sectionCount,
          ...counts(lecturer),
        ]);
      }

      const classSheet = addSheet('Theo lớp', CLASS_HEADERS, CLASS_WIDTHS);
      for (const lecturer of report.lecturers) {
        for (const section of lecturer.sections) {
          classSheet.addRow([
            lecturer.staffCode,
            lecturer.fullName,
            section.code,
            section.subjectName,
            ...counts(section),
          ]);
        }
      }
    } else {
      // ===== BẢNG TỔNG HỢP MẶC ĐỊNH =====
      const summary = addSheet(
        'Tổng hợp giáo viên',
        SUMMARY_HEADERS,
        SUMMARY_WIDTHS,
      );

      const classes = addSheet('Theo lớp', CLASS_HEADERS, CLASS_WIDTHS);

      const students = addSheet(
        'Chi tiết sinh viên',
        [
          'Mã NV',
          'Giáo viên',
          'Lớp học phần',
          'MSSV',
          'Sinh viên',
          'Lớp hành chính',
          'Chăm sóc',
          'Nhận xét',
          'Nhật ký',
          'Trao đổi',
          'Gần nhất',
          'Cảnh báo',
          ...ATTENDANCE_STUDENT_HEADERS,
        ],
        [
          14,
          25,
          22,
          14,
          25,
          16,
          16,
          13,
          13,
          13,
          22,
          14,
          ...ATTENDANCE_STUDENT_WIDTHS,
        ],
      );

      for (const lecturer of report.lecturers) {
        summary.addRow([
          lecturer.staffCode,
          lecturer.fullName,
          lecturer.department?.name ?? '—',
          lecturer.sectionCount,
          ...counts(lecturer),
        ]);

        for (const section of lecturer.sections) {
          classes.addRow([
            lecturer.staffCode,
            lecturer.fullName,
            section.code,
            section.subjectName,
            ...counts(section),
          ]);

          for (const student of section.students) {
            students.addRow([
              lecturer.staffCode,
              lecturer.fullName,
              section.code,
              student.studentCode,
              student.fullName,
              student.classCode || '—',
              student.cared ? 'Đã chăm sóc' : 'Chưa chăm sóc',
              student.evaluationCount,
              student.careLogCount,
              student.discussionCount,
              formatDateVN(student.lastCareAt),
              student.alertLevel ? `Mức ${student.alertLevel}` : 'Không có',
              ...attendanceCells(student),
            ]);
          }
        }
      }
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
