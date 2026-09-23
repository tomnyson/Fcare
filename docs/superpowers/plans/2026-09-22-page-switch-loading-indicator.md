# Kế Hoạch Triển Khai Biểu Tượng Loading Khi Chuyển Trang (Page Switch Loading Indicator)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bổ sung biểu tượng loading và thanh tiến trình phản hồi tức thì khi người dùng chuyển trang (page navigation) trong ứng dụng Next.js, khắc phục hoàn toàn cảm giác "bị đơ/không phản hồi" khi nhấp vào menu sidebar, breadcrumbs, link danh sách hoặc điều hướng bằng mã nguồn.

**Architecture:**
- **Navigation Detection Core (`apps/web/src/lib/navigation-progress.ts`)**: Cung cấp hàm thuần `shouldTriggerNavigation` để phân tích các tương tác click chuột lên thẻ link `<a>`, lọc bỏ các trường hợp mở tab mới (`_blank`), phím bấm tắt (Ctrl/Cmd/Shift), link neo (`#hash`), hoặc link ngoại bộ (`https://...`). Tự động phát hiện khi nào cần kích hoạt trạng thái chuyển trang.
- **Loading Spinner Component (`apps/web/src/components/ui/loading-spinner.tsx`)**: Biểu tượng loading SVG chuẩn phong cách thiết kế của FCare (màu cam FPT, hỗ trợ kích thước `xs`/`sm`/`md`/`lg`, xoay mượt mà, hỗ trợ accessibility `role="status"` và tôn trọng cài đặt `prefers-reduced-motion`).
- **Global Navigation Progress (`apps/web/src/components/ui/navigation-progress-bar.tsx`)**: Component gắn ở Root Layout (`layout.tsx`) hiển thị thanh chạy tiến trình màu cam FPT (`h-[3px] bg-fpt-orange shadow-sm fixed top-0 inset-x-0 z-[9999]`) kèm listener bắt sự kiện click link nội bộ, kết hợp hook `usePathname()` / `useSearchParams()` để tự động kết thúc loading khi trang mới kết xuất. Cung cấp React Context `NavigationLoadingContext` để các component khác (như Topbar) có thể lắng nghe hoặc kích hoạt thủ công khi gọi `router.push`.
- **Topbar Integration (`apps/web/src/components/dashboard/topbar.tsx`)**: Hiển thị badge loading kèm icon xoay `"Đang chuyển trang…"` ngay trên thanh Topbar khi đang tải trang mới.
- **Next.js App Router Suspense (`(dashboard)/loading.tsx` & `app/loading.tsx`)**: Khai báo các file `loading.tsx` chuẩn của Next.js 15 App Router để hiển thị loading icon và thông báo đang tải khi React Suspense tải các chunk trang mới.

**Tech Stack:** Next.js 15 (App Router, Turbopack), React 19, TypeScript, TailwindCSS v4, Vitest.

## Global Constraints
- Không sử dụng thêm thư viện ngoài (zero-dependency: không cài thêm nprogress hay package tương tự).
- Không chặn hoặc làm hỏng hành vi điều hướng mặc định của Next.js và thẻ `<Link>`.
- Đảm bảo 100% test coverage cho logic phát hiện điều hướng `shouldTriggerNavigation` và component `LoadingSpinner`.
- Thời gian timeout an toàn tối đa 8 giây để tự động huỷ trạng thái loading nếu điều hướng bị huỷ hoặc tải file tải về.

---

### Task 1: Xây dựng logic phát hiện điều hướng nội bộ (`apps/web/src/lib/navigation-progress.ts`)

**Files:**
- Create: `apps/web/src/lib/navigation-progress.ts`
- Test: `apps/web/src/lib/navigation-progress.test.ts`

**Interfaces:**
- Produces:
  - `shouldTriggerNavigation(href: string | null | undefined, currentUrl: { origin: string; pathname: string; search: string }, options?: NavigationClickOptions): boolean`
  - `type NavigationClickOptions = { defaultPrevented?: boolean; button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; target?: string | null; }`

