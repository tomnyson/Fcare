import type { ReactNode } from 'react';

type BadgeTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export interface BadgeProps {
  tone?: BadgeTone;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  info: 'bg-fpt-blue/10 text-fpt-blue-700',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-border/50 text-muted',
};

const DOT_PULSE_COLORS: Record<BadgeTone, string> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-fpt-blue',
  success: 'bg-success',
  neutral: 'bg-muted',
};

const PULSE_CLASSES: Record<BadgeTone, string> = {
  danger: 'badge-pulse-danger animate-pulse ring-2 ring-danger/40 shadow-sm',
  warning: 'badge-pulse-warning animate-pulse ring-2 ring-warning/40 shadow-sm',
  info: 'animate-pulse ring-2 ring-fpt-blue/40 shadow-sm',
  success: 'animate-pulse ring-2 ring-success/40 shadow-sm',
  neutral: 'animate-pulse ring-2 ring-muted/40 shadow-sm',
};

export function Badge({
  tone = 'neutral',
  pulse = false,
  className = '',
  children,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${TONE_CLASSES[tone]} ${
        pulse ? PULSE_CLASSES[tone] : ''
      } ${className}`.trim()}
    >
      {pulse && (
        <span className="relative mr-1.5 flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${DOT_PULSE_COLORS[tone]}`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${DOT_PULSE_COLORS[tone]}`}
          />
        </span>
      )}
      {children}
    </span>
  );
}
