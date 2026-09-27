'use client';

import { ALERT_LEVEL_LABELS } from '../../lib/labels';

const LEVELS = [1, 2, 3, 4] as const;

/**
 * Màu theo cấp, cùng họ màu badge cảnh báo (`ALERT_LEVEL_TONES`): 1 xanh → 2 vàng →
 * 3 cam → 4 đỏ. Chưa chọn: wash nhạt + chữ màu cấp; đang chọn: wash đậm hơn, viền
 * màu cấp và vòng sáng — chữ giữ màu tối để đủ tương phản trên nền vàng/cam.
 */
const LEVEL_TONE: Record<number, string> = {
  1: 'border-fpt-blue/30 bg-fpt-blue/10 text-fpt-blue-700 hover:border-fpt-blue peer-checked:border-fpt-blue peer-checked:bg-fpt-blue/20 peer-checked:ring-fpt-blue/30',
  2: 'border-warning/40 bg-warning/10 text-fpt-blue-900 hover:border-warning peer-checked:border-warning peer-checked:bg-warning/25 peer-checked:ring-warning/30',
  3: 'border-fpt-orange/40 bg-fpt-orange-50 text-fpt-orange-600 hover:border-fpt-orange peer-checked:border-fpt-orange peer-checked:bg-fpt-orange/20 peer-checked:ring-fpt-orange/30',
  4: 'border-danger/30 bg-danger/10 text-danger hover:border-danger peer-checked:border-danger peer-checked:bg-danger/20 peer-checked:ring-danger/30',
};

interface AlertLevelPickerProps {
  value: number;
  suggestedLevel: number;
  onChange: (level: number) => void;
}

/**
 * Hệ thống đề xuất mức từ điểm vừa nhập; giảng viên được chọn mức khác.
 * API vẫn lấy max(mức chọn, DRS học kỳ) nên chọn thấp hơn DRS sẽ bị tự nâng.
 */
export function AlertLevelPicker({ value, suggestedLevel, onChange }: AlertLevelPickerProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-fpt-blue-900">Mức cảnh báo sẽ phát</legend>
      <div role="radiogroup" aria-label="Mức cảnh báo" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LEVELS.map((level) => (
          <label key={level} className="relative cursor-pointer">
            <input
              type="radio"
              name="alertLevel"
              value={level}
              checked={value === level}
              onChange={() => onChange(level)}
              className="peer sr-only"
            />
            <span
              className={`flex min-h-11 flex-col justify-center rounded-lg border-2 px-3 py-2 text-sm transition-[background-color,border-color,box-shadow] duration-150 peer-checked:shadow-card peer-checked:ring-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fpt-orange motion-reduce:transition-none ${LEVEL_TONE[level]}`}
            >
              <span className="flex items-center justify-between gap-2 font-bold">
                Mức {level}
                {value === level ? <span aria-hidden="true">✓</span> : null}
              </span>
              <span className="text-xs">
                {ALERT_LEVEL_LABELS[level]}
                {level === suggestedLevel ? ' · Đề xuất' : ''}
              </span>
            </span>
          </label>
        ))}
      </div>
      {value !== suggestedLevel ? (
        <p className="text-xs text-ink">
          Bạn chọn mức {value}, hệ thống đề xuất mức {suggestedLevel} — lý do cảnh báo sẽ ghi lại
          lựa chọn này. Nếu điểm DRS học kỳ của sinh viên cao hơn, hệ thống sẽ tự nâng lên mức đó.
        </p>
      ) : null}
      {value === 4 ? (
        <p className="text-xs text-muted">
          Mức 4 — Khẩn cấp cần lý do tối thiểu 40 ký tự; hãy ghi rõ tình huống ở ô nhận xét.
        </p>
      ) : null}
    </fieldset>
  );
}
