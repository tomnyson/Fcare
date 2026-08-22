import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold ' +
  'transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-fpt-orange text-white hover:bg-fpt-orange-600 focus-visible:outline-fpt-orange',
  secondary:
    'bg-fpt-blue text-white hover:bg-fpt-blue-700 focus-visible:outline-fpt-blue',
  ghost:
    'border border-border bg-transparent text-ink hover:bg-fpt-orange-50 focus-visible:outline-fpt-blue',
  danger: 'bg-danger text-white hover:brightness-90 focus-visible:outline-danger',
};

export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  return (
    <button className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
