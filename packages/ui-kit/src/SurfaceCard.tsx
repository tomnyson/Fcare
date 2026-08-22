import type { HTMLAttributes, ReactNode } from 'react';

export interface SurfaceCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function SurfaceCard({ className = '', children, ...rest }: SurfaceCardProps) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-border bg-white p-6 shadow-[var(--shadow-card)] ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