- [ ] **Step 1: Viết failing test trong `apps/web/src/lib/navigation-progress.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { shouldTriggerNavigation } from './navigation-progress';

describe('shouldTriggerNavigation', () => {
  const currentUrl = {
    origin: 'http://localhost:3000',
    pathname: '/dashboard',
    search: '',
  };

  it('kích hoạt với link nội bộ chuyển sang trang khác', () => {
    expect(shouldTriggerNavigation('/students', currentUrl)).toBe(true);
    expect(shouldTriggerNavigation('/alerts?level=FATAL', currentUrl)).toBe(true);
    expect(shouldTriggerNavigation('http://localhost:3000/admin/users', currentUrl)).toBe(true);
  });

  it('kích hoạt khi cùng pathname nhưng đổi query parameters', () => {
    expect(shouldTriggerNavigation('/dashboard?term=SP26', currentUrl)).toBe(true);
  });

  it('không kích hoạt khi trùng chính xác pathname và search hiện tại', () => {
    expect(shouldTriggerNavigation('/dashboard', currentUrl)).toBe(false);
    expect(shouldTriggerNavigation('http://localhost:3000/dashboard', currentUrl)).toBe(false);
  });

  it('không kích hoạt khi href rỗng hoặc link neo hash', () => {
    expect(shouldTriggerNavigation('', currentUrl)).toBe(false);
    expect(shouldTriggerNavigation(null, currentUrl)).toBe(false);
    expect(shouldTriggerNavigation('#top', currentUrl)).toBe(false);
    expect(shouldTriggerNavigation('/dashboard#section', currentUrl)).toBe(false);
  });

  it('không kích hoạt với link protocol đặc biệt (mailto, tel, javascript)', () => {
    expect(shouldTriggerNavigation('mailto:admin@fpt.edu.vn', currentUrl)).toBe(false);
    expect(shouldTriggerNavigation('tel:0123456789', currentUrl)).toBe(false);
    expect(shouldTriggerNavigation('javascript:void(0)', currentUrl)).toBe(false);
  });

  it('không kích hoạt với link ngoại bộ khác origin', () => {
    expect(shouldTriggerNavigation('https://google.com', currentUrl)).toBe(false);
    expect(shouldTriggerNavigation('https://fpt.edu.vn/students', currentUrl)).toBe(false);
  });

  it('không kích hoạt khi mở tab mới hoặc dùng phím bổ trợ (Ctrl, Cmd, Shift, Alt)', () => {
    expect(shouldTriggerNavigation('/students', currentUrl, { target: '_blank' })).toBe(false);
    expect(shouldTriggerNavigation('/students', currentUrl, { metaKey: true })).toBe(false);
    expect(shouldTriggerNavigation('/students', currentUrl, { ctrlKey: true })).toBe(false);
    expect(shouldTriggerNavigation('/students', currentUrl, { shiftKey: true })).toBe(false);
    expect(shouldTriggerNavigation('/students', currentUrl, { altKey: true })).toBe(false);
    expect(shouldTriggerNavigation('/students', currentUrl, { button: 1 })).toBe(false); // click chuột giữa
  });

  it('không kích hoạt khi sự kiện click đã bị defaultPrevented', () => {
    expect(shouldTriggerNavigation('/students', currentUrl, { defaultPrevented: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm test src/lib/navigation-progress.test.ts -- --run` (trong thư mục `apps/web`)
Expected: FAIL với lỗi "Cannot find module './navigation-progress'".

- [ ] **Step 3: Cài đặt code trong `apps/web/src/lib/navigation-progress.ts`**

