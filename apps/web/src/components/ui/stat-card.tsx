import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: 'orange' | 'blue' | 'green' | 'red';
}

const ACCENT_CLASSES: Record<NonNullable<StatCardProps['accent']>, string> = {
  orange: 'border-t-fpt-orange',
  blue: 'border-t-fpt-blue',
  green: 'border-t-success',
  red: 'border-t-danger',
};

export function StatCard({ label, value, hint, accent = 'blue' }: StatCardProps) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-border ${ACCENT_CLASSES[accent]} border-t-4 bg-white p-5 shadow-[var(--shadow-card)]`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-fpt-blue-900">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
