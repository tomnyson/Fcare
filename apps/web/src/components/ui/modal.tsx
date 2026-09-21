'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Bề ngang hộp thoại. Mặc định 'md' cho form ngắn; 'lg' cho form hai cột;
 * 'xl' cho form nhận xét sinh viên — mô tả từng mức điểm dài, hẹp là phải cuộn
 * rất nhiều.
 */
type ModalSize = 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<ModalSize, string> = {
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  size?: ModalSize;
  /**
   * Tiêu đề + nút đóng đứng yên, chỉ phần thân cuộn — cho form dài. Con bên
   * trong có thể dùng `sticky top-0` để ghim thêm một khối ở đầu thân.
   */
  scrollBody?: boolean;
  children: ReactNode;
}

export function Modal({
  title,
  open,
  onClose,
  size = 'md',
  scrollBody = false,
  children,
}: ModalProps) {
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
        className={`w-full ${SIZE_CLASSES[size]} rounded-[var(--radius-card)] border-t-4 border-fpt-orange bg-white shadow-xl outline-none ${
          scrollBody ? 'flex max-h-[90vh] flex-col overflow-hidden' : 'max-h-[85vh] overflow-y-auto p-6'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`flex items-start justify-between gap-4 ${
            scrollBody ? 'shrink-0 px-6 pb-3 pt-5' : 'mb-4'
          }`}
        >
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
        {scrollBody ? (
          <div data-modal-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
