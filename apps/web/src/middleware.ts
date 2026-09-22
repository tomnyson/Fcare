import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'fcare_refresh';
const ADMIN_LOGIN_PATH = '/admin/login';
const ADMIN_ROOT_PATH = '/admin';

/**
 * Gác cổng UX: chưa có cookie phiên thì đưa về /login.
 * Việc kiểm tra quyền thực sự luôn nằm ở API (JWT + consent gate + CASL).
 */
export function middleware(request: NextRequest) {
  // Không có trang đăng nhập riêng cho admin — /login tự chuyển sang dashboard nếu còn phiên.
  if (request.nextUrl.pathname === ADMIN_LOGIN_PATH) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  // /admin không có trang riêng — các mục quản trị nằm ở /admin/users, /admin/mail…
  if (request.nextUrl.pathname === ADMIN_ROOT_PATH) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/students/:path*',
    '/class-sections/:path*',
    '/alerts/:path*',
    '/statistics/:path*',
    '/master-data/:path*',
    '/import-export/:path*',
    '/admin/:path*',
    '/consent',
    '/change-password',
  ],
};
