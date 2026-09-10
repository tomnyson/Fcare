import { Injectable } from '@nestjs/common';
import {
  computeRiskScore,
  type EvaluationInput,
  type RiskScoreBreakdown,
} from '@fcare/shared-types';
import type { AuthUser } from '../../common/types/auth-user';
import { studentScope } from '../../common/utils/dept-scope';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Điểm rủi ro luôn được TÍNH LẠI từ dữ liệu nguồn, không lưu thành cột —
 * sửa một bản nhận xét là con số đổi theo ngay.
 */
@Injectable()
export class RiskScoreService {
  constructor(private readonly prisma: PrismaService) {}

  async forStudentTerm(
    user: AuthUser,
    studentId: string,
    term: string,
  ): Promise<RiskScoreBreakdown> {
    const rows = await this.prisma.evaluation.findMany({
      where: { studentId, term, student: studentScope(user) },
      select: {
        academicScore: true,
        attitudeScore: true,
        absentSessions: true,
        criteria: { select: { criterion: true } },
      },
    });

    const inputs: EvaluationInput[] = rows.map((row) => ({
      academicScore: row.academicScore,
      attitudeScore: row.attitudeScore,
      absentSessions: row.absentSessions,
      criteria: row.criteria.map((mark) => mark.criterion),
    }));

    return computeRiskScore(inputs);
  }
}
