'use client';

import {
  CRITERION_LABELS,
  CRITERION_POINTS,
  type EvaluationCriterion,
  type RiskScoreBreakdown,
} from '@fcare/shared-types';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { ALERT_LEVEL_LABELS } from '../../lib/labels';

/**
 * Phân rã điểm rủi ro DRS = R_L + R_A + R_C + R_H + R_P
 * (tài liệu "II.2 CƠ CHẾ ĐÁNH GIÁ ĐỘ KHẨN"). Chỉ hiển thị — mọi con số do API
 * `/evaluations/risk-score` tính, web không tự cộng lại. Nằm trong thẻ "Đánh
 * giá rủi ro" chung với phân tích AI: `useRiskScore` gọi một lần ở tab, badge
 * header và phần thân nhận cùng dữ liệu.
 */

const LEVEL_CLASSES: Record<number, string> = {
  1: 'border-fpt-blue/30 bg-fpt-blue/10 text-fpt-blue-700',
  2: 'border-warning/40 bg-warning/10 text-warning',
  3: 'border-fpt-orange/40 bg-fpt-orange-50 text-fpt-orange-600 animate-pulse ring-2 ring-fpt-orange/30 shadow-sm',
  4: 'border-danger/30 bg-danger/10 text-danger animate-pulse ring-2 ring-danger/40 shadow-sm',
};

/** Nhãn + class badge cho một cấp độ khẩn. Class trỏ vào token màu, không mã hex. */
export function levelBadge(level: number): { label: string; className: string } {
  return {
    label: `Cấp ${level} — ${ALERT_LEVEL_LABELS[level] ?? 'Không xác định'}`,
    className: `inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${
      LEVEL_CLASSES[level] ?? 'border-border bg-surface text-muted'
    }`,
  };
}

interface ComponentRow {
  key: keyof RiskScoreBreakdown['components'];
  symbol: string;
  label: string;
}

const COMPONENT_ROWS: readonly ComponentRow[] = [
  { key: 'RL', symbol: 'R_L', label: 'Khả năng học tập' },
  { key: 'RA', symbol: 'R_A', label: 'Thái độ học tập' },
  { key: 'RC', symbol: 'R_C', label: 'Chuyên cần' },
  { key: 'RH', symbol: 'R_H', label: 'Học tập / hành vi' },
  { key: 'RP', symbol: 'R_P', label: 'Vấn đề cá nhân' },
];

function criteriaExplanation(
  criteria: readonly EvaluationCriterion[],
  prefix: 'P_' | 'H_',
): string {
  const matched = criteria.filter((criterion) => criterion.startsWith(prefix));
  if (matched.length === 0) {
    return 'Không có tiêu chí nào được tích.';
  }
  return matched
    .map((criterion) => `${CRITERION_LABELS[criterion]} (+${CRITERION_POINTS[criterion]})`)
    .join('; ');
}

/** Giải thích từng dòng: ưu tiên câu chữ do API sinh trong `reasons`. */
function explain(data: RiskScoreBreakdown, row: ComponentRow): string {
  const fromReasons = (prefix: string) =>
    data.reasons.find((reason) => reason.startsWith(prefix));

  if (row.key === 'RL') {
    return fromReasons('Học lực') ?? 'Chưa có điểm học lực.';
  }
  if (row.key === 'RA') {
    return fromReasons('Thái độ') ?? 'Chưa có điểm thái độ.';
  }
  if (row.key === 'RC') {
    return fromReasons('Chuyên cần') ?? 'Chưa ghi nhận buổi vắng nào.';
  }
  return criteriaExplanation(data.triggeredCriteria, row.key === 'RP' ? 'P_' : 'H_');
}

export function useRiskScore(studentId: string, term: string) {
  return useQuery({
    queryKey: ['risk-score', studentId, term],
    queryFn: () =>
      apiFetch<RiskScoreBreakdown>(
        `/evaluations/risk-score?studentId=${studentId}&term=${encodeURIComponent(term)}`,
      ),
    enabled: term.length > 0,
  });
}

/** Chi tiết mở sẵn khi dữ liệu ép cấp: lý do nằm trong phần chi tiết, không được giấu. */
export function shouldExpandBreakdown(data: RiskScoreBreakdown): boolean {
  return data.dataForcedLevel > data.drsLevel;
}

/** Badge cấp theo DRS cho header thẻ — ghi rõ nguồn để không lẫn với cấp AI đề xuất. */
export function DrsLevelBadge({ data }: { data: RiskScoreBreakdown | undefined }) {
  if (!data || data.evaluationCount === 0) return null;
  const badge = levelBadge(data.drsLevel);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">Theo DRS</span>
      <span data-testid="drs-level" className={badge.className}>
        {badge.label}
      </span>
    </span>
  );
}

interface RiskScoreBreakdownProps {
  data: RiskScoreBreakdown | undefined;
  isLoading: boolean;
}

export function RiskScoreBreakdown({ data, isLoading }: RiskScoreBreakdownProps) {
  if (isLoading) {
    return <p className="text-sm text-muted">Đang tính điểm rủi ro…</p>;
  }
  if (!data) return null;
  if (data.evaluationCount === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
        Chưa có giảng viên nào nhận xét trong học kỳ này — thêm nhận xét để hệ thống tính DRS.
      </p>
    );
  }

  return (
    <details open={shouldExpandBreakdown(data)} className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-orange [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-ink">Điểm DRS</span>
          <span
            data-testid="drs-total"
            className="text-2xl font-bold tabular-nums text-fpt-blue-900"
          >
            {data.drs}
          </span>
          <span className="text-sm text-muted">trên {data.evaluationCount} nhận xét</span>
        </span>
        <span className="text-sm font-semibold text-fpt-blue transition-colors duration-[var(--duration-fast)] group-hover:text-fpt-blue-700">
          <span className="group-open:hidden">Xem cách tính ▾</span>
          <span className="hidden group-open:inline">Thu gọn ▴</span>
        </span>
      </summary>

      <p className="mt-2 text-sm text-muted">
        DRS = R_L + R_A + R_C + R_H + R_P, tính trên trung vị nhận xét của các giảng viên.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th className="py-2 pr-3">Thành phần</th>
              <th className="py-2 pr-3 text-right">Điểm</th>
              <th className="py-2">Vì sao</th>
            </tr>
          </thead>
          <tbody>
            {COMPONENT_ROWS.map((row) => (
              <tr key={row.key} className="border-b border-border/60 align-top">
                <td className="py-2 pr-3 font-medium text-ink">
                  {row.symbol} — {row.label}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink">
                  {data.components[row.key]}
                </td>
                <td className="py-2 whitespace-normal text-muted">{explain(data, row)}</td>
              </tr>
            ))}
            <tr className="align-top">
              <td className="py-2 pr-3 font-bold text-ink">DRS</td>
              <td className="py-2 pr-3 text-right text-base font-bold tabular-nums text-ink">
                {data.drs}
              </td>
              <td className="py-2 text-muted">
                Trung vị học lực {data.medianAcademic} · thái độ {data.medianAttitude}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {data.dataForcedLevel > data.drsLevel ? (
        <p className="mt-3 rounded-lg border border-fpt-orange/30 bg-fpt-orange-50 px-3 py-2 text-sm text-ink">
          Dữ liệu ép lên <strong>cấp {data.dataForcedLevel}</strong>: tất cả giảng viên đều ghi
          nhận vắng từ 3 buổi trở lên.
        </p>
      ) : null}
    </details>
  );
}