```typescript
export interface NavigationClickOptions {
  defaultPrevented?: boolean;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target?: string | null;
}

export interface CurrentUrlContext {
  origin: string;
  pathname: string;
  search: string;
}

/**
 * Kiểm tra xem một hành động click vào liên kết có phải là điều hướng
 * nội bộ chuyển sang trang mới hay không để kích hoạt loading indicator.
 */
export function shouldTriggerNavigation(
  href: string | null | undefined,
  currentUrl: CurrentUrlContext,
  options?: NavigationClickOptions,
): boolean {
  if (!href) return false;
  if (options?.defaultPrevented) return false;
  if (options?.button !== undefined && options.button !== 0) return false;
  if (options?.metaKey || options?.ctrlKey || options?.shiftKey || options?.altKey) return false;
  if (options?.target && options.target !== '_self') return false;

  const trimmed = href.trim();
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('javascript:')
  ) {
    return false;
  }

  try {
    const targetUrl = new URL(trimmed, currentUrl.origin);
    // Khác tên miền gốc -> điều hướng ra ngoài, không quản lý loading
    if (targetUrl.origin !== currentUrl.origin) {
      return false;
    }
    // Trùng cả pathname lẫn search params -> cùng trang hiện tại, không tải lại
    if (targetUrl.pathname === currentUrl.pathname && targetUrl.search === currentUrl.search) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Chạy lại test để xác nhận pass**

Run: `npm test src/lib/navigation-progress.test.ts -- --run` (trong thư mục `apps/web`)
Expected: PASS (toàn bộ 7 test cases đều đạt).

- [ ] **Step 5: Commit task 1**

```bash
git add apps/web/src/lib/navigation-progress.ts apps/web/src/lib/navigation-progress.test.ts
git commit -m "feat(web): add shouldTriggerNavigation logic and tests"
```

---

### Task 2: Tạo component biểu tượng `LoadingSpinner` (`apps/web/src/components/ui/loading-spinner.tsx`)

**Files:**
- Create: `apps/web/src/components/ui/loading-spinner.tsx`
- Test: `apps/web/src/components/ui/loading-spinner.test.ts`

**Interfaces:**
- Produces:
  - `LoadingSpinner(props: LoadingSpinnerProps): ReactElement`
  - `LoadingSpinnerProps = { size?: 'xs' | 'sm' | 'md' | 'lg'; tone?: 'orange' | 'blue' | 'white' | 'muted'; className?: string; label?: string; }`

- [ ] **Step 1: Viết test cho `LoadingSpinner` trong `apps/web/src/components/ui/loading-spinner.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { LoadingSpinner } from './loading-spinner';

