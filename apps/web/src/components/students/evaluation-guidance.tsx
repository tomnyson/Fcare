'use client';

import { Badge } from '@fcare/ui-kit';
import {
  BAND_CLASSIFICATIONS,
  BAND_RANGE_LABELS,
  evaluationGuidance,
  type EvaluationScores,
} from '@fcare/shared-types';
import { ALERT_LEVEL_LABELS, ALERT_LEVEL_TONES } from '../../lib/labels';

/**
 * Hiển thị "Giải pháp gợi ý (*)" và độ khẩn ĐỀ XUẤT cho một lần nhận xét
 * (tài liệu II.1). Nhóm vấn đề được suy từ các tiêu chí đã tích
 * (`issueGroupsFromCriteria`), không còn hỏi giảng viên chọn tay.
 *
 * Mức ở đây tính như thể chỉ có mình bản nhận xét này; cấp chính thức của sinh
 * viên là DRS trên trung vị mọi giảng viên — xem `<RiskScorePanel/>`.
 */

function ActionList({ title, actions }: { title: string; actions: readonly string[] }) {
  if (actions.length === 0) {
    return null;
  }
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{title}</p>
      <ul className="mt-1.5 space-y-1 text-sm text-ink">
        {actions.map((action) => (
          <li key={action} className="flex gap-2">
            <span aria-hidden="true" className="text-fpt-orange">
              ➜
            </span>
            <span>{action}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SuggestedLevelBadge({ level }: { level: number }) {
  return (
    <Badge tone={ALERT_LEVEL_TONES[level] ?? 'info'}>
      Đề xuất mức {level} — {ALERT_LEVEL_LABELS[level] ?? level}
    </Badge>
  );
}

interface EvaluationGuidancePanelProps {
  scores: EvaluationScores;
  /** Nhắc người dùng bước tiếp theo (chỉ hiện trong form nhập đánh giá). */
  showHandoffHint?: boolean;
}

export function EvaluationGuidancePanel({
  scores,
  showHandoffHint = false,
}: EvaluationGuidancePanelProps) {
  const guidance = evaluationGuidance(scores);

  return (
    <section
      aria-label="Giải pháp gợi ý"
      className="rounded-lg border border-fpt-orange/30 bg-fpt-orange-50/60 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-ink">Giải pháp gợi ý</p>
        <span className="ml-auto">
          <SuggestedLevelBadge level={guidance.suggestedLevel} />
        </span>
      </div>

      {guidance.criterionLabels.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {guidance.criterionLabels.map((label) => (
            <li
              key={label}
              className="rounded-full border border-border bg-white px-2.5 py-0.5 text-xs text-ink"
            >
              {label}
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">
            Khả năng học tập — {BAND_CLASSIFICATIONS[guidance.academicBand]} (
            {BAND_RANGE_LABELS[guidance.academicBand]})
          </dt>
          <dd className="text-ink">{guidance.academicDescription}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">
            Thái độ học tập — {BAND_CLASSIFICATIONS[guidance.attitudeBand]} (
            {BAND_RANGE_LABELS[guidance.attitudeBand]})
          </dt>
          <dd className="text-ink">{guidance.attitudeDescription}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ActionList title="Giảng viên nên làm" actions={guidance.lecturerActions} />
        <ActionList title="CB phòng CTSV nên làm" actions={guidance.studentAffairsActions} />
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-fpt-blue-700">
          Vì sao đề xuất mức {guidance.suggestedLevel}?
        </summary>
        <ul className="mt-1.5 space-y-1 text-xs text-muted">
          {guidance.suggestedLevelReasons.map((reason) => (
            <li key={reason}>• {reason}</li>
          ))}
        </ul>
      </details>

      {showHandoffHint ? (
        <p className="mt-3 text-xs text-muted">
          Mức đề xuất chỉ tính trên bản nhận xét này. Cấp độ khẩn chính thức là điểm DRS gộp mọi
          giảng viên ở bảng phía trên — hệ thống không tự phát cảnh báo.
        </p>
      ) : null}
    </section>
  );
}

/** Bản rút gọn dùng trong ô của bảng danh sách đánh giá. */
export function EvaluationGuidanceCell({ scores }: { scores: EvaluationScores }) {
  const guidance = evaluationGuidance(scores);

  return (
    <details className="max-w-80">
      <summary className="cursor-pointer list-none">
        <SuggestedLevelBadge level={guidance.suggestedLevel} />
      </summary>
      <ul className="mt-2 space-y-1 whitespace-normal text-xs text-muted">
        {[...guidance.lecturerActions, ...guidance.studentAffairsActions].map((action) => (
          <li key={action}>• {action}</li>
        ))}
      </ul>
    </details>
  );
}
