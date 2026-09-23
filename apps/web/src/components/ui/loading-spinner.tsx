import type { ReactElement, SVGProps } from 'react';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type SpinnerTone = 'orange' | 'blue' | 'white' | 'muted';

export interface LoadingSpinnerProps extends SVGProps<SVGSVGElement> {
  size?: SpinnerSize;
  tone?: SpinnerTone;
  label?: string;
  className?: string;
}

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
};

const TONE_CLASSES: Record<SpinnerTone, string> = {
  orange: 'text-fpt-orange',
  blue: 'text-fpt-blue',
  white: 'text-white',
  muted: 'text-muted',
};

/**
 * Biểu tượng xoay loading đồng bộ với hệ thống icon SVG của FCare.
 */
export function LoadingSpinner({
  size = 'md',
  tone = 'orange',
  label = 'Đang tải…',
  className = '',
  ...props
}: LoadingSpinnerProps): ReactElement {
  return (
    <span role="status" className="inline-flex items-center justify-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`animate-spin motion-reduce:animate-none ${SIZE_CLASSES[size]} ${TONE_CLASSES[tone]} ${className}`}
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        <circle
          cx="12"
          cy="12"
          r="9.5"
          stroke="currentColor"
          strokeWidth="2.5"
          className="opacity-25"
        />
        <path
          d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="opacity-90"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
