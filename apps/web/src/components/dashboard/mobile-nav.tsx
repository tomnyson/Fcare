'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { AuthUser } from '../../lib/types';
import { IconClose, IconMenu } from './nav-icons';
import { SidebarPanel } from './sidebar';

const DRAWER_ID = 'mobile-nav-drawer';
// Từ md trở lên đã có sidebar cố định — menu trượt còn mở thì đóng lại.
const DESKTOP_QUERY = '(min-width: 48rem)';

/**
 * Menu trượt cho điện thoại (< md). Dùng <dialog> modal gốc để có sẵn bẫy
 * focus, Esc, nền phía sau bị inert và trả focus về nút mở khi đóng — không
 * phải tự viết lại những thứ đó.
 */
export function MobileNav({ user }: { user: AuthUser }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);

  // Đổi trang (kể cả nút Back) → đóng menu. Điều chỉnh state ngay lúc render
  // thay vì trong effect để không render thừa một lượt.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  function onDialogClick(event: MouseEvent<HTMLDialogElement>) {
    const target = event.target as Element;
    // Bấm vào nền mờ (chính thẻ dialog) hoặc vào một liên kết → đóng. Liên kết
    // tới đúng trang đang mở không đổi pathname nên phải bắt ở đây.
    if (target === event.currentTarget || target.closest('a')) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mở menu"
        aria-expanded={open}
        aria-controls={DRAWER_ID}
        className="-ml-1.5 rounded-md p-1.5 text-fpt-blue-900 transition-colors hover:bg-fpt-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-blue md:hidden"
      >
        <IconMenu className="h-6 w-6" />
      </button>

      <dialog
        ref={dialogRef}
        id={DRAWER_ID}
        data-mobile-nav
        aria-label="Menu điều hướng"
        onClose={() => setOpen(false)}
        onClick={onDialogClick}
        className="fixed inset-y-0 left-0 m-0 h-[100dvh] max-h-none w-[min(20rem,85vw)] max-w-none -translate-x-full bg-transparent p-0 transition-[translate,overlay,display] transition-discrete duration-200 ease-out backdrop:bg-fpt-blue-900/0 backdrop:transition-[background-color,overlay,display] backdrop:transition-discrete backdrop:duration-200 open:translate-x-0 open:backdrop:bg-fpt-blue-900/50 starting:open:-translate-x-full starting:open:backdrop:bg-fpt-blue-900/0 motion-reduce:transition-none motion-reduce:backdrop:transition-none md:hidden"
      >
        <div data-nav="drawer" className="flex h-full flex-col bg-fpt-blue-900 text-white shadow-2xl">
          <SidebarPanel
            user={user}
            headerAction={
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng menu"
                className="shrink-0 rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fpt-orange/70"
              >
                <IconClose className="h-5 w-5" />
              </button>
            }
          />
        </div>
      </dialog>
    </>
  );
}