describe('LoadingSpinner', () => {
  it('render SVG với role="status" và nhãn accessibility', () => {
    const html = renderToString(<LoadingSpinner label="Đang tải dữ liệu…" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Đang tải dữ liệu…');
    expect(html).toContain('<svg');
  });

  it('áp dụng class kích thước và màu sắc tương ứng', () => {
    const htmlOrange = renderToString(<LoadingSpinner size="lg" tone="orange" />);
    expect(htmlOrange).toContain('h-8 w-8');
    expect(htmlOrange).toContain('text-fpt-orange');

    const htmlSmall = renderToString(<LoadingSpinner size="sm" tone="blue" />);
    expect(htmlSmall).toContain('h-4 w-4');
    expect(htmlSmall).toContain('text-fpt-blue');
  });

  it('chứa class xoay chuyển động animate-spin', () => {
    const html = renderToString(<LoadingSpinner />);
    expect(html).toContain('animate-spin');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm test src/components/ui/loading-spinner.test.ts -- --run` (trong thư mục `apps/web`)
Expected: FAIL với lỗi "Cannot find module './loading-spinner'".

- [ ] **Step 3: Cài đặt component `LoadingSpinner` trong `apps/web/src/components/ui/loading-spinner.tsx`**

```typescript
import type { ReactElement, SVGProps } from 'react';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type SpinnerTone = 'orange' | 'blue' | 'white' | 'muted';

export interface LoadingSpinnerProps extends SVGProps<SVGSVGElement> {
  size?: SpinnerSize;
  tone?: SpinnerTone;
  label?: string;
  className?: string;
}

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
};

const TONE_CLASSES: Record<SpinnerTone, string> = {
  orange: 'text-fpt-orange',
  blue: 'text-fpt-blue',
  white: 'text-white',
  muted: 'text-muted',
};

/**
 * Biểu tượng xoay loading đồng bộ với hệ thống icon SVG của FCare.
 */
export function LoadingSpinner({
  size = 'md',
  tone = 'orange',
  label = 'Đang tải…',
  className = '',
  ...props
}: LoadingSpinnerProps): ReactElement {
  return (
    <span role="status" className="inline-flex items-center justify-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`animate-spin motion-reduce:animate-none ${SIZE_CLASSES[size]} ${TONE_CLASSES[tone]} ${className}`}
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        <circle
          cx="12"
          cy="12"
          r="9.5"
          stroke="currentColor"
          strokeWidth="2.5"
          className="opacity-25"
        />
        <path
          d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="opacity-90"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
```

- [ ] **Step 4: Chạy lại test để xác nhận pass**

Run: `npm test src/components/ui/loading-spinner.test.ts -- --run` (trong thư mục `apps/web`)
Expected: PASS.

- [ ] **Step 5: Commit task 2**

```bash
git add apps/web/src/components/ui/loading-spinner.tsx apps/web/src/components/ui/loading-spinner.test.ts
git commit -m "feat(web): add LoadingSpinner component and tests"
```

---

### Task 3: Xây dựng Navigation Progress Provider & Bar (`apps/web/src/components/ui/navigation-progress-bar.tsx`)

**Files:**
- Create: `apps/web/src/components/ui/navigation-progress-bar.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Produces:
  - `NavigationProgressBar({ children }: { children?: ReactNode }): ReactElement`
  - `useNavigationLoading(): { isNavigating: boolean; startNavigation: () => void; finishNavigation: () => void }`
  - `triggerPageNavigation(): void` (hàm phát sự kiện điều hướng thủ công từ bất kỳ đâu)

- [ ] **Step 1: Cài đặt `apps/web/src/components/ui/navigation-progress-bar.tsx`**

```typescript
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

const NAVIGATION_START_EVENT = 'fcare:page-navigation-start';

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
  }, []);

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
```

- [ ] **Step 2: Đăng ký `NavigationProgressBar` vào `apps/web/src/app/layout.tsx`**

Sửa `apps/web/src/app/layout.tsx`:
Bọc `NavigationProgressBar` quanh `Providers`:

```typescript
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Be_Vietnam_Pro, Inter } from 'next/font/google';
import { Providers } from '../components/providers';
import { NavigationProgressBar } from '../components/ui/navigation-progress-bar';
import { FeedbackButton } from '../components/ui/feedback-button';
import './globals.css';

// ... (các cấu hình font & metadata giữ nguyên)

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${beVietnam.variable} ${inter.variable} antialiased`}>
        <Suspense fallback={null}>
          <NavigationProgressBar>
            <Providers>{children}</Providers>
            <FeedbackButton />
          </NavigationProgressBar>
        </Suspense>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Chạy Typecheck xác nhận không có lỗi kiểu**

Run: `npm run typecheck` (trong thư mục `apps/web`)
Expected: PASS (0 errors).

- [ ] **Step 4: Commit task 3**

```bash
git add apps/web/src/components/ui/navigation-progress-bar.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web): add NavigationProgressBar and register in RootLayout"
```

---

### Task 4: Tích hợp Loading Icon vào Topbar & Tạo các file `loading.tsx` (`(dashboard)/loading.tsx`)

**Files:**
- Modify: `apps/web/src/components/dashboard/topbar.tsx`
- Create: `apps/web/src/app/(dashboard)/loading.tsx`
- Create: `apps/web/src/app/loading.tsx`

**Interfaces:**
- Consumes:
  - `useNavigationLoading()` từ `apps/web/src/components/ui/navigation-progress-bar.tsx`
  - `LoadingSpinner` từ `apps/web/src/components/ui/loading-spinner.tsx`

- [ ] **Step 1: Thêm Loading Icon badge vào Topbar (`apps/web/src/components/dashboard/topbar.tsx`)**

Trong `Topbar`:
Nhập `useNavigationLoading` và `LoadingSpinner`. Khi `isNavigating === true`, hiển thị badge nổi bật bên cạnh lời chào `Xin chào, {user.fullName}`:

```tsx
// Thêm import:
import { useNavigationLoading } from '../ui/navigation-progress-bar';
import { LoadingSpinner } from '../ui/loading-spinner';

// Trong hàm Topbar:
export function Topbar({ user }: { user: AuthUser }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isNavigating } = useNavigationLoading();
  const [open, setOpen] = useState(false);
  // ... (giữ nguyên các hooks)

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-white px-4 py-3 max-md:sticky max-md:top-0 max-md:z-20 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNav user={user} />
        <p className="truncate text-sm font-semibold text-fpt-blue-900 max-sm:hidden">
          Xin chào, {user.fullName}
        </p>

        {/* Biểu tượng Loading khi chuyển trang */}
        {isNavigating ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-full border border-fpt-orange/30 bg-fpt-orange-50 px-2.5 py-1 text-xs font-semibold text-fpt-orange animate-in fade-in duration-200"
          >
            <LoadingSpinner size="xs" tone="orange" label="Đang chuyển trang…" />
            <span className="max-xs:hidden">Đang chuyển trang…</span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {/* ... (các nút trao đổi và thông báo giữ nguyên) */}
```

- [ ] **Step 2: Tạo component Next.js App Router `apps/web/src/app/(dashboard)/loading.tsx`**

```tsx
import { LoadingSpinner } from '../../components/ui/loading-spinner';

export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Đang tải dữ liệu trang"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 py-12"
    >
      <div className="rounded-full bg-fpt-orange-50 p-4 border border-fpt-orange/20 shadow-xs">
        <LoadingSpinner size="lg" tone="orange" label="Đang tải trang…" />
      </div>
      <p className="font-display text-base font-semibold text-fpt-blue-900">
        Đang tải dữ liệu trang…
      </p>
      <p className="text-xs text-muted">Vui lòng chờ trong giây lát</p>
    </div>
  );
}
```

- [ ] **Step 3: Tạo component Next.js Root `apps/web/src/app/loading.tsx`**

```tsx
import { LoadingSpinner } from '../components/ui/loading-spinner';

export default function RootLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Đang tải trang"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface p-6"
    >
      <LoadingSpinner size="lg" tone="orange" label="Đang tải…" />
      <p className="font-display text-sm font-semibold text-fpt-blue-900">
        Đang chuẩn bị trang…
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Chạy kiểm tra Typecheck và Vitest**

Run: `npm run typecheck && npm test -- --run` (trong thư mục `apps/web`)
Expected: Toàn bộ pass (0 errors, tất cả test cases đạt).

- [ ] **Step 5: Commit task 4**

```bash
git add apps/web/src/components/dashboard/topbar.tsx apps/web/src/app/\(dashboard\)/loading.tsx apps/web/src/app/loading.tsx
git commit -m "feat(web): add loading badge in Topbar and App Router loading.tsx files"
```

---

### Task 5: Xác thực tích hợp và kiểm tra trải nghiệm thực tế

**Files:**
- Test: Toàn bộ hệ thống test suite

- [ ] **Step 1: Chạy kiểm tra Linting**

Run: `npm run lint` (trong thư mục `apps/web`)
Expected: Không phát sinh bất kỳ lỗi lint mới nào.

- [ ] **Step 2: Chạy kiểm tra Production Build**

Run: `npm run build` (trong thư mục `apps/web`)
Expected: `next build --turbopack` biên dịch thành công 100% tất cả các trang, bao gồm các file `loading.tsx`.

- [ ] **Step 3: Kiểm tra hành vi chuyển trang trên trình duyệt dev server**
1. Mở `http://localhost:3000/dashboard`.
2. Bấm chuyển trang qua menu Sidebar (ví dụ: sang `/students`, `/alerts`, `/admin/monitoring`).
3. Xác nhận:
   - Thanh tiến trình màu cam `h-[3px]` ở mép trên cùng màn hình lập tức xuất hiện và chạy mượt mà.
   - Badge loading kèm icon xoay `"Đang chuyển trang…"` xuất hiện ngay lập tức trên Topbar.
   - Khi trang đích nạp xong, thanh tiến trình đạt 100% và biến mất mượt mà, badge loading ẩn đi.
   - Khi nhấp link mở tab mới (Ctrl+click / chuột giữa), không kích hoạt loading.

- [ ] **Step 4: Commit hoàn tất**

```bash
git commit --allow-empty -m "chore(web): verify page switch loading indicator feature"
```
