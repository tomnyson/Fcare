import type { ImportProgressTone, ImportProgressView } from '../../lib/import-progress';

const BAR_TONE: Record<ImportProgressTone, string> = {
  idle: 'bg-fpt-blue',
  running: 'bg-fpt-blue',
  done: 'bg-success',
  error: 'bg-danger',
};

/**
 * Thanh tiến trình import. Chỉ đoạn gửi file là % thật — danh sách bước mô tả
 * việc hệ thống làm, không đánh dấu bước máy chủ đang chạy (web không biết).
 */
export function ImportProgress({ view }: { view: ImportProgressView }) {
  if (view.tone === 'idle') {
    return null;
  }
  return (
    <div className="space-y-2 rounded-md bg-fpt-blue/5 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{view.label}</span>
        <span className="font-semibold tabular-nums text-ink">{`${view.percent}%`}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Tiến trình import"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.percent}
        aria-valuetext={view.valueText}
        className="h-2 overflow-hidden rounded-full bg-fpt-blue/10"
      >
        <div
          className={`h-full origin-left rounded-full transition-transform duration-[var(--duration-normal)] ease-out motion-reduce:transition-none ${BAR_TONE[view.tone]}`}
          style={{ transform: `scaleX(${view.percent / 100})` }}
        />
      </div>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {view.steps.map((step) => (
          <li key={step.label} className={step.done ? 'text-success' : 'text-muted'}>
            {`${step.done ? '✓' : '•'} ${step.label}`}
          </li>
        ))}
      </ol>
    </div>
  );
}
