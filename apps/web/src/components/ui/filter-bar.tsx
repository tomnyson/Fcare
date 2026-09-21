'use client';

import {
  createContext,
  useContext,
  useId,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Input, Label } from './form';

/**
 * Trạng thái thu gọn lưới ô lọc trên điện thoại. Dưới `sm` lưới mặc định ẩn để
 * danh sách hiện ngay màn hình đầu; từ `sm` trở lên lưới luôn hiện và nút bật/tắt
 * biến mất — desktop không đổi gì.
 */
interface FilterToggleState {
  open: boolean;
  toggle: () => void;
  gridId: string;
  activeCount: number;
}

const FilterToggleContext = createContext<FilterToggleState | null>(null);

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
  activeCount = 0,
  children,
}: {
  label: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** Số bộ lọc phụ đang bật — hiện trên nút để biết đang lọc dù lưới đang ẩn. */
  activeCount?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const gridId = useId();
  const state: FilterToggleState = {
    open,
    toggle: () => setOpen((value) => !value),
    gridId,
    activeCount,
  };

  return (
    <section role="search" aria-label={label} className="mb-5">
      <form
        onSubmit={onSubmit}
        className="group/filter overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-raised shadow-[var(--shadow-card)]"
      >
        <FilterToggleContext.Provider value={state}>{children}</FilterToggleContext.Provider>
      </form>
    </section>
  );
}

/** Nút bật/tắt lưới ô lọc — chỉ hiện dưới `sm`. */
function FilterToggle({ className = '' }: { className?: string }) {
  const state = useContext(FilterToggleContext);
  if (!state) return null;
  const { open, toggle, gridId, activeCount } = state;

  return (
    <button
      type="button"
      data-filter-toggle
      onClick={toggle}
      aria-expanded={open}
      aria-controls={gridId}
      className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm font-semibold transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fpt-blue sm:hidden ${
        open || activeCount > 0
          ? 'border-fpt-blue/30 bg-fpt-blue/5 text-fpt-blue-700'
          : 'border-border bg-white text-ink hover:bg-surface'
      } ${className}`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6h16M7 12h10M10 18h4" />
      </svg>
      Bộ lọc
      {activeCount > 0 && (
        <>
          <span
            aria-hidden
            className="grid min-w-5 place-items-center rounded-full bg-fpt-orange px-1.5 text-xs leading-5 text-white"
          >
            {activeCount}
          </span>
          <span className="sr-only">, {activeCount} bộ lọc đang bật</span>
        </>
      )}
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className={`size-3.5 transition-transform duration-[var(--duration-fast)] motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </button>
  );
}

/**
 * Hàng trên cùng: ô tìm kiếm rộng + nút hành động, nền hơi lõm để tách tầng.
 * Dưới `sm`: ô tìm kiếm chiếm cả dòng, dòng dưới là [Tìm kiếm][Bộ lọc] — đúng
 * thứ tự DOM nên thứ tự Tab khớp với thứ tự nhìn thấy.
 */
export function FilterSearchRow({ children }: { children: ReactNode }) {
  const open = useContext(FilterToggleContext)?.open ?? true;
  return (
    <div
      data-filter-search-row
      className={`flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-3 sm:flex-nowrap max-sm:[&>button[type=submit]]:flex-1 max-sm:[&>button[type=submit]]:whitespace-nowrap max-sm:[&>button[type=submit]]:px-3 ${
        open ? '' : 'max-sm:border-b-0'
      }`}
    >
      {children}
      <FilterToggle />
    </div>
  );
}

/** Ô tìm kiếm có kính lúp — biểu tượng vẽ tay để không lệ thuộc icon lib. */
export function FilterSearchInput({
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative min-w-0 flex-1 max-sm:basis-full">
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
  const state = useContext(FilterToggleContext);
  const open = state?.open ?? true;
  return (
    <>
      {/* Trang không có hàng tìm kiếm (thống kê, chăm sóc) cần dải nút riêng.
          Ẩn bằng CSS :has() thay vì dò kiểu con — dò kiểu vỡ khi Fast Refresh
          hoặc khi trang bọc hàng tìm kiếm trong wrapper. */}
      {state && (
        <div
          data-filter-grid-toggle
          className={`px-4 py-3 group-has-[[data-filter-search-row]]/filter:hidden sm:hidden ${
            open ? 'border-b border-border' : ''
          }`}
        >
          <FilterToggle className="w-full" />
        </div>
      )}
      <div
        id={state?.gridId}
        data-filter-grid
        className={`grid grid-cols-1 gap-x-4 gap-y-3.5 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 ${
          open ? '' : 'max-sm:hidden'
        }`}
      >
        {children}
      </div>
    </>
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
