'use client';

import { Badge } from '@fcare/ui-kit';
import { evaluationGuidance, type EvaluationScores } from '@fcare/shared-types';
import { ALERT_LEVEL_LABELS, ALERT_LEVEL_TONES } from '../../lib/labels';

/**
 * Hiển thị "Giải pháp gợi ý (*)" và độ khẩn ĐỀ XUẤT cho một lần đánh giá
 * (tài liệu II.1). Đây chỉ là gợi ý — hệ thống không tự phát cảnh báo, người
 * dùng vẫn phải tự bấm "Phát cảnh báo" và nhập lý do.
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

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">
            Khả năng học tập ({guidance.academicBand})
          </dt>
          <dd className="text-ink">{guidance.academicDescription}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">
            Thái độ học tập ({guidance.attitudeBand})
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
          Mức đề xuất chỉ để tham khảo. Muốn thông báo cho Trưởng bộ môn / Đào tạo / CTSV thì sau
          khi lưu, sang tab <strong>Cảnh báo</strong> để phát cảnh báo — hệ thống không tự phát.
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
