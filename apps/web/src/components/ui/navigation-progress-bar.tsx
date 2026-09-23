'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { shouldTriggerNavigation } from '../../lib/navigation-progress';

interface NavigationLoadingContextValue {
  isNavigating: boolean;
  startNavigation: () => void;
  finishNavigation: () => void;
}

const NavigationLoadingContext = createContext<NavigationLoadingContextValue>({
  isNavigating: false,
  startNavigation: () => undefined,
  finishNavigation: () => undefined,
});

export function useNavigationLoading() {
  return useContext(NavigationLoadingContext);
}

export const NAVIGATION_START_EVENT = 'fcare:page-navigation-start';

/** Hàm gọi thủ công để kích hoạt trạng thái loading trước khi router.push() */
export function triggerPageNavigation() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NAVIGATION_START_EVENT));
  }
}

export function NavigationProgressBar({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const finishNavigation = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }

    setProgress(100);
    const timeout = setTimeout(() => {
      setVisible(false);
      setIsNavigating(false);
      setProgress(0);
    }, 250);

    return () => clearTimeout(timeout);
  }, []);

  const startNavigation = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);

    setIsNavigating(true);
    setVisible(true);
    setProgress(15);

    // Mô phỏng tiến trình tăng dần mượt mà
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) return prev;
        const step = Math.max(1, (90 - prev) * 0.15);
        return Math.min(85, prev + step);
      });
    }, 150);

    // Timeout an toàn sau 8 giây tự huỷ nếu trang không chuyển
    safetyTimeoutRef.current = setTimeout(() => {
      finishNavigation();
    }, 8000);
  }, [finishNavigation]);

  // Khi URL (pathname hoặc query params) thay đổi -> hoàn tất chuyển trang
  useEffect(() => {
    finishNavigation();
  }, [pathname, searchParams, finishNavigation]);

  // Lắng nghe sự kiện click thẻ <a> trên toàn trang
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = (event.target as HTMLElement).closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      const currentUrl = {
        origin: window.location.origin,
        pathname: window.location.pathname,
        search: window.location.search,
      };

      if (
        shouldTriggerNavigation(href, currentUrl, {
          defaultPrevented: event.defaultPrevented,
          button: event.button,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          target: target.target,
        })
      ) {
        startNavigation();
      }
    }

    function handleManualEvent() {
      startNavigation();
    }

    function handlePopState() {
      startNavigation();
    }

    document.addEventListener('click', handleClick, { capture: true });
    window.addEventListener(NAVIGATION_START_EVENT, handleManualEvent);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener(NAVIGATION_START_EVENT, handleManualEvent);
      window.removeEventListener('popstate', handlePopState);
      if (timerRef.current) clearInterval(timerRef.current);
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    };
  }, [startNavigation]);

  return (
    <NavigationLoadingContext.Provider value={{ isNavigating, startNavigation, finishNavigation }}>
      {visible ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px] overflow-hidden"
        >
          <div
            className="h-full bg-fpt-orange shadow-[0_0_10px_var(--color-fpt-orange)] transition-all duration-200 ease-out"
            style={{ width: `${progress}%`, opacity: visible ? 1 : 0 }}
          />
        </div>
      ) : null}
      {children}
    </NavigationLoadingContext.Provider>
  );
}
