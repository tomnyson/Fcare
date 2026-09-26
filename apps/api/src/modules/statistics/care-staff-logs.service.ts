import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import {
  isPureLecturer,
  statsStudentScope,
} from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { careLogSectionSelect } from '../care-logs/care-logs.service';
import { TermsService } from '../master-data/terms.service';
import type { CareStaffLogsQuery } from './dto/statistics-query.dto';
import type { TermWindow } from './statistics.service';

const DEFAULT_LIMIT = 20;

/** Cảnh báo gắn với nhật ký: đủ để gắn tag "cấp N — lớp CODE", không PII. */
const alertSummarySelect = {
  id: true,
  level: true,
  source: true,
  classSection: { select: { code: true } },
} as const;

/**
 * Chi tiết một dòng của bảng "Chăm sóc theo bộ môn / CTSV": các lượt chăm sóc
 * của MỘT người trong kỳ. Cùng khung thời gian và cùng `statsStudentScope` với
 * `CareOverviewService` để tổng ở trang chi tiết khớp đúng số trên bảng.
 */
@Injectable()
export class CareStaffLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly termsService: TermsService,
  ) {}

  async list(user: AuthUser, staffId: string, query: CareStaffLogsQuery) {
    if (isPureLecturer(user)) {
      throw new ForbiddenException(
        'Giảng viên chỉ xem được thống kê lớp mình dạy.',
      );
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const [staff, term] = await Promise.all([
      this.prisma.staff.findUnique({
        where: { id: staffId },
        select: { id: true, staffCode: true, fullName: true },
      }),
      query.term
        ? this.findTerm(query.term)
        : this.termsService.getCurrentTerm(),
    ]);
    if (!staff) {
      throw new NotFoundException('Không tìm thấy người chăm sóc.');
    }
    if (!term) {
      return {
        staff,
        term: null,
        caredStudents: 0,
        items: [],
        meta: { total: 0, page, limit },
      };
    }

    const window: TermWindow = {
      code: term.code,
      name: term.name,
      startDate: term.startDate,
      endDate: term.endDate,
    };
    const where = {
      staffId,
      createdAt: { gte: window.startDate, lte: window.endDate },
      student: statsStudentScope(user),
    };
    const [items, total, students] = await Promise.all([
      this.prisma.careLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: {
            select: {
              id: true,
              studentCode: true,
              fullName: true,
              classCode: true,
            },
          },
          alert: { select: alertSummarySelect },
          classSection: careLogSectionSelect,
        },
      }),
      this.prisma.careLog.count({ where }),
      this.prisma.careLog.groupBy({ by: ['studentId'], where }),
    ]);

    return {
      staff,
      term: window,
      caredStudents: students.length,
      items,
      meta: { total, page, limit },
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
