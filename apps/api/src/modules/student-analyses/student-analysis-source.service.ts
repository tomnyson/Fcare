import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth-user';
import { studentScope } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  containsForbiddenAnalysisPii,
  hashAnalysisSource,
  redactAnalysisText,
  type AnalysisSourceSnapshot,
} from './analysis-source';

@Injectable()
export class StudentAnalysisSourceService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanInitiate(
    user: AuthUser,
    studentId: string,
    term: string,
  ): Promise<void> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ...studentScope(user) },
      select: { id: true },
    });
    if (!student) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong phạm vi quản lý của bạn.',
      );
    }
    if (user.roles.includes('ADMIN')) {
      return;
    }

    const teachingAssignment = await this.prisma.classSection.findFirst({
      where: {
        term,
        lecturerId: user.id,
        lecturer: { isActive: true },
        enrollments: { some: { studentId } },
      },
      select: { id: true },
    });
    if (!teachingAssignment) {
      throw new ForbiddenException(
        'Chỉ giảng viên đang dạy sinh viên trong học kỳ này hoặc Admin được tạo phân tích.',
      );
    }
  }

  async buildSnapshot(
    studentId: string,
    focusTerm: string,
    db: Pick<Prisma.TransactionClient, 'student'> = this.prisma,
  ): Promise<{ snapshot: AnalysisSourceSnapshot; hash: string }> {
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: {
        studentCode: true,
        fullName: true,
        enrollments: {
          orderBy: [{ classSection: { term: 'asc' } }, { createdAt: 'asc' }],
          select: {
            attendanceRate: true,
            midtermScore: true,
            finalScore: true,
            totalScore: true,
            isExamBanned: true,
            result: true,
            updatedAt: true,
            classSection: {
              select: {
                term: true,
                subject: { select: { code: true, name: true } },
                lecturer: {
                  select: { fullName: true, staffCode: true, username: true },
                },
              },
            },
          },
        },
        evaluations: {
          orderBy: [{ term: 'asc' }, { createdAt: 'asc' }],
          select: {
            term: true,
            academicScore: true,
            attitudeScore: true,
            issueGroup: true,
            note: true,
            updatedAt: true,
            lecturer: {
              select: { fullName: true, staffCode: true, username: true },
            },
          },
        },
      },
    });
    if (!student) {
      throw new NotFoundException('Không tìm thấy sinh viên.');
    }

    const identifiers = new Set<string>([
      student.fullName,
      student.studentCode,
    ]);
    for (const enrollment of student.enrollments) {
      const lecturer = enrollment.classSection.lecturer;
      if (lecturer) {
        identifiers.add(lecturer.fullName);
        identifiers.add(lecturer.staffCode);
        if (lecturer.username) identifiers.add(lecturer.username);
      }
    }
    for (const evaluation of student.evaluations) {
      identifiers.add(evaluation.lecturer.fullName);
      identifiers.add(evaluation.lecturer.staffCode);
      if (evaluation.lecturer.username)
        identifiers.add(evaluation.lecturer.username);
    }

    const snapshot: AnalysisSourceSnapshot = {
      focusTerm,
      enrollments: student.enrollments.map((enrollment) => ({
        term: enrollment.classSection.term,
        subjectCode: enrollment.classSection.subject.code,
        subjectName: enrollment.classSection.subject.name,
        attendanceRate: enrollment.attendanceRate,
        midtermScore: enrollment.midtermScore,
        finalScore: enrollment.finalScore,
        totalScore: enrollment.totalScore,
        isExamBanned: enrollment.isExamBanned,
        result: enrollment.result,
        updatedAt: enrollment.updatedAt.toISOString(),
      })),
      evaluations: student.evaluations.map((evaluation) => ({
        term: evaluation.term,
        academicScore: evaluation.academicScore,
        attitudeScore: evaluation.attitudeScore,
        issueGroup: evaluation.issueGroup,
        note: evaluation.note
          ? redactAnalysisText(evaluation.note, [...identifiers])
          : null,
        updatedAt: evaluation.updatedAt.toISOString(),
      })),
      limitations: [],
    };

    if (!snapshot.enrollments.some((item) => item.term === focusTerm)) {
      snapshot.limitations.push(
        'Không có dữ liệu học phần cho học kỳ trọng tâm.',
      );
    }
    if (!snapshot.evaluations.some((item) => item.term === focusTerm)) {
      snapshot.limitations.push(
        'Không có nhận xét giảng viên cho học kỳ trọng tâm.',
      );
    }

    const serialized = JSON.stringify(snapshot);
    if (containsForbiddenAnalysisPii(serialized)) {
      throw new ConflictException({
        message:
          'Dữ liệu nhận xét còn chứa thông tin định danh không được phép gửi tới AI.',
        code: 'ANALYSIS_PII_DETECTED',
      });
    }

    return { snapshot, hash: hashAnalysisSource(snapshot) };
  }
}
