import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'fcare_refresh';

/**
 * Gác cổng UX: chưa có cookie phiên thì đưa về /login.
 * Việc kiểm tra quyền thực sự luôn nằm ở API (JWT + consent gate + CASL).
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
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
