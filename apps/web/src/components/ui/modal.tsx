'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Bề ngang hộp thoại. Mặc định 'md' cho form ngắn; 'lg' dành cho form nhiều
 * cột (nhận xét sinh viên) để hai nhóm radio không bị bóp thành cột hẹp.
 */
type ModalSize = 'md' | 'lg';

const SIZE_CLASSES: Record<ModalSize, string> = {
  md: 'max-w-lg',
  lg: 'max-w-3xl',
};

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  size?: ModalSize;
  children: ReactNode;
}

export function Modal({ title, open, onClose, size = 'md', children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  /** Phần tử đang focus lúc dialog mở — phải trả focus về đúng chỗ này khi đóng. */
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Focus vào dialog khi mở và trả focus về nút kích hoạt khi đóng — nếu không,
  // người dùng bàn phím bị rơi về đầu trang sau mỗi lần đóng hộp thoại.
  useEffect(() => {
    if (!open) {
      return;
    }
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      triggerRef.current?.focus();
      triggerRef.current = null;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-fpt-blue-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`max-h-[85vh] w-full ${SIZE_CLASSES[size]} overflow-y-auto rounded-[var(--radius-card)] border-t-4 border-fpt-orange bg-white p-6 shadow-xl outline-none`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-fpt-blue-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-md p-1 text-muted transition-colors hover:bg-fpt-orange-50 hover:text-ink"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
