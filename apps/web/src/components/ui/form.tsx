import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

const FIELD_CLASSES =
  'w-full rounded-md border border-border bg-white px-3.5 py-2.5 text-sm text-ink ' +
  'placeholder:text-muted/70 transition-colors duration-[var(--duration-fast)] ' +
  'focus:border-fpt-blue focus:outline-2 focus:outline-fpt-blue/30 disabled:opacity-60';

export function Label({ className = '', ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`mb-1.5 block text-sm font-semibold text-ink ${className}`} {...rest} />
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_CLASSES} ${className}`} {...rest} />;
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD_CLASSES} ${className}`} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD_CLASSES} min-h-24 ${className}`} {...rest} />;
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) {
    return null;
  }
  return (
    <p role="alert" className="rounded-md bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-danger">
      {children}
    </p>
  );
}

export function FormSuccess({ children }: { children: ReactNode }) {
  if (!children) {
    return null;
  }
  return (
    <p role="status" className="rounded-md bg-success/10 px-3.5 py-2.5 text-sm font-medium text-success">
      {children}
    </p>
  );
}
