import type { ReactNode } from 'react';
import { Skeleton } from './skeleton';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: 'orange' | 'blue' | 'green' | 'red';
  isLoading?: boolean;
}

const ACCENT_CLASSES: Record<NonNullable<StatCardProps['accent']>, string> = {
  orange: 'border-t-fpt-orange',
  blue: 'border-t-fpt-blue',
  green: 'border-t-success',
  red: 'border-t-danger',
};

export function StatCard({
  label,
  value,
  hint,
  accent = 'blue',
  isLoading,
}: StatCardProps) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-border ${ACCENT_CLASSES[accent]} border-t-4 bg-white p-5 shadow-[var(--shadow-card)]`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      {isLoading ? (
        // Cao đúng bằng dòng số thật (text-3xl) để thẻ không đổi chiều cao khi số về.
        <Skeleton className="mt-2 h-9 w-24" />
      ) : (
        <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-fpt-blue-900">
          {value}
        </p>
      )}
      {isLoading ? (
        <Skeleton className="mt-1 h-4 w-32" />
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
