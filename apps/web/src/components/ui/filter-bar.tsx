'use client';

import type { FormEvent, InputHTMLAttributes, ReactNode } from 'react';
import { Input, Label } from './form';

/**
 * Khung bộ lọc dùng chung cho các trang danh sách (sinh viên, cảnh báo).
 *
 * Bố cục cố ý tách làm hai tầng thay vì để mọi ô cùng `flex-wrap`: hàng tìm
 * kiếm nổi lên trên như hành động chính, lưới bên dưới có số cột cố định nên
 * các ô luôn thẳng hàng — không còn cảnh một ô lẻ rơi xuống dòng cuối cạnh nút
 * bấm. Tầng thứ ba là dải chip cho biết đang lọc những gì và bỏ từng cái một.
 */
export function FilterBar({
  label,
  onSubmit,
  children,
}: {
  label: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <section role="search" aria-label={label} className="mb-5">
      <form
        onSubmit={onSubmit}
        className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-raised shadow-[var(--shadow-card)]"
      >
        {children}
      </form>
    </section>
  );
}

/** Hàng trên cùng: ô tìm kiếm rộng + nút hành động, nền hơi lõm để tách tầng. */
export function FilterSearchRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 sm:flex-row sm:items-center">
      {children}
    </div>
  );
}

/** Ô tìm kiếm có kính lúp — biểu tượng vẽ tay để không lệ thuộc icon lib. */
export function FilterSearchInput({
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative flex-1">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
      <Input className={`h-11 pl-10 ${className}`} {...rest} />
    </div>
  );
}

/**
 * Lưới các ô lọc phụ: 4 cột cố định, ô nào cần rộng thì tự `col-span-2`. Nhờ
 * đếm được số ô nên hàng cuối luôn đầy — đây chính là chỗ trước kia bị lệch.
 */
export function FilterGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

/** Một ô lọc: nhãn nhỏ, mờ — giá trị đang chọn mới là chữ đậm người đọc quét. */
export function FilterField({
  label,
  htmlFor,
  className = '',
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <Label htmlFor={htmlFor} className="!mb-1 text-xs font-semibold text-muted">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Dải chân: tóm tắt bộ lọc đang bật, chip bỏ lọc, thông báo lỗi danh mục. */
export function FilterFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-surface px-4 py-2.5">
      {children}
    </div>
  );
}

/** Chip một bộ lọc đang bật; bấm × chỉ gỡ đúng bộ lọc đó. */
export function FilterChip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-fpt-blue/20 bg-fpt-blue/5 py-1 pl-3 pr-1 text-xs text-ink">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Bỏ lọc ${label}: ${value}`}
        className="grid size-5 place-items-center rounded-full text-muted transition-colors duration-[var(--duration-fast)] hover:bg-fpt-blue/10 hover:text-fpt-blue-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fpt-blue"
      >
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="m4 4 8 8M12 4l-8 8" />
        </svg>
      </button>
    </span>
  );
}
