import type { ReactNode } from 'react';

/**
 * Khối giữ chỗ trong lúc tải. Nhấp nháy bằng `opacity` (chạy trên compositor)
 * và tự tắt khi người dùng bật giảm chuyển động.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block max-w-full animate-pulse rounded bg-border motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * Bọc một vùng đang tải. Giữ `aria-busy` để trình đọc màn hình biết nội dung
 * chưa sẵn sàng thay vì đọc khung rỗng.
 */
export function SkeletonBlock({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy aria-label={label} className={className}>
      {children}
    </div>
  );
}
